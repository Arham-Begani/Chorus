import { afterAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { decide, requestApproval } from '../../src/core/engine';
import { getMission, insert, pool } from '../../src/server/db';
const owner = `restart-${randomUUID()}`;
// Two native Windows cold starts and graceful queue shutdowns can exceed the
// Linux 30-second budget. Keep that Linux limit and all persistence assertions.
const windowsColdStart = process.platform === 'win32';
const startupTimeoutMs = windowsColdStart ? 90_000 : 10_000;
let child: ChildProcess | undefined;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'worker/index.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout?.on('data', (d) => {
    output += String(d);
  });
  child.stderr?.on('data', (d) => {
    output += String(d);
  });
  const startupDeadline = Date.now() + startupTimeoutMs;
  while (Date.now() < startupDeadline) {
    if (output.includes('CHORUS worker ready')) return;
    if (child.exitCode !== null) throw new Error('Worker failed to start: ' + output);
    await delay(100);
  }
  throw new Error('Worker start timed out: ' + output);
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  child = undefined;
}
afterAll(async () => {
  await stop();
  await pool.query('DELETE FROM chorus_missions WHERE owner_id=$1', [owner]);
  await pool.end();
});
it(
  'a fresh worker process resumes persisted attempts after the previous process exits',
  async () => {
    const m = createMission(owner, 'equipment', 'simulation', defaultConstraints());
    decide(m, requestApproval(m, 'research').id, 1, true);
    await insert(m);
    await start();
    let started = await getMission(m.id, owner);
    for (let i = 0; i < 100; i++) {
      started = await getMission(m.id, owner);
      if (started.attempts.length === 2 && started.attempts.some((a) => a.phase >= 1)) break;
      await delay(100);
    }
    expect(started.attempts).toHaveLength(2);
    await stop();
    const before = await getMission(m.id, owner);
    await delay(300);
    expect((await getMission(m.id, owner)).attempts).toEqual(before.attempts);
    await start();
    let resumed = await getMission(m.id, owner);
    for (let i = 0; i < 150; i++) {
      resumed = await getMission(m.id, owner);
      if (resumed.plan.feasible && resumed.attempts.every((a) => a.status === 'completed')) break;
      await delay(100);
    }
    expect(resumed.plan.feasible).toBe(true);
    expect(resumed.attempts.map((a) => a.id)).toEqual(before.attempts.map((a) => a.id));
    expect(resumed.attempts.every((a) => a.mode === 'simulation')).toBe(true);
    await stop();
  },
  windowsColdStart ? 270_000 : 30_000,
);
