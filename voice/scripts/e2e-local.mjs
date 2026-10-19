import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';

// A short-lived, loopback-only test instance. Never edits the operator's .env or auth configuration.
const port = 3002;
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', resolve);
});
await new Promise((resolve) => probe.close(resolve));
const env = {
  ...process.env,
  PORT: String(port),
  CHORUS_HOST: '127.0.0.1',
  APP_ORIGIN: `http://localhost:${port}`,
  AUTH_MODE: 'local',
  SIMULATION_ONLY: 'true',
  ENABLE_REAL_CALLS: 'false',
  SESSION_SECRET: randomBytes(48).toString('hex'),
  DEMO_PASSWORD: randomBytes(24).toString('hex'),
  BOLNA_API_KEY: '',
  CALL_ALLOWLIST: '',
  LIVE_TEST_ID: '',
  LIVE_TEST_START_AT: '',
  LIVE_TEST_END_AT: '',
  LIVE_TEST_BUDGET_MINOR: '',
};
const children = new Set();
function start(args) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
async function cleanup() {
  await Promise.all(
    [...children].map(async (child) => {
      const ended = once(child, 'exit');
      child.kill();
      await ended;
    }),
  );
}
process.once('SIGINT', () => void cleanup().then(() => process.exit(130)));
process.once('SIGTERM', () => void cleanup().then(() => process.exit(143)));
try {
  console.log('Starting temporary simulation test server on loopback port 3002.');
  const web = start(['scripts/start.mjs']);
  let ready = false;
  const startupDeadline = Date.now() + 90000;
  while (Date.now() < startupDeadline) {
    if (web.exitCode !== null) throw new Error('Test web server exited before readiness.');
    try {
      const response = await fetch(`${env.APP_ORIGIN}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Test web/database health check did not become ready.');
  start(['--import', 'tsx', 'worker/index.ts']);
  const tests = start(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)]);
  const [code] = await once(tests, 'exit');
  process.exitCode = code ?? 1;
} finally {
  await cleanup();
}
