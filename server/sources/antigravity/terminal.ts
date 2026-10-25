import type { TerminalEntry } from '../../../shared/types';
import { marked, prepare, TEXT_MAX, type TerminalParser } from '../terminal';

export function createAntigravityTerminalParser(): TerminalParser {
  const seen = new Set<string>();
  return {
    push(line): TerminalEntry[] {
      let row;
      try { row = JSON.parse(line); } catch { return []; }
      if (!row || row.status !== 'DONE' || !Number.isSafeInteger(row.step_index) || row.step_index < 0 || typeof row.content !== 'string') return [];
      const kind = row.type === 'USER_INPUT' && row.source === 'USER_EXPLICIT' ? 'user'
        : row.type === 'PLANNER_RESPONSE' && row.source === 'MODEL' ? 'assistant' : undefined;
      // shortcut: only verified user/reply records, add tool records when their format is verified.
      if (!kind) return [];
      const id = `agy:${row.step_index}:${kind}`;
      if (seen.has(id)) return [];
      seen.add(id);
      if (seen.size > 20_000) seen.delete(seen.values().next().value!);
      const request = kind === 'user' ? /^\s*<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>(?:\s*<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>)*\s*$/.exec(row.content) : null;
      const text = marked(prepare(request?.[1] ?? row.content, TEXT_MAX));
      const at = Date.parse(row.created_at);
      return text ? [{ kind, id, at: Number.isFinite(at) ? at : Date.now(), text }] : [];
    },
  };
}
