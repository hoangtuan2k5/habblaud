import { isAbsolute } from 'node:path';
import { describeTool } from '../../../shared/activity';
import { tr } from '../../../shared/i18n';
import type { SourceInfo } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';

export const ANTIGRAVITY_EVENTS = ['SessionStart', 'PreInvocation', 'PostInvocation', 'PreToolUse', 'PostToolUse', 'Stop'] as const;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
type Rec = Record<string, unknown>;
const record = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

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

  constructor(private readonly office: Office, private readonly accounts: AccountsService, private readonly now = Date.now) {}

  start(): void {
    this.timer = setInterval(() => this.expire(), 60_000);
    this.timer.unref?.();
  }

  stop(): void { clearInterval(this.timer); }
  transcriptPathOf(): undefined { return undefined; }
  sources(): SourceInfo[] {
    return this.account ? [{ label: 'Antigravity', provider: this.provider, path: 'hooks', sessions: this.sessions.size, ok: true }] : [];
  }

  expire(): void {
    for (const [id, at] of this.sessions) if (this.now() - at >= SESSION_TTL_MS) {
      this.office.closeMain(id);
      this.sessions.delete(id);
    }
  }

  apply(raw: unknown): boolean {
    if (!validEvent(raw)) return false;
    const now = this.now();
    if (!this.account) {
      const dir = 'antigravity';
      this.account = this.accounts.setProviderAccounts(this.provider, [{ dir, detected: {
        id: dir, configDir: 'hooks', short: 'AG', name: 'Antigravity', color: '#5cc97b',
      } }])[0].id;
    }
    const id = `antigravity:${raw.conversationId}`;
    this.office.addMain({ id, provider: this.provider, account: this.account, sessionId: raw.conversationId,
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
