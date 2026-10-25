import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAntigravityTerminalParser } from './terminal';
import { verifiedTranscript } from './source';

it('unwraps Antigravity user requests and hides only their added metadata', () => {
  const row = { step_index: 1, type: 'USER_INPUT', source: 'USER_EXPLICIT', status: 'DONE', created_at: '2026-10-25T00:00:00Z' };
  const parse = (content: string, extra = {}) => createAntigravityTerminalParser().push(JSON.stringify({ ...row, content, ...extra }))[0];
  const wrapped = '<USER_REQUEST>\nXin chào\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nLocal time: 2026-10-25\n</ADDITIONAL_METADATA>';
  expect(parse(wrapped)).toHaveProperty('text', 'Xin chào');
  expect(parse('<USER_REQUEST>\n  code();\n</USER_REQUEST>')).toHaveProperty('text', '  code();');
  expect(parse('<USER_REQUEST>\nA\n\nB\n</USER_REQUEST>\n<ADDITIONAL_METADATA>one</ADDITIONAL_METADATA>\n<ADDITIONAL_METADATA>two</ADDITIONAL_METADATA>')).toHaveProperty('text', 'A\n\nB');
  const literal = 'Explain <ADDITIONAL_METADATA>example</ADDITIONAL_METADATA>';
  expect(parse(`<USER_REQUEST>\n${literal}\n</USER_REQUEST>`)).toHaveProperty('text', literal);
  expect(parse(literal)).toHaveProperty('text', literal);
  expect(parse(wrapped, { type: 'PLANNER_RESPONSE', source: 'MODEL' })).toHaveProperty('text', wrapped);
});

it('reads verified replies and user messages, masks secrets and ignores unknown/incomplete records', () => {
  const parser = createAntigravityTerminalParser();
  const row = { step_index: 1, type: 'USER_INPUT', source: 'USER_EXPLICIT', status: 'DONE', created_at: '2026-10-25T00:00:00Z', content: 'Xin chào' };
  expect(parser.push('bad')).toEqual([]);
  expect(parser.push(JSON.stringify({ ...row, status: 'PENDING' }))).toEqual([]);
  expect(parser.push(JSON.stringify(row))).toEqual([{ kind: 'user', id: 'agy:1:user', at: Date.parse(row.created_at), text: 'Xin chào' }]);
  expect(parser.push(JSON.stringify(row))).toEqual([]);
  const secret = `sk-${'a'.repeat(48)}`;
  const reply = parser.push(JSON.stringify({ ...row, step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', content: `OK ${secret}` }));
  expect(reply[0]).toMatchObject({ kind: 'assistant' });
  expect(JSON.stringify(reply)).not.toContain(secret);
  expect(parser.push(JSON.stringify({ ...row, type: 'SYSTEM_MESSAGE', step_index: 3 }))).toEqual([]);
  expect(parser.push(JSON.stringify({ ...row, step_index: 4, content: 'x'.repeat(100_000) }))[0]).toHaveProperty('text', expect.stringMatching(/…$/));
});

it('only accepts the real transcript of the matching conversation under the local Antigravity brain', () => {
  const home = mkdtempSync(join(tmpdir(), 'habblaud-agy-path-'));
  try {
    const brain = join(home, '.gemini/antigravity/brain');
    const dir = join(brain, 'test-123', '.system_generated/logs');
    mkdirSync(dir, { recursive: true });
    const transcript = join(dir, 'transcript.jsonl');
    writeFileSync(transcript, '');
    expect(verifiedTranscript(transcript, 'test-123', home)).toBe(transcript);
    for (const path of [undefined, '../outside', join(home, 'secret.json'), transcript]) {
      expect(verifiedTranscript(path, 'other', home)).toBeUndefined();
    }
    const outside = join(home, 'outside');
    mkdirSync(join(outside, '.system_generated/logs'), { recursive: true });
    writeFileSync(join(outside, '.system_generated/logs/transcript.jsonl'), '');
    symlinkSync(outside, join(brain, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(verifiedTranscript(join(brain, 'linked', '.system_generated/logs/transcript.jsonl'), 'linked', home)).toBeUndefined();
  } finally { rmSync(home, { recursive: true, force: true }); }
});
