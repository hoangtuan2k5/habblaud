// Observe activity and transcript metadata; never change Antigravity permissions.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const state = join(homedir(), '.habblaud');
const debug = existsSync(join(state, 'antigravity-hook-debug'));
// Opt-in diagnostic: keep only the latest status, without prompts, paths or tool arguments.
function trace(stage, details = {}) {
  if (!debug) return;
  try {
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, 'antigravity-hook-status.json'), JSON.stringify({ at: new Date().toISOString(), event: process.argv[2], stage, ...details }), { mode: 0o600 });
  } catch { /* Diagnostics must not interrupt the agent. */ }
}
trace('invoked');
const MAX_INPUT = 256 * 1024;
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_INPUT) throw new Error('input too large');
  }
  const raw = JSON.parse(input);
  const event = process.argv[2];
  const port = Number(process.argv[3] ?? 4747);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  // Forward only metadata needed for the local office, never transcript contents or tool output.
  const body = JSON.stringify({ event, conversationId: raw.conversationId, workspacePaths: raw.workspacePaths,
    toolCall: raw.toolCall, error: raw.error, transcriptPath: raw.transcriptPath });
  const response = await fetch(`http://127.0.0.1:${port}/api/antigravity/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(1500),
  });
  const result = await response.json().catch(() => null);
  trace('response', { status: response.status, accepted: response.ok && result?.ok === true,
    workspaces: Array.isArray(raw.workspacePaths) ? raw.workspacePaths.length : null });
} catch (error) {
  trace('error', { error: error instanceof Error ? error.name : 'Error' });
  // The office being offline must never interrupt the agent.
}
// 'allow' delegates to the next hook/default policy; it never auto-approves a tool.
process.stdout.write(process.argv[2] === 'PreToolUse' ? '{"decision":"allow"}\n' : '{}\n');
