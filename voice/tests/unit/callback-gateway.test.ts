import { createServer, type Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { callbackGateway } from '../../src/server/callback-gateway';
const servers: Server[] = [];
const toolSecret = 'tool-unit-only-'.repeat(4),
  webhookSecret = 'webhook-unit-only-'.repeat(4);
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it('rejects dashboard, login, unknown tools, malformed paths and unauthenticated callbacks before forwarding', async () => {
  let count = 0;
  const backend = await listen(
    createServer((_, res) => {
      count++;
      res.end('{}');
    }),
  );
  const gateway = await listen(callbackGateway({ backend, toolSecret, webhookSecret }));
  for (const path of [
    '/',
    '/api/auth',
    '/api/missions',
    '/api/tools/unknown',
    '/api/tools/get_mission_brief?x=1',
    '/api/tools/%67et_mission_brief',
    '/api/bolna/webhook/',
  ])
    expect((await fetch(gateway + path, { method: 'POST' })).status).toBe(404);
  expect((await fetch(gateway + '/api/bolna/webhook', { method: 'POST' })).status).toBe(401);
  expect((await fetch(gateway + '/api/bolna/webhook')).status).toBe(405);
  expect(count).toBe(0);
});
it('forwards only authenticated JSON callbacks, preserving scoped token and stripping browser credentials', async () => {
  let received: { path?: string; cookie?: string; origin?: string; text: string } | undefined;
  const backend = await listen(
    createServer(async (req, res) => {
      let text = '';
      for await (const chunk of req) text += chunk;
      received = { path: req.url, cookie: req.headers.cookie, origin: req.headers.origin, text };
      res.setHeader('Set-Cookie', 'should-not-pass=1');
      res.end('{"accepted":true}');
    }),
  );
  const gateway = await listen(callbackGateway({ backend, toolSecret, webhookSecret }));
  const body = JSON.stringify({ token: 'scoped-hmac-unit-token', payload_json: '{}' });
  const r = await fetch(gateway + '/api/tools/get_mission_brief', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'x-chorus-tool-secret': toolSecret,
      Cookie: 'chorus_access=do-not-forward',
      Origin: 'https://untrusted.invalid',
    },
  });
  expect(r.status).toBe(200);
  expect(r.headers.get('set-cookie')).toBeNull();
  expect(await r.json()).toEqual({ accepted: true });
  expect(received).toEqual({
    path: '/api/tools/get_mission_brief',
    cookie: undefined,
    origin: undefined,
    text: body,
  });
  expect(
    (
      await fetch(gateway + '/api/bolna/webhook', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json', 'x-chorus-webhook-secret': toolSecret },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(gateway + '/api/bolna/webhook', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json', 'x-chorus-webhook-secret': webhookSecret },
      })
    ).status,
  ).toBe(200);
});
it('rejects oversized callbacks and non-JSON without forwarding', async () => {
  let count = 0;
  const backend = await listen(
    createServer((_, res) => {
      count++;
      res.end('{}');
    }),
  );
  const gateway = await listen(callbackGateway({ backend, toolSecret, webhookSecret }));
  expect(
    (
      await fetch(gateway + '/api/bolna/webhook', {
        method: 'POST',
        body: 'x'.repeat(64001),
        headers: { 'Content-Type': 'application/json', 'x-chorus-webhook-secret': webhookSecret },
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await fetch(gateway + '/api/bolna/webhook', {
        method: 'POST',
        body: '{}',
        headers: { 'x-chorus-webhook-secret': webhookSecret },
      })
    ).status,
  ).toBe(415);
  expect(count).toBe(0);
});
it('refuses non-loopback upstreams and missing or reused secrets', () => {
  expect(() =>
    callbackGateway({ backend: 'https://example.com', toolSecret, webhookSecret }),
  ).toThrow(/loopback/);
  expect(() =>
    callbackGateway({ backend: 'http://127.0.0.1:3000', toolSecret, webhookSecret: toolSecret }),
  ).toThrow(/independent/);
});
