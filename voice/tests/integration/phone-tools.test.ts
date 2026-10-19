import { afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { POST } from '../../src/app/api/[...path]/route';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { decide, requestApproval, reserve, revise } from '../../src/core/engine';
import { capability } from '../../src/server/auth';
import { getMission, insert, mutate, pool } from '../../src/server/db';
import type { Mission } from '../../src/core/types';
const owner = `phone-contract-${randomUUID()}`;
const shared = 'integration-only-tool-secret-'.repeat(2);
vi.stubEnv('BOLNA_TOOL_SECRET', shared);
afterAll(async () => {
  await pool.query('DELETE FROM chorus_missions WHERE owner_id=$1', [owner]);
  vi.unstubAllEnvs();
  await pool.end();
});
async function fixture() {
  const m = createMission(
    owner,
    'equipment',
    'real',
    defaultConstraints(),
    'Synthetic contract fixture: research a sound system and delivery for 40 people. This is not a live call.',
  );
  decide(m, requestApproval(m, 'research').id, 1, true, 10000);
  for (const t of m.tasks) {
    const a = reserve(m, t);
    a.status = 'in-progress';
    a.executionId = randomUUID();
  }
  await insert(m);
  return m;
}
function token(m: Mission, index = 0) {
  const a = m.attempts[index];
  return capability({
    role: 'phone',
    ownerId: owner,
    missionId: m.id,
    taskId: a.taskId,
    attemptId: a.id,
  });
}
async function invoke(name: string, signed: string, data: object = {}, secret = shared) {
  const req = new Request(`http://localhost:3000/api/tools/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chorus-tool-secret': secret },
    body: JSON.stringify({ ...data, token: signed }),
  });
  return POST(req, { params: Promise.resolve({ path: ['tools', name] }) });
}
it('actual authenticated tool routes persist two sourced quotes and evaluate the equipment/delivery plan without dialing', async () => {
  const m = await fixture();
  for (let index = 0; index < 2; index++) {
    const signed = token(m, index);
    const read = await invoke('get_mission_brief', signed);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      goal: m.goal,
      taskKind: index === 0 ? 'equipment' : 'delivery',
    });
    expect(
      (
        await invoke('report_observation', signed, {
          key: 'available',
          text: `${index === 0 ? 'Equipment' : 'Delivery'} is available on the requested date.`,
        })
      ).status,
    ).toBe(200);
    await invoke('get_mission_brief', signed);
    const terms = {
      priceMinor: index === 0 ? 500000 : 150000,
      currency: 'INR',
      description: index === 0 ? 'Sound system and microphones' : 'Delivery and installation',
      confirmation: 'confirmed',
      ...(index === 0 ? { capacity: 40 } : { setupMinutes: 30 }),
      readyAt: new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString(),
    };
    const response = await invoke('submit_offer', signed, {
      payload_json: JSON.stringify({ key: 'agreed-quote', revision: 1, terms }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      conversation: { action: 'end', reason: 'task-complete' },
    });
  }
  const saved = await getMission(m.id, owner);
  expect(saved.observations).toHaveLength(2);
  expect(saved.offers.map((o) => o.attemptId)).toEqual(m.attempts.map((a) => a.id));
  expect(saved.plan).toMatchObject({ feasible: true, totalMinor: 650000 });
  expect(saved.approvals.find((a) => a.kind === 'plan')?.status).toBe('requested');
  expect(saved.status).toBe('ready');
  await mutate(m.id, owner, (snapshot) => {
    revise(
      snapshot,
      { ...snapshot.constraints, budgetMinor: 600000 },
      'Synthetic owner budget revision',
    );
    snapshot.status = 'paused';
  });
  const revised = await getMission(m.id, owner);
  expect(revised.offers.every((o) => o.stale)).toBe(true);
  expect(
    revised.approvals.filter((a) => a.kind === 'plan').every((a) => a.status === 'stale'),
  ).toBe(true);
});
it('the repeated-read stop survives a new database connection and rejects further mutations idempotently', async () => {
  const m = await fixture(),
    signed = token(m);
  await invoke('get_mission_brief', signed);
  await invoke('get_mission_brief', signed);
  const fresh = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const saved = (await fresh.query('SELECT state FROM chorus_missions WHERE id=$1', [m.id]))
      .rows[0].state;
    expect(saved.attempts[0].unchangedBriefReads).toBe(2);
  } finally {
    await fresh.end();
  }
  await invoke('get_mission_brief', signed);
  const end = await invoke('get_mission_brief', signed);
  expect(await end.json()).toMatchObject({
    conversation: { action: 'end', reason: 'repeated-brief-reads' },
  });
  const before = await getMission(m.id, owner);
  expect(
    (
      await (
        await invoke('report_observation', signed, { key: 'late', text: 'Should not be added' })
      ).json()
    ).ok,
  ).toBe(false);
  expect(await getMission(m.id, owner)).toEqual(before);
});
it('format recovery never weakens shared-secret, scope or phone-role enforcement', async () => {
  const m = await fixture(),
    signed = token(m);
  expect((await invoke('get_mission_brief', signed, {}, 'wrong-secret')).status).toBe(401);
  expect((await invoke('update_mission_constraints', signed, { payload_json: '{' })).status).toBe(
    403,
  );
  const first = await invoke('submit_offer', signed, { payload_json: '{' });
  expect(await first.json()).toMatchObject({
    ok: false,
    error: { code: 'invalid_arguments' },
    conversation: { action: 'continue' },
  });
  const second = await invoke('submit_offer', signed, { payload_json: 'null' });
  expect(await second.json()).toMatchObject({
    ok: false,
    conversation: { action: 'end', reason: 'repeated-tool-errors' },
  });
  const saved = await getMission(m.id, owner);
  expect(saved.offers).toHaveLength(0);
  expect(saved.constraints).toEqual(m.constraints);
});
