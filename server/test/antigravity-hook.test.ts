import { execFileSync, execSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { configure, hookCommand, quoteHookPath } from '../../scripts/antigravity-install';

it('keeps hooks observation-only even when a response contains injection or approval fields', async () => {
  let ok = true;
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok, injectSteps: [{ userMessage: 'explicit-user-request', toolCall: { name: 'ignored' } }], decision: 'auto_approve' }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const hook = resolve(import.meta.dirname, '../../mod/habblaud-antigravity/hook.mjs');
  const run = (event: string) => new Promise<unknown>((done, fail) => {
    const child = spawn(process.execPath, [hook, event, String(port)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.on('error', fail);
    child.on('exit', (code) => code === 0 ? done(JSON.parse(output)) : fail(new Error('hook failed')));
    child.stdin.end('{}');
  });
  try {
    expect(await run('PreInvocation')).toEqual({});
    expect(await run('PostInvocation')).toEqual({});
    expect(await run('PreToolUse')).toEqual({ decision: 'allow' });
    expect(await run('Stop')).toEqual({});
    ok = false;
    expect(await run('PostInvocation')).toEqual({});
  } finally { await new Promise<void>((done) => server.close(() => done())); }
}, 20_000);

it('leaves approval to Antigravity default policy even if the office is offline or input is malformed', () => {
  const hook = resolve(import.meta.dirname, '../../mod/habblaud-antigravity/hook.mjs');
  for (const input of ['not JSON', JSON.stringify({ conversationId: 'test', workspacePaths: ['/project'] })]) {
    for (const event of ['PreToolUse', 'Stop']) {
      const output = execFileSync(process.execPath, [hook, event, '1'], { input, encoding: 'utf8', timeout: 5_000 });
      expect(JSON.parse(output)).toEqual(event === 'PreToolUse' ? { decision: 'allow' } : {});
    }
  }
});


it('quotes Windows hook paths with spaces and rejects shell expansion', () => {
  expect(quoteHookPath('C:\\Users\\Thu Thủy\\Habblaud\\node.exe', 'win32'))
    .toBe('"C:\\Users\\Thu Thủy\\Habblaud\\node.exe"');
  expect(quoteHookPath('C:/Users/customer/Habblaud/node.exe', 'win32')).toBe('C:\\Users\\customer\\Habblaud\\node.exe');
  expect(quoteHookPath('C:/Users/Thu&Thuy/node.exe', 'win32')).toBe('"C:\\Users\\Thu&Thuy\\node.exe"');
  for (const name of ['%USERNAME%', '$user', '`command`', 'bad"path', 'bad\npath', 'bad\0path']) {
    expect(() => quoteHookPath(`C:/${name}/node.exe`, 'win32')).toThrow();
  }
});


it('records opt-in failure diagnostics without storing hook input', () => {
  const home = mkdtempSync(join(tmpdir(), 'habblaud-hook-debug-'));
  try {
    const state = join(home, '.habblaud');
    mkdirSync(state);
    writeFileSync(join(state, 'antigravity-hook-debug'), '');
    const hook = resolve(import.meta.dirname, '../../mod/habblaud-antigravity/hook.mjs');
    const output = execFileSync(process.execPath, [hook, 'PreToolUse', '1'], {
      input: 'private-invalid-input', encoding: 'utf8', timeout: 5000,
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    expect(JSON.parse(output)).toEqual({ decision: 'allow' });
    const status = readFileSync(join(state, 'antigravity-hook-status.json'), 'utf8');
    expect(JSON.parse(status)).toMatchObject({ event: 'PreToolUse', stage: 'error', error: 'SyntaxError' });
    expect(status).not.toContain('private-invalid-input');
  } finally { rmSync(home, { recursive: true, force: true }); }
});


it('installs direct Windows commands from the supplied handoff without a nested cmd wrapper', () => {
  const other = { custom: { Stop: [{ command: 'echo keep' }] } };
  const installed = configure(other, true, 4848, 'win32');
  expect(installed.custom).toEqual(other.custom);
  const group = installed['habblaud-antigravity'] as Record<string, Array<{ command: string; timeout: number }>>;
  expect(Object.keys(group)).toEqual(['PreInvocation', 'PostInvocation', 'Stop']);
  for (const event of Object.keys(group)) {
    expect(group[event][0].timeout).toBe(10);
    expect(group[event][0].command).not.toContain('cmd.exe');
    expect(group[event][0].command).toContain(`${event} 4848`);
  }
  expect(hookCommand('C:/Program Files/Habblaud/node.exe', 'C:/Program Files/Habblaud/hook.mjs', 'Stop', 4747, 'win32'))
    .toBe('"C:\\Program Files\\Habblaud\\node.exe" "C:\\Program Files\\Habblaud\\hook.mjs" Stop 4747');
  expect(hookCommand('C:/Users/customer/Habblaud/node.exe', 'C:/Users/customer/Habblaud/hook.mjs', 'Stop', 4747, 'win32'))
    .toBe('C:\\Users\\customer\\Habblaud\\node.exe C:\\Users\\customer\\Habblaud\\hook.mjs Stop 4747');
  expect(configure(installed, false, 4848, 'win32')).toEqual(other);
});

it('distinguishes rejected HTTP requests from accepted events without logging input', async () => {
  const home = mkdtempSync(join(tmpdir(), 'habblaud-hook-http-'));
  const state = join(home, '.habblaud');
  mkdirSync(state);
  writeFileSync(join(state, 'antigravity-hook-debug'), '');
  let status = 200;
  let accepted = true;
  let received: Record<string, unknown> | undefined;
  const server = createServer(async (req, res) => {
    let input = '';
    for await (const chunk of req) input += chunk;
    received = JSON.parse(input);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: accepted }));
  });
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    const hook = resolve(import.meta.dirname, '../../mod/habblaud-antigravity/hook.mjs');
    for (const test of [{ status: 400, accepted: false }, { status: 200, accepted: false }, { status: 200, accepted: true }]) {
      ({ status, accepted } = test);
      const output = await new Promise<string>((done, fail) => {
        const child = spawn(process.execPath, [hook, 'Stop', String(port)], {
          env: { ...process.env, HOME: home, USERPROFILE: home }, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout.on('data', (data) => { stdout += data; });
        child.on('error', fail);
        child.on('exit', (code) => code === 0 ? done(stdout) : fail(new Error(`hook exited ${code}`)));
        child.stdin.end(JSON.stringify({ conversationId: 'fixture', workspacePaths: ['/workspace'], prompt: 'private-marker' }));
      });
      expect(JSON.parse(output)).toEqual({});
      const diagnostic = readFileSync(join(state, 'antigravity-hook-status.json'), 'utf8');
      expect(JSON.parse(diagnostic)).toMatchObject({ stage: 'response', status, accepted, workspaces: 1 });
      expect(diagnostic).not.toContain('private-marker');
      expect(received).toEqual({ event: 'Stop', conversationId: 'fixture', workspacePaths: ['/workspace'] });
    }
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(home, { recursive: true, force: true });
  }
});


it.skipIf(process.platform !== 'win32')('executes the Windows command with spaced Unicode paths and preserves stdin', () => {
  const home = mkdtempSync(join(tmpdir(), 'Habblaud Thu Thủy '));
  try {
    const node = join(home, 'node.exe');
    copyFileSync(process.execPath, node);
    const script = join(home, 'hook test.mjs');
    writeFileSync(script, `let input = ''; for await (const chunk of process.stdin) input += chunk; process.stdout.write(JSON.stringify({ args: process.argv.slice(2), input }));`);
    const input = JSON.stringify({ message: 'Kiểm tra tiếng Việt' });
    const output = execSync(hookCommand(node, script, 'Stop', 4848, 'win32'), {
      input, encoding: 'utf8', timeout: 10000, shell: process.env.ComSpec || 'cmd.exe',
    });
    expect(JSON.parse(output)).toEqual({ args: ['Stop', '4848'], input });
  } finally { rmSync(home, { recursive: true, force: true }); }
}, 20_000);
