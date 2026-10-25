import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from '../../../shared/i18n';
import { SESSION_TTL_MS } from './source';
import { ASK_TOOL, checkAnswers } from '../../../shared/answers';
import { maskSecrets, truncate } from '../../../shared/activity';
import type { AskQuestion, PermissionDecision } from '../../../shared/types';

const SERVICE = '/exa.language_server_pb.LanguageServerService/';
const DISCOVER = String.raw`$ErrorActionPreference='Stop'; $root=Join-Path $env:LOCALAPPDATA 'Programs\Antigravity'; $expected=Join-Path $root 'resources\bin\language_server.exe'; $items=@(Get-CimInstance Win32_Process -Filter "Name='language_server.exe'" | Where-Object {$_.ExecutablePath -eq $expected}); if($items.Count -ne 1){exit 1}; $item=$items[0]; $parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($item.ParentProcessId)"; if($parent.ExecutablePath -ne (Join-Path $root 'Antigravity.exe')){exit 1}; $match=[regex]::Match($item.CommandLine,'--csrf_token(?:=|\s+)"?([^"\s]+)'); if(-not $match.Success){exit 1}; $ports=@(Get-NetTCPConnection -OwningProcess $item.ProcessId -State Listen | Where-Object {$_.LocalAddress -eq '127.0.0.1'} | Select-Object -ExpandProperty LocalPort); [pscustomobject]@{token=$match.Groups[1].Value;ports=$ports}|ConvertTo-Json -Compress`;

export type DesktopResult = { ok: true } | { ok: false; error: string };
type Connection = { origin: string; token: string };
type Method = 'GetConversationMetadata' | 'GetAllCascadeTrajectories' | 'GetCascadeTrajectory' | 'SendUserCascadeMessage' | 'CancelCascadeInvocation' | 'HandleCascadeUserInteraction';
export interface DesktopPermission {
  id: string; conversationId: string; trajectoryId: string; stepIndex: number;
  kind: 'permission' | 'runCommand' | 'askQuestion'; tool: string; input: string;
  questions?: { question: string; options: { id: string; text: string }[]; isMultiSelect?: boolean }[];
}

export function desktopQuestions(permission: DesktopPermission): AskQuestion[] | undefined {
  return permission.questions?.map((q, index) => ({ index, question: truncate(maskSecrets(q.question), 2000), multiSelect: q.isMultiSelect === true,
    options: q.options.map((o, index) => ({ index, label: truncate(maskSecrets(o.text), 1000) })) }));
}

export function desktopPermissions(data: unknown, conversations: readonly string[]): DesktopPermission[] {
  const summaries = (data as { trajectorySummaries?: Record<string, { waitingSteps?: { stepIndex?: number; step?: {
    status?: string; type?: string; requestedInteraction?: { permission?: { resource?: { action?: string; target?: string }; reason?: string; actionDescription?: string }; runCommand?: object; askQuestion?: { questions?: DesktopPermission['questions'] } };
    runCommand?: { commandLine?: string; proposedCommandLine?: string; cwd?: string };
    metadata?: { sourceTrajectoryStepInfo?: { trajectoryId?: string; stepIndex?: number } };
  } }[] }> })?.trajectorySummaries;
  const out: DesktopPermission[] = [];
  for (const conversationId of conversations) {
    for (const waiting of summaries?.[conversationId]?.waitingSteps ?? []) {
      const step = waiting.step, spec = step?.requestedInteraction, source = step?.metadata?.sourceTrajectoryStepInfo;
      if (step?.status !== 'CORTEX_STEP_STATUS_WAITING' || !source?.trajectoryId || !/^[a-zA-Z0-9-]{1,128}$/.test(source.trajectoryId)
        || !Number.isSafeInteger(source.stepIndex) || source.stepIndex! < 0) continue;
      // shortcut: other interaction forms (browser setup, file scopes) stay in Desktop.
      const kind = spec?.permission ? 'permission' : spec?.runCommand ? 'runCommand' : spec?.askQuestion ? 'askQuestion' : undefined;
      if (!kind) continue;
      const questions = spec?.askQuestion?.questions;
      if (kind === 'askQuestion' && (!Array.isArray(questions) || !questions.length || questions.length > 4
        || questions.some(q => typeof q.question !== 'string' || !q.question.trim() || !Array.isArray(q.options)
          || q.options.some(o => typeof o.id !== 'string' || !o.id || typeof o.text !== 'string') || new Set(q.options.map(o => o.id)).size !== q.options.length))) continue;
      const tool = kind === 'askQuestion' ? ASK_TOOL : kind === 'runCommand' ? 'run_command' : spec?.permission?.resource?.action ?? 'permission';
      const input = kind === 'runCommand' ? step.runCommand?.proposedCommandLine ?? step.runCommand?.commandLine
        : kind === 'askQuestion' ? questions?.[0]?.question : spec?.permission?.resource?.target;
      if (typeof input !== 'string' || !input.trim()) continue;
      const identity = JSON.stringify([conversationId, source.trajectoryId, source.stepIndex, kind, spec, step.runCommand]);
      out.push({ id: `agy-p-${createHash('sha256').update(identity).digest('hex')}`, conversationId,
        trajectoryId: source.trajectoryId, stepIndex: source.stepIndex!, kind, tool, input, ...(kind === 'askQuestion' ? { questions } : {}) });
    }
  }
  return out;
}
export interface DesktopSession { conversationId: string; workspacePaths: string[]; transcriptPath: string; status: 'idle' | 'working'; startedAt: number; lastAt: number }

