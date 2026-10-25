// Cross-platform checks for the staged payload; Windows install/start/uninstall still need a Windows host.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const stage = resolve(import.meta.dirname, '../dist/windows/payload');
const temp = mkdtempSync(join(tmpdir(), 'habblaud-package-'));
let server;
try {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const files = walk(stage);
  assert(files.length > 10);
  for (const file of files) assert(!/(?:^|[/\\])(?:\.env|auth\.json|config\.toml|server\.env|tunnel-token|remote-password|\.claude|\.codex|sessions|node_modules)(?:$|[/\\])/.test(file), file);
  assert(readFileSync(join(stage, 'launcher.ps1')).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'Windows PowerShell launcher needs a UTF-8 BOM for Vietnamese');
  const exe = readFileSync(join(stage, 'runtime/node.exe'));
  assert.equal(exe.subarray(0, 2).toString(), 'MZ');
  const pe = exe.readUInt32LE(0x3c);
  assert.equal(exe.readUInt32LE(pe), 0x4550);
  assert.equal(exe.readUInt16LE(pe + 4), 0x8664, 'Bundled Node must target Windows x64');
  const config = join(temp, 'hooks.json');
  const tool = join(stage, 'scripts/antigravity-install.mjs');
  for (let i = 0; i < 2; i++) execFileSync(process.execPath, [tool, 'install', '--file', config], { stdio: 'pipe', env: { ...process.env, HOME: temp } });
  const hooks = JSON.parse(readFileSync(config));
  assert.deepEqual(Object.keys(hooks), ['habblaud-antigravity']);
  assert(hooks['habblaud-antigravity'].Stop[0].command.includes(join(stage, 'mod/habblaud-antigravity/hook.mjs')));
  execFileSync(process.execPath, [tool, 'uninstall', '--file', config, '--owner', '/another-installation/node.exe'], { stdio: 'pipe' });
  assert.deepEqual(JSON.parse(readFileSync(config)), hooks, 'Uninstaller must preserve another installation');
  execFileSync(process.execPath, [tool, 'uninstall', '--file', config, '--owner', process.execPath], { stdio: 'pipe' });
  assert.deepEqual(JSON.parse(readFileSync(config)), {});
  server = spawn(process.execPath, [join(stage, 'dist/server/index.js')], {
    env: { ...process.env, HOME: temp, USERPROFILE: temp, HABBLAUD_DATA_DIR: temp, HABBLAUD_CLAUDE_DIRS: temp, HABBLAUD_CODEX: '0', HABBLAUD_HOST: '127.0.0.1', HABBLAUD_PORT: '14747', HABBLAUD_WORLD: '0', HABBLAUD_UPDATE_CHECK: '0', HABBLAUD_REMOTE_USER: '', HABBLAUD_LANG: 'vi' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = ''; server.stderr.on('data', (data) => { errors += data; });
  let health;
  for (let i = 0; i < 40; i++) {
    assert.equal(server.exitCode, null, errors);
    try { health = await (await fetch('http://127.0.0.1:14747/api/health')).json(); if (health.ok) break; } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(health?.ok, errors);
  assert.equal((await fetch('http://127.0.0.1:14747')).status, 200);
  console.log('Windows payload passed: Windows x64 Node, no private files, bundled hook install/uninstall, standalone server and client.');
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise((done) => server.once('exit', done)); }
  rmSync(temp, { recursive: true, force: true });
}
