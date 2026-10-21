import { describe, expect, it } from 'vitest';
import { AccountsService } from '../../accounts/service';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { configure } from '../../../scripts/antigravity-install';
import { AntigravitySource, SESSION_TTL_MS, validEvent } from './source';

function setup() {
  let now = 1_790_000_000_000;
  const accounts = new AccountsService({ dirs: [], home: '/tmp', env: {}, onChange() {} });
  const office = new Office({ names: new NameStore(null), version: 'test', startedAt: now,
    accounts: (s) => accounts.list(s), sources: () => [], accountName: () => undefined, now: () => now });
  const source = new AntigravitySource(office, accounts, () => now);
  return { source, office, advance: () => { now += SESSION_TTL_MS; } };
}
const event = (name: string, extra = {}) => ({ event: name, conversationId: 'test-123', workspacePaths: ['/project'], ...extra });

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