// Credentials remain in the server process and are sent only to the owned Desktop's loopback listener.
async function discover(): Promise<Connection> {
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const raw = await new Promise<string>((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-Command', DISCOVER], { windowsHide: true, timeout: 10_000, maxBuffer: 32_768 }, (error, stdout) => error ? reject(new Error('desktop unavailable')) : resolve(stdout));
  });
  const data = JSON.parse(raw);
  if (typeof data.token !== 'string' || !/^[a-zA-Z0-9-]{16,128}$/.test(data.token) || !Array.isArray(data.ports)) throw new Error('desktop unavailable');
  for (const port of data.ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const page = await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(1500) });
      if (page.ok && (await page.text()).includes('<title>Antigravity</title>')) return { origin, token: data.token };
    } catch { /* The other owned listener may require HTTPS. */ }
  }
  throw new Error('desktop unavailable');
}

export class AntigravityDesktop {
  constructor(private readonly connection: () => Promise<Connection> = discover) {}

  private async request(connection: Connection, method: Method, body: object): Promise<Response> {
    const url = new URL(connection.origin);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('invalid desktop listener');
    return fetch(url.origin + SERVICE + method, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-codeium-csrf-token': connection.token },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  }

  private async rpc(connection: Connection, method: 'GetConversationMetadata' | 'SendUserCascadeMessage' | 'CancelCascadeInvocation', body: object): Promise<boolean> {
    const response = await this.request(connection, method, body);
    if (method === 'GetConversationMetadata') {
      const data = await response.json();
      return response.ok && !!data?.metadata && typeof data.trajectoryId === 'string' && data.trajectoryId.length > 0;
    }
    await response.body?.cancel();
    return response.ok;
  }

  private async command(conversationId: string, method: 'SendUserCascadeMessage' | 'CancelCascadeInvocation', body: object): Promise<DesktopResult> {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(conversationId)) return { ok: false, error: tr('evento do Antigravity inválido') };
    try {
      const connection = await this.connection();
      if (!await this.rpc(connection, 'GetConversationMetadata', { conversationId })) return { ok: false, error: tr('A sessão do Antigravity não está disponível no Desktop.') };
      if (method === 'SendUserCascadeMessage') {
        const response = await this.request(connection, 'GetCascadeTrajectory', { cascadeId: conversationId });
        const data = await response.json();
        const executions = data?.trajectory?.executorMetadatas;
        const config = Array.isArray(executions) ? executions.at(-1)?.cascadeConfig : undefined;
        if (!response.ok || !config || typeof config !== 'object' || !Object.keys(config).length
          || Number(data.numTotalExecutorMetadata ?? executions.length) > executions.length) return { ok: false, error: tr('O Antigravity não aceitou o comando para esta sessão.') };
        // Reuse the last effective configuration; omitting it could fall back to different model/tool defaults.
        body = { ...body, cascadeConfig: config,
          ...(data.trajectory.metadata?.staticConfig ? { customAgentSpec: data.trajectory.metadata.staticConfig } : {}) };
      }
      if (!await this.rpc(connection, method, body)) return { ok: false, error: tr('O Antigravity não aceitou o comando para esta sessão.') };
      return { ok: true };
    } catch {
      // Never surface child-process output, authentication headers or Desktop response bodies.
      return { ok: false, error: tr('Não foi possível conectar ao Antigravity Desktop local. Abra o aplicativo e tente novamente.') };
    }
  }

  send({ conversationId, text }: { conversationId: string; text: string }): Promise<DesktopResult> {
    if (typeof text !== 'string' || !text.trim() || text.length > 20_000) return Promise.resolve({ ok: false, error: tr('a mensagem está vazia') });
    return this.command(conversationId, 'SendUserCascadeMessage', { cascadeId: conversationId, items: [{ text }] });
  }

  stop(conversationId: string): Promise<DesktopResult> {
    return this.command(conversationId, 'CancelCascadeInvocation', { cascadeId: conversationId, killBackgroundTasks: false });
  }

  async pending(conversations: readonly string[]): Promise<DesktopPermission[]> {
    const connection = await this.connection();
    const response = await this.request(connection, 'GetAllCascadeTrajectories', { excludeSubtrajectories: true });
    if (!response.ok) throw new Error('desktop unavailable');
    return desktopPermissions(await response.json(), conversations);
  }

  async decidePermission(permission: DesktopPermission, decision: PermissionDecision): Promise<boolean> {
    const connection = await this.connection();
    const response = await this.request(connection, 'GetAllCascadeTrajectories', { excludeSubtrajectories: true });
    if (!response.ok) return false;
    const current = desktopPermissions(await response.json(), [permission.conversationId]).find(p => p.id === permission.id);
    if (!current) return false;
    if (decision.interrupt || decision.suggestion !== undefined || decision.behavior === 'terminal') return false;
    const allow = decision.behavior === 'allow';
    let value: object;
    if (current.kind === 'askQuestion') {
      const answers = checkAnswers(desktopQuestions(current) ?? [], decision.answers);
      if (decision.behavior !== 'deny' && (decision.behavior !== 'answer' || !answers)) return false;
      value = { responses: decision.behavior === 'deny' ? [] : current.questions!.map((q, index) => ({ ...q,
        selectedOptionIds: (answers![index].options ?? []).map(i => q.options[i].id), writeInResponse: answers![index].other ?? '', skipped: false })), cancelled: decision.behavior === 'deny' };
    } else {
      if (decision.behavior !== 'allow' && decision.behavior !== 'deny') return false;
      value = current.kind === 'permission' ? { allow, scope: 1, ...(!allow && decision.message ? { userDenyInstruction: decision.message } : {}) } : { confirm: allow };
    }
    const result = await this.request(connection, 'HandleCascadeUserInteraction', { cascadeId: current.conversationId,
      interaction: { trajectoryId: current.trajectoryId, stepIndex: current.stepIndex, [current.kind]: value } });
    await result.body?.cancel();
    return result.ok;
  }

  async list(): Promise<DesktopSession[]> {
    try {
      const brain = join(homedir(), '.gemini/antigravity/brain');
      if (!existsSync(brain)) return [];
      const recent = readdirSync(brain).filter(id => /^[a-zA-Z0-9-]{1,128}$/.test(id)).map(id => {
        const file = join(brain, id, '.system_generated/logs/transcript.jsonl');
        try { return { id, file, at: statSync(file).mtimeMs }; } catch { return undefined; }
      }).filter(item => item !== undefined).filter(item => Date.now() - item.at < SESSION_TTL_MS)
        .sort((a, b) => b.at - a.at).slice(0, 16);
      const connection = await this.connection();
      // Reading a real stored conversation lets the Desktop rehydrate it without starting a model turn.
      for (const item of recent) {
        const response = await this.request(connection, 'GetCascadeTrajectory', { cascadeId: item.id });
        await response.body?.cancel();
      }
      const response = await this.request(connection, 'GetAllCascadeTrajectories', { excludeSubtrajectories: true });
      if (!response.ok) return [];
      const data = await response.json();
      const sessions: DesktopSession[] = [];
      for (const item of recent) {
        const summary = data?.trajectorySummaries?.[item.id];
        if (!summary || summary.cloud || summary.trajectoryMetadata?.parentConversationId) continue;
        const status = summary.status === 'CASCADE_RUN_STATUS_IDLE' ? 'idle' : summary.status === 'CASCADE_RUN_STATUS_RUNNING' ? 'working' : undefined;
        const startedAt = Date.parse(summary.createdTime ?? summary.trajectoryMetadata?.createdAt);
        const lastAt = Date.parse(summary.lastModifiedTime);
        if (!status || !Number.isFinite(startedAt) || !Number.isFinite(lastAt) || Date.now() - lastAt >= SESSION_TTL_MS) continue;
        const workspacePaths: string[] = [];
        for (const workspace of summary.workspaces ?? []) {
          try { workspacePaths.push(fileURLToPath(workspace.workspaceFolderAbsoluteUri)); } catch { /* Only local file workspaces. */ }
        }
        if (workspacePaths.length) sessions.push({ conversationId: item.id, workspacePaths, transcriptPath: item.file, status, startedAt, lastAt });
      }
      return sessions;
    } catch { return []; }
  }
}

export function localAntigravityDesktop(): AntigravityDesktop | undefined {
  return process.platform === 'win32' && !!process.env.LOCALAPPDATA && existsSync(join(process.env.LOCALAPPDATA, 'Programs/Antigravity/Antigravity.exe')) ? new AntigravityDesktop() : undefined;
}
