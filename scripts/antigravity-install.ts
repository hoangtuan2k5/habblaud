import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ANTIGRAVITY_EVENTS } from '../server/sources/antigravity/source';
import { quotePath, readSettings, writeSettings, type Settings } from './statusline-install';
import { tr } from '../shared/i18n';

export function configure(settings: Settings, install: boolean, port = 4747): Settings {
  const next = { ...settings };
  delete next['habblaud-antigravity'];
  if (install) {
    const script = resolve(import.meta.dirname, '../mod/habblaud-antigravity/hook.mjs');
    const hooks: Settings = {};
    for (const event of ANTIGRAVITY_EVENTS) {
      const handler = { type: 'command', command: `${quotePath(process.execPath)} ${quotePath(script)} ${event} ${port}`, timeout: 3 };
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
    if (!['--file', '--port'].includes(args[i]) || !args[i + 1]) throw new Error('--file <path> | --port <number>');
    options[args[i]] = args[i + 1];
  }
  const port = Number(options['--port'] ?? 4747);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  const file = resolve(options['--file'] ?? join(homedir(), '.gemini/config/hooks.json'));
  const read = readSettings(file);
  if ('error' in read) throw new Error(read.error);
  if (action === 'status') {
    console.log(tr('Antigravity: {0}', [read.settings['habblaud-antigravity'] ? tr('ligado') : tr('desligado')]));
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeSettings(file, configure(read.settings, action === 'install', port), read.raw, new Date());
  console.log(tr('Hooks do Antigravity atualizados: {0}', [file]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
