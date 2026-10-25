import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { describeTool } from '../../../shared/activity';
import { tr } from '../../../shared/i18n';
import type { SourceInfo } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';
import { createAntigravityTerminalParser } from './terminal';
import type { AntigravityDesktop, DesktopSession } from './desktop';

export const ANTIGRAVITY_EVENTS = ['SessionStart', 'PreInvocation', 'PostInvocation', 'PreToolUse', 'PostToolUse', 'Stop'] as const;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const DESKTOP_SCAN_MS = 15_000;
type Rec = Record<string, unknown>;
const record = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

export function verifiedTranscript(path: unknown, conversationId: string, home = homedir()): string | undefined {
  if (typeof path !== 'string' || path.length > 4096 || !isAbsolute(path) || !/^[a-zA-Z0-9-]{1,128}$/.test(conversationId)) return undefined;
  try {
    const root = realpathSync(join(home, '.gemini/antigravity/brain'));
    const expected = join(root, conversationId, '.system_generated/logs/transcript.jsonl');
    const actual = realpathSync(path);
    const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
    return same(resolve(path), expected) && same(actual, expected) ? actual : undefined;
  } catch { return undefined; }
}

export function validEvent(v: unknown): v is Rec & { event: string; conversationId: string; workspacePaths: string[] } {
  return record(v) && typeof v.event === 'string' && (ANTIGRAVITY_EVENTS as readonly string[]).includes(v.event)
    && typeof v.conversationId === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(v.conversationId)
    && Array.isArray(v.workspacePaths) && v.workspacePaths.length > 0 && v.workspacePaths.length <= 16
    && v.workspacePaths.every((p) => typeof p === 'string' && p.length <= 4096 && isAbsolute(p))
    && ((v.event !== 'PreToolUse' && v.event !== 'PostToolUse') || v.toolCall !== undefined)
    && (v.toolCall === undefined || (record(v.toolCall) && typeof v.toolCall.name === 'string' && v.toolCall.name.length <= 200
      && (v.toolCall.args === undefined || record(v.toolCall.args))));
}

// shortcut: hooks have no session-close event; expire after 24 h without events until a liveness API exists.
export class AntigravitySource implements AgentSource {
  readonly provider = 'antigravity' as const;
  private sessions = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private seq = 0;
  private account?: string;
  private transcripts = new Map<string, string>();
  private scanning = false;
  private stopped = true;

  constructor(private readonly office: Office, private readonly accounts: AccountsService, private readonly now = Date.now, private readonly desktop?: Pick<AntigravityDesktop, 'list'>) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { this.expire(); void this.scanDesktop(); }, DESKTOP_SCAN_MS);
    this.timer.unref?.();
    if (this.desktop) {
      this.office.beginBoot();
      void this.scanDesktop().finally(() => this.office.endBoot());
    }
  }

  stop(): void { this.stopped = true; clearInterval(this.timer); this.timer = undefined; }
  transcriptPathOf(agentId: string): string | undefined {
    const cached = this.transcripts.get(agentId);
    if (cached || !this.sessions.has(agentId)) return cached;
    const conversationId = agentId.slice('antigravity:'.length);
    const path = verifiedTranscript(join(homedir(), '.gemini/antigravity/brain', conversationId, '.system_generated/logs/transcript.jsonl'), conversationId);
    if (path) this.transcripts.set(agentId, path);
    return path;
  }
  terminalParser() { return createAntigravityTerminalParser(); }
  sources(): SourceInfo[] {
    return this.account ? [{ label: 'Antigravity', provider: this.provider, path: 'hooks', sessions: this.sessions.size, ok: true }] : [];
  }

  expire(): void {
    for (const [id, at] of this.sessions) if (this.now() - at >= SESSION_TTL_MS) {
      this.office.closeMain(id);
      this.sessions.delete(id);
      this.transcripts.delete(id);
    }
  }

  private async scanDesktop(): Promise<void> {
    if (!this.desktop || this.scanning || this.stopped) return;
    this.scanning = true;
    try {
      const sessions = await this.desktop.list();
      if (!this.stopped) for (const session of sessions) this.restore(session);
    } catch { /* Desktop can be closed; keep hook sessions until their normal expiry. */ }
    finally { this.scanning = false; }
  }

  private ensureAccount(): string {
    if (!this.account) this.account = this.accounts.setProviderAccounts(this.provider, [{ dir: 'antigravity', detected: {
      id: 'antigravity', configDir: 'hooks', short: 'AG', name: 'Antigravity', color: '#5cc97b',
    } }])[0].id;
    return this.account;
  }

  private restore(session: DesktopSession): void {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(session.conversationId) || !session.workspacePaths.length
      || !session.workspacePaths.every(path => isAbsolute(path)) || this.now() - session.lastAt >= SESSION_TTL_MS) return;
    const id = `antigravity:${session.conversationId}`;
    if ((this.sessions.get(id) ?? -Infinity) >= session.lastAt) return; // Preserve hooks newer than the Desktop snapshot.
    const transcript = verifiedTranscript(session.transcriptPath, session.conversationId);
    if (transcript) this.transcripts.set(id, transcript);
    this.office.addMain({ id, provider: this.provider, account: this.ensureAccount(), sessionId: session.conversationId,
      cwd: session.workspacePaths[0], role: tr('Agente principal'), startedAt: session.startedAt, status: session.status });
    this.sessions.set(id, session.lastAt);
  }

  apply(raw: unknown): boolean {
    if (!validEvent(raw)) return false;
    const now = this.now();
    const account = this.ensureAccount();
    const id = `antigravity:${raw.conversationId}`;
    const transcript = verifiedTranscript(raw.transcriptPath, raw.conversationId);
    if (transcript) this.transcripts.set(id, transcript);
    this.office.addMain({ id, provider: this.provider, account, sessionId: raw.conversationId,
      cwd: raw.workspacePaths[0], role: tr('Agente principal'), startedAt: now, status: raw.event === 'Stop' ? 'idle' : 'working' });
    this.sessions.set(id, now);
    const tool = record(raw.toolCall) ? raw.toolCall : undefined;
    let activity;
    if (tool && (raw.event === 'PreToolUse' || raw.event === 'PostToolUse')) {
      const args = record(tool.args) ? tool.args : {};
      const name = String(tool.name);
      const names: Record<string, string> = { view_file: 'Read', list_dir: 'LS', grep_search: 'Grep', find_by_name: 'Glob',
        write_to_file: 'Write', replace_file_content: 'Edit', multi_replace_file_content: 'Edit', run_command: 'Bash',
        search_web: 'WebSearch', read_url_content: 'WebFetch', invoke_subagent: 'Agent', ask_question: 'AskUserQuestion' };
      activity = { ...describeTool(names[name] ?? name, {
        file_path: args.AbsolutePath ?? args.TargetFile ?? args.DirectoryPath,
        command: args.CommandLine, description: args.Description, pattern: args.Query ?? args.Pattern,
        query: args.query, url: args.Url,
      }), tool: name, error: typeof raw.error === 'string' && !!raw.error };
    } else if (raw.event === 'Stop') {
      activity = { kind: 'done' as const, icon: '✅', text: tr('Concluído') };
    } else {
      activity = { kind: 'think' as const, icon: '💭', text: tr('Pensando') };
    }
    this.office.addActivity(id, { id: `${id}#${++this.seq}`, at: now, ...activity }, true);
    return true;
  }
}
