import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('leaves approval to Antigravity default policy even if the office is offline or input is malformed', () => {
  const hook = resolve(import.meta.dirname, '../../mod/habblaud-antigravity/hook.mjs');
  for (const input of ['not JSON', JSON.stringify({ conversationId: 'test', workspacePaths: ['/project'] })]) {
    for (const event of ['PreToolUse', 'Stop']) {
      const output = execFileSync(process.execPath, [hook, event, '1'], { input, encoding: 'utf8', timeout: 5_000 });
      expect(JSON.parse(output)).toEqual(event === 'PreToolUse' ? { decision: 'allow' } : {});
    }
  }
});
