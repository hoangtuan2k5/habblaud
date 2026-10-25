import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { AntigravityDesktop, desktopPermissions } from './desktop';

it('rechecks the exact pending approval, approves once and rejects stale requests without changing policy', async () => {
  const step = { status: 'CORTEX_STEP_STATUS_WAITING', requestedInteraction: { permission: { resource: { action: 'shell', target: 'echo fixture' } } },
    metadata: { sourceTrajectoryStepInfo: { trajectoryId: 'trajectory-1', stepIndex: 7 } } };
  const data = { trajectorySummaries: { 'session-1': { waitingSteps: [{ stepIndex: 7, step }] } } };
  const pending = desktopPermissions(data, ['session-1']);
  expect(pending).toHaveLength(1);
  expect(desktopPermissions(data, ['other'])).toEqual([]);
  expect(desktopPermissions({ trajectorySummaries: { 'session-1': { waitingSteps: [{ step: { ...step, status: 'CORTEX_STEP_STATUS_DONE' } }] } } }, ['session-1'])).toEqual([]);
  const interactions: unknown[] = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/HandleCascadeUserInteraction')) { interactions.push(JSON.parse(raw)); res.end('{}'); }
    else res.end(JSON.stringify(data));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const desktop = new AntigravityDesktop(async () => ({ origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, token: 'synthetic' }));
    expect(await desktop.decidePermission(pending[0], { behavior: 'allow' })).toBe(true);
    expect(interactions[0]).toEqual({ cascadeId: 'session-1', interaction: { trajectoryId: 'trajectory-1', stepIndex: 7, permission: { allow: true, scope: 1 } } });
    expect(await desktop.decidePermission(pending[0], { behavior: 'deny', message: 'use another command' })).toBe(true);
    expect(interactions[1]).toEqual({ cascadeId: 'session-1', interaction: { trajectoryId: 'trajectory-1', stepIndex: 7, permission: { allow: false, scope: 1, userDenyInstruction: 'use another command' } } });
    step.requestedInteraction.permission.resource.target = 'changed command';
    expect(await desktop.decidePermission(pending[0], { behavior: 'allow' })).toBe(false);
    expect(interactions).toHaveLength(2);
    const question = { question: 'Choose a fixture', options: [{ id: 'native-a', text: 'First' }, { id: 'native-b', text: 'Second' }] };
    const questionData = { trajectorySummaries: { 'session-1': { waitingSteps: [{ step: { ...step, requestedInteraction: { askQuestion: { questions: [question] } } } }] } } };
    Object.assign(data.trajectorySummaries['session-1'], questionData.trajectorySummaries['session-1']);
    const ask = desktopPermissions(data, ['session-1'])[0];
    expect(ask.kind).toBe('askQuestion');
    expect(await desktop.decidePermission(ask, { behavior: 'allow' })).toBe(false);
    expect(await desktop.decidePermission(ask, { behavior: 'answer', answers: [{ question: 0, options: [3] }] })).toBe(false);
    expect(await desktop.decidePermission(ask, { behavior: 'answer', answers: [{ question: 0, options: [1] }] })).toBe(true);
    expect(interactions.at(-1)).toEqual({ cascadeId: 'session-1', interaction: { trajectoryId: 'trajectory-1', stepIndex: 7,
      askQuestion: { responses: [{ ...question, selectedOptionIds: ['native-b'], writeInResponse: '', skipped: false }], cancelled: false } } });
    data.trajectorySummaries['session-1'].waitingSteps = [];
    expect(await desktop.decidePermission(pending[0], { behavior: 'allow' })).toBe(false);
    expect(interactions).toHaveLength(3);
  } finally { await new Promise<void>(done => server.close(() => done())); }
});

it('authenticates only to loopback, verifies the existing session and preserves model/permission settings', async () => {
  const calls: { method: string; body: unknown; token: unknown }[] = [];
  let available = true;
  let accepted = true;
  const token = 'synthetic-local-auth-token';
  const config = { plannerConfig: { requestedModel: 'fixture-model', toolConfig: { policy: 'ask' } } };
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const data of req) raw += data;
    const method = req.url!.split('/').at(-1)!;
    calls.push({ method, body: JSON.parse(raw), token: req.headers['x-codeium-csrf-token'] });
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = method === 'GetConversationMetadata' ? available ? 200 : 404 : accepted ? 200 : 500;
    res.end(JSON.stringify(method === 'GetConversationMetadata' ? { metadata: {}, trajectoryId: 'actual-trajectory' }
      : method === 'GetCascadeTrajectory' ? { trajectory: { executorMetadatas: [{ cascadeConfig: config }] }, numTotalExecutorMetadata: 1 } : { privateError: token }));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const desktop = new AntigravityDesktop(async () => ({ origin, token }));
    expect(await desktop.send({ conversationId: 'real-session', text: 'Xin chào' })).toEqual({ ok: true });
    expect(calls.at(-1)).toEqual({ method: 'SendUserCascadeMessage', body: { cascadeId: 'real-session', items: [{ text: 'Xin chào' }], cascadeConfig: config }, token });
    expect(await desktop.stop('real-session')).toEqual({ ok: true });
    expect(calls.at(-1)?.body).toEqual({ cascadeId: 'real-session', killBackgroundTasks: false });
    accepted = false;
    expect(JSON.stringify(await desktop.send({ conversationId: 'real-session', text: 'request' }))).not.toContain(token);
    available = false;
    const before = calls.filter(c => c.method === 'SendUserCascadeMessage').length;
    expect((await desktop.send({ conversationId: 'missing', text: 'request' })).ok).toBe(false);
    expect(calls.filter(c => c.method === 'SendUserCascadeMessage')).toHaveLength(before);
    expect((await desktop.send({ conversationId: '../wrong', text: 'request' })).ok).toBe(false);
    expect((await new AntigravityDesktop(async () => ({ origin: 'https://example.com', token })).send({ conversationId: 'real', text: 'request' })).ok).toBe(false);
  } finally { await new Promise<void>(done => server.close(() => done())); }
});
