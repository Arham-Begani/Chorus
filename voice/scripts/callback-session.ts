import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { callbackGateway } from '../src/server/callback-gateway';
import {
  callbackEnvironment,
  requireSimulationConfiguration,
  sessionMinutes,
  tunnelOrigin,
} from '../src/server/callback-session';

// This command never reads account billing, enables calls, synchronizes agents or dials.
const args = process.argv.slice(2);
const start = args[0] === '--start';
if (!start || args.length !== 4 || args[1] !== '--cloudflared')
  throw new Error(
    'Usage: node --env-file=.env --import tsx scripts/callback-session.ts --start --cloudflared ABSOLUTE_PATH MINUTES',
  );
const executable = args[2];
const minutes = sessionMinutes(args[3]);
if (!isAbsolute(executable) || !existsSync(executable))
  throw new Error('Supply the installed cloudflared executable.');
requireSimulationConfiguration(process.env);
const health = await fetch('http://127.0.0.1:3000/api/health', {
  signal: AbortSignal.timeout(5000),
});
if (!health.ok || !(await health.json()).ok)
  throw new Error('Restore the local app and database first.');
const gateway = callbackGateway({
  backend: 'http://127.0.0.1:3000',
  toolSecret: process.env.BOLNA_TOOL_SECRET || '',
  webhookSecret: process.env.BOLNA_WEBHOOK_SECRET || '',
});
await new Promise<void>((resolve, reject) => {
  gateway.once('error', reject);
  gateway.listen(3001, '127.0.0.1', resolve);
});
mkdirSync('.data/callback-sessions', { recursive: true, mode: 0o700 });
const stem = `.data/callback-sessions/${Date.now()}-${randomUUID()}`;
const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
let tunnel: ChildProcess | undefined;
let closing = false;
let expiry: ReturnType<typeof setTimeout> | undefined;
const record = (phase: string) =>
  writeFileSync(
    `${stem}.private.json`,
    JSON.stringify(
      { phase, pid: process.pid, tunnelPid: tunnel?.pid, expiresAt, port: 3001 },
      null,
      2,
    ),
    { mode: 0o600 },
  );
const close = () => {
  if (closing) return;
  closing = true;
  if (expiry) clearTimeout(expiry);
  tunnel?.kill();
  gateway.closeAllConnections();
  gateway.close();
  try {
    record('closed');
  } catch {
    /* Closing owned processes takes priority over log persistence. */
  }
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
process.once('exit', close);
expiry = setTimeout(close, minutes * 60000);
try {
  let log = '';
  tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3001'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Temporary HTTPS startup timed out.')),
      30000,
    );
    const finish = (error?: Error, value?: string) => {
      clearTimeout(timeout);
      error ? reject(error) : resolve(value!);
    };
    tunnel!.once('error', () =>
      finish(new Error('Could not start the installed tunnel executable.')),
    );
    tunnel!.once('exit', () => {
      if (!closing) {
        finish(new Error('Temporary HTTPS process exited.'));
        close();
      }
    });
    const onData = (chunk: Buffer) => {
      appendFileSync(`${stem}.log`, chunk, { mode: 0o600 });
      log = (log + chunk.toString()).slice(-16000);
      const found = tunnelOrigin(log);
      if (found) finish(undefined, found);
    };
    tunnel!.stdout!.on('data', onData);
    tunnel!.stderr!.on('data', onData);
  });
  record('checking');
  const request = (path: string, body?: object, secret = false) =>
    fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: body
        ? {
            'Content-Type': 'application/json',
            ...(secret ? { 'x-chorus-webhook-secret': process.env.BOLNA_WEBHOOK_SECRET! } : {}),
          }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  // The tunnel can announce its name before routing is ready. Retry read-only probes only.
  let checks = { dashboard: 0, unauthenticated: 0, authenticated: 0 };
  for (let n = 0; n < 4; n++) {
    if (closing) throw new Error('Callback session closed during setup.');
    try {
      checks = {
        dashboard: (await request('/')).status,
        unauthenticated: (await request('/api/bolna/webhook', {})).status,
        authenticated: (
          await request('/api/bolna/webhook', { id: randomUUID(), status: 'completed' }, true)
        ).status,
      };
      if (
        checks.dashboard === 404 &&
        checks.unauthenticated === 401 &&
        checks.authenticated === 202
      )
        break;
    } catch {}
    if (n < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  if (checks.dashboard !== 404 || checks.unauthenticated !== 401 || checks.authenticated !== 202)
    throw new Error('Protected callback probes failed; no configuration was changed.');
  if (closing) throw new Error('Callback session expired before configuration was ready.');
  writeFileSync('.env', callbackEnvironment(readFileSync('.env', 'utf8'), origin), { mode: 0o600 });
  writeFileSync(`${stem}-origin.private.json`, JSON.stringify({ origin, expiresAt }), {
    mode: 0o600,
  });
  record('ready');
  console.log(
    JSON.stringify({
      ready: true,
      port: 3001,
      expiresAt,
      checks,
      callingEnabled: false,
      callsStarted: 0,
    }),
  );
  console.log(
    'Keep this session running through the approved test. Ctrl+C or expiry closes only its own gateway and tunnel.',
  );
} catch (error) {
  writeFileSync(
    `${stem}-failure.private.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        reason: error instanceof Error ? error.message : 'Callback setup failed',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  process.exitCode = 1;
  close();
  console.error(
    'Callback session stopped safely. Inspect its private log; no call or agent update was made.',
  );
} finally {
  if (closing) clearTimeout(expiry);
}
