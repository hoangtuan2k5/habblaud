// Requires NSIS (makensis); bundles the official Windows Node runtime, not host configuration.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist/windows');
const stage = resolve(out, 'payload');
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const nodeVersion = '24.22.1';
const base = `https://nodejs.org/dist/v${nodeVersion}`;
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, HABBLAUD_WINDOWS_VI_ONLY: '1' } });
rmSync(stage, { recursive: true, force: true });
mkdirSync(resolve(stage, 'runtime'), { recursive: true });
for (const path of ['dist/client', 'dist/server']) cpSync(resolve(root, path), resolve(stage, path), { recursive: true });
for (const file of ['package.json', 'LICENSE', 'dist/build.json']) cpSync(resolve(root, file), resolve(stage, file));
for (const file of ['launch.vbs', 'launcher.ps1', 'README.vi.txt']) cpSync(resolve(root, 'deployment/windows', file), resolve(stage, file));
cpSync(resolve(root, 'mod/habblaud-antigravity'), resolve(stage, 'mod/habblaud-antigravity'), { recursive: true });
// Splitting keeps imported CLI main guards in a separate module so only the selected installer runs.
await build({ entryPoints: ['scripts/antigravity-install.ts', 'scripts/statusline-install.ts'], absWorkingDir: root, outdir: resolve(stage, 'scripts'), bundle: true, splitting: true, chunkNames: 'shared-[hash]', outExtension: { '.js': '.mjs' }, platform: 'node', target: 'node22', format: 'esm', packages: 'external' });
const checksums = (await download(`${base}/SHASUMS256.txt`)).toString();
const expected = checksums.split('\n').find((line) => line.trim().endsWith(' win-x64/node.exe'))?.split(/\s+/)[0];
if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Official Node checksum missing');
const binary = await download(`${base}/win-x64/node.exe`);
if (createHash('sha256').update(binary).digest('hex') !== expected) throw new Error('Node runtime checksum mismatch');
writeFileSync(resolve(stage, 'runtime/node.exe'), binary);
writeFileSync(resolve(stage, 'runtime/LICENSE'), await download(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`));
const installer = resolve(out, `Habblaud-Setup-${version}-win-x64-vi-direct-hooks.exe`);
const defines = [`PAYLOAD=${stage}`, `OUTPUT=${installer}`, `APP_VERSION=${version}`].map((value) => `${process.platform === 'win32' ? '/' : '-'}D${value}`);
execFileSync(process.env.MAKENSIS || 'makensis', [...defines, resolve(root, 'deployment/windows/installer.nsi')], { cwd: root, stdio: 'inherit' });
const digest = createHash('sha256').update(readFileSync(installer)).digest('hex');
writeFileSync(`${installer}.sha256`, `${digest}  ${installer.split(/[\\/]/).pop()}\n`);
console.log(`Windows installer: ${installer}`);
