// Observe only: never change Antigravity permissions or inject instructions.
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
    toolCall: raw.toolCall, error: raw.error });
  await fetch(`http://127.0.0.1:${port}/api/antigravity/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(1500),
  });
} catch {
  // The office being offline must never interrupt the agent.
}
process.stdout.write('{}\n');
