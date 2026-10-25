import { describe, expect, it, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { AccountsService } from '../../accounts/service';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { configure } from '../../../scripts/antigravity-install';
import { AntigravitySource, DESKTOP_SCAN_MS, SESSION_TTL_MS, validEvent } from './source';
import type { DesktopSession } from './desktop';
import { tempDir, writeLines } from '../../test/fixtures';

function setup(desktop?: { list(): Promise<DesktopSession[]> }) {
  let now = 1_790_000_000_000;
  const accounts = new AccountsService({ dirs: [], home: '/tmp', env: {}, onChange() {} });
  const office = new Office({ names: new NameStore(null), version: 'test', startedAt: now,
    accounts: (s) => accounts.list(s), sources: () => [], accountName: () => undefined, now: () => now });
  const source = new AntigravitySource(office, accounts, () => now, desktop);
  return { source, office, advance: () => { now += SESSION_TTL_MS; } };
}
const event = (name: string, extra = {}) => ({ event: name, conversationId: 'test-123', workspacePaths: ['/project'], ...extra });

it('finds a transcript created after the hook without accepting paths outside the known conversation', () => {
  const temp = tempDir('habblaud-agy-late-');
  vi.stubEnv('HOME', temp.dir);
  vi.stubEnv('USERPROFILE', temp.dir);
  try {
    const { source } = setup();
    source.apply(event('PreInvocation'));
    expect(source.transcriptPathOf('antigravity:test-123')).toBeUndefined();
    const path = join(temp.dir, '.gemini/antigravity/brain/test-123/.system_generated/logs/transcript.jsonl');
    writeLines(path, []);
    expect(source.transcriptPathOf('antigravity:test-123')).toBe(realpathSync(path));
    expect(source.transcriptPathOf('antigravity:unknown')).toBeUndefined();
  } finally { vi.unstubAllEnvs(); temp.cleanup(); }
});

it('rescans when Desktop starts later and preserves newer hook state', async () => {
  vi.useFakeTimers();
  const session: DesktopSession = { conversationId: 'test-123', workspacePaths: ['/project'], transcriptPath: '/nonexistent',
    status: 'idle', startedAt: 1_789_999_990_000, lastAt: 1_789_999_999_000 };
  const list = vi.fn<() => Promise<DesktopSession[]>>().mockResolvedValue([]);
  const { source, office } = setup({ list });
  source.start();
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(office.list()).toHaveLength(0);
    list.mockResolvedValue([session]);
    await vi.advanceTimersByTimeAsync(DESKTOP_SCAN_MS);
    expect(office.list()[0]).toMatchObject({ id: 'antigravity:test-123', status: 'idle' });
    source.apply(event('PreInvocation'));
    await vi.advanceTimersByTimeAsync(DESKTOP_SCAN_MS);
    expect(office.list()[0].status).toBe('working');
    expect(list).toHaveBeenCalledTimes(3);
    source.stop();
    await vi.advanceTimersByTimeAsync(DESKTOP_SCAN_MS);
    expect(list).toHaveBeenCalledTimes(3);
  } finally { source.stop(); vi.useRealTimers(); }
});

it('does not overlap scans or restore sessions after stopping', async () => {
  vi.useFakeTimers();
  let finish!: (sessions: DesktopSession[]) => void;
  const list = vi.fn(() => new Promise<DesktopSession[]>(resolve => { finish = resolve; }));
  const { source, office } = setup({ list });
  source.start();
  try {
    await vi.advanceTimersByTimeAsync(DESKTOP_SCAN_MS * 2);
    expect(list).toHaveBeenCalledTimes(1);
    source.stop();
    finish([{ conversationId: 'late', workspacePaths: ['/project'], transcriptPath: '/nonexistent', status: 'idle',
      startedAt: 1_789_999_990_000, lastAt: 1_790_000_000_000 }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(office.list()).toHaveLength(0);
  } finally { source.stop(); vi.useRealTimers(); }
});

it('restores actual Desktop sessions without manufacturing hook activity', async () => {
  const { source, office } = setup({ list: async () => [{ conversationId: 'restored', workspacePaths: ['/project'],
    transcriptPath: '/nonexistent', status: 'idle', startedAt: 1_789_999_990_000, lastAt: 1_790_000_000_000 }] });
  source.start();
  try {
    await vi.waitFor(() => expect(office.list()).toHaveLength(1));
    expect(office.list()[0]).toMatchObject({ id: 'antigravity:restored', status: 'idle', startedAt: 1_789_999_990_000 });
    expect(office.detail('antigravity:restored')?.history).toEqual([]);
  } finally { source.stop(); }
});

describe('Antigravity local hooks', () => {
  it('rejects malformed events without adding an agent', () => {
    const { source, office } = setup();
    for (const bad of [null, [], {}, event('bogus'), event('Stop', { workspacePaths: [] }),
      event('Stop', { workspacePaths: ['relative'] }), event('Stop', { conversationId: '../bad' }),
      event('PreToolUse', { toolCall: { name: 5 } })]) {
      expect(validEvent(bad)).toBe(false);
      expect(source.apply(bad)).toBe(false);
    }
    expect(office.list()).toHaveLength(0);
  });

  it('tracks one agent per conversation, tool activity and turn completion', () => {
    const { source, office } = setup();
    expect(source.apply(event('SessionStart'))).toBe(true);
    source.apply(event('PreInvocation'));
    source.apply(event('PreToolUse', { toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } }));
    expect(office.list()).toHaveLength(1);
    expect(office.list()[0]).toMatchObject({ provider: 'antigravity', roomId: '/project', status: 'working', activity: { tool: 'run_command', kind: 'test' } });
    source.apply(event('PostToolUse', { toolCall: { name: 'run_command' }, error: 'failed' }));
    expect(office.list()[0].activity?.error).toBe(true);
    source.apply(event('Stop'));
    expect(office.list()[0].status).toBe('idle');
    expect(source.sources()[0].sessions).toBe(1);
    source.apply(event('PreInvocation', { conversationId: 'other' }));
    expect(office.list()).toHaveLength(2);
  });

  it('expires stale sessions and accepts a returning conversation', () => {
    const { source, office, advance } = setup();
    source.apply(event('SessionStart'));
    advance();
    source.expire();
    expect(office.list()[0].status).toBe('offline');
    expect(source.sources()[0].sessions).toBe(0);
    source.apply(event('PreInvocation'));
    expect(office.list()[0].status).toBe('working');
  });

  it('installs idempotently and removes only its own hooks', () => {
    const other = { custom: { Stop: [{ command: 'echo custom' }] } };
    const installed = configure(other, true, 4848);
    expect(configure(installed, true, 4848)).toEqual(installed);
    expect(configure(installed, false)).toEqual(other);
    expect(installed['habblaud-antigravity']).toMatchObject({ Stop: [{ command: expect.stringContaining('Stop 4848') }] });
  });
});
