import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ANTIGRAVITY_EVENTS } from '../server/sources/antigravity/source';
import { quotePath, readSettings, writeSettings, type Settings } from './statusline-install';
import { tr } from '../shared/i18n';

export function quoteHookPath(path: string, platform = process.platform): string {
  if (platform !== 'win32') return quotePath(path);
  // Windows cmd expands percent variables even inside quotes; fail instead of installing a broken command.
  if (/["%!?$`\x00-\x1f]/.test(path)) throw new Error('Unsupported characters in Windows hook path');
  const normalized = win32.normalize(path);
  return /^[\p{L}\p{M}\p{N}_:.\\/-]+$/u.test(normalized) ? normalized : `"${normalized}"`;
}

export function hookCommand(node: string, script: string, event: string, port: number, platform = process.platform): string {
  // Antigravity already invokes a shell; a nested cmd /c wrapper failed in the supplied Windows logs.
  return `${quoteHookPath(node, platform)} ${quoteHookPath(script, platform)} ${event} ${port}`;
}

export function configure(settings: Settings, install: boolean, port = 4747, platform = process.platform): Settings {
  const next = { ...settings };
  delete next['habblaud-antigravity'];
  if (install) {
    const script = resolve(import.meta.dirname, '../mod/habblaud-antigravity/hook.mjs');
    const hooks: Settings = {};
    // Keep the flat Windows events from the supplied handoff; real Desktop dispatch still needs verification.
    const events = platform === 'win32' ? ['PreInvocation', 'PostInvocation', 'Stop'] : ANTIGRAVITY_EVENTS;
    for (const event of events) {
      const handler = { type: 'command', command: hookCommand(process.execPath, script, event, port, platform), timeout: platform === 'win32' ? 10 : 3 };
      hooks[event] = event.endsWith('ToolUse') ? [{ matcher: '.*', hooks: [handler] }] : [handler];
    }
    next['habblaud-antigravity'] = hooks;
  }
  return next;
}

function main(): void {
  const [action = 'install', ...args] = process.argv.slice(2);
  if (!['install', 'uninstall', 'status'].includes(action)) throw new Error('install | uninstall | status');
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--file', '--port', '--owner'].includes(args[i]) || !args[i + 1]) throw new Error('--file <path> | --port <number> | --owner <node path>');
    options[args[i]] = args[i + 1];
  }
  const port = Number(options['--port'] ?? 4747);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  const file = resolve(options['--file'] ?? join(homedir(), '.gemini/config/hooks.json'));
  const read = readSettings(file);
  if ('error' in read) throw new Error(read.error);
  // The Windows uninstaller must not remove hooks subsequently installed by another checkout.
  if (action === 'uninstall' && options['--owner']) {
    const ownCommand = quoteHookPath(options['--owner']);
    if (!JSON.stringify(read.settings['habblaud-antigravity'] ?? {}).includes(JSON.stringify(ownCommand).slice(1, -1))) return;
  }
  if (action === 'status') {
    console.log(read.settings['habblaud-antigravity']
      ? tr('Antigravity: hooks configurados; execução ainda não verificada.')
      : tr('Antigravity: hooks não configurados.'));
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeSettings(file, configure(read.settings, action === 'install', port), read.raw, new Date());
  console.log(tr('Hooks do Antigravity atualizados: {0}', [file]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
