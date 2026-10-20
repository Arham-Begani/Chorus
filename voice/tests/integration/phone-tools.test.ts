import { afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { POST } from '../../src/app/api/[...path]/route';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { decide, requestApproval, reserve, revise } from '../../src/core/engine';
import { capability } from '../../src/server/auth';
import { getMission, insert, mutate, pool } from '../../src/server/db';
import type { Mission } from '../../src/core/types';
import { bolnaTools } from '../../src/providers/bolna-tools';
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
  return invokeBody(name, { ...data, token: signed }, secret);
}
async function invokeBody(name: string, body: object, secret = shared) {
  const req = new Request(`http://localhost:3000/api/tools/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chorus-tool-secret': secret },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ path: ['tools', name] }) });
}
function generated(name: string, signed: string, args: Record<string, unknown> = {}) {
  const tool = bolnaTools('phone', 'https://callbacks.example.test', shared).find(
    (t) => t.name === name,
  )!;
  const values: Record<string, unknown> = { ...args, chorus_token: signed };
  // Provider $var substitution preserves JSON types/escaping and leaves absent
  // optional variables as markers. This is a contract double, not a live call.
  const body = JSON.parse(JSON.stringify(tool.value.param), (_key, value) =>
    value &&
    typeof value === 'object' &&
    Object.keys(value).length === 1 &&
    '$var' in value &&
    Object.hasOwn(values, value.$var)
      ? values[value.$var]
      : value,
  );
  return invokeBody(name, body);
}
it('generated structured requests save quoted text, exact rupee totals and a confirmed price correction without asking for known details', async () => {
  const m = await fixture(),
    signed = token(m, 1);
  expect((await generated('get_mission_brief', signed)).status).toBe(200);
  const text =
    'Available for "PA speakers".\nDelivery includes the C:\\stage route; no setup time needed.';
  expect((await generated('report_observation', signed, { key: 'available', text })).status).toBe(
    200,
  );
  await generated('get_mission_brief', signed);
  const readyAt = new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString();
  const args = {
    key: 'initial',
    revision: 1,
    price_inr: '₹1,500.50',
    description: 'Delivery of "PA speakers"\nAll fees included.',
    confirmation: 'reported',
    ready_at: readyAt,
    setup_minutes: '0',
  };
  expect(await (await generated('submit_offer', signed, args)).json()).toMatchObject({
    ok: true,
    conversation: { phase: 'confirm' },
  });
  await generated('get_mission_brief', signed);
  const corrected = {
    key: 'correction',
    revision: 1,
    price_inr: '1700.25',
    description: args.description,
    confirmation: 'confirmed',
  };
  expect(await (await generated('submit_offer', signed, corrected)).json()).toMatchObject({
    ok: true,
    conversation: { action: 'end', reason: 'task-complete' },
  });
  const saved = await getMission(m.id, owner);
  expect(saved.observations).toHaveLength(1);
  expect(saved.observations[0].text).toBe(text);
  expect(saved.offers).toHaveLength(2);
  expect(saved.offers.find((o) => !o.stale)).toMatchObject({
    attemptId: m.attempts[1].id,
    priceMinor: 170025,
    readyAt,
    setupMinutes: 0,
    description: args.description,
    confirmation: 'confirmed',
  });
  expect(saved.offers.find((o) => !o.stale)).not.toHaveProperty('capacity');
  expect(saved.plan.feasible).toBe(false);
  expect(await (await generated('submit_offer', signed, corrected)).json()).toMatchObject({
    ok: true,
    duplicate: true,
    conversation: { action: 'end' },
  });
  expect((await getMission(m.id, owner)).offers).toHaveLength(2);
});
it('native quote format recovery identifies the bad field and keeps earlier answers without weakening authentication', async () => {
  const m = await fixture(),
    signed = token(m, 1);
  await generated('get_mission_brief', signed);
  const args = {
    key: 'quote',
    revision: 1,
    price_inr: '1500',
    description: 'Synthetic delivery quote',
    confirmation: 'confirmed',
    ready_at: new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString(),
    setup_minutes: 'thirty',
  };
  expect(await (await generated('submit_offer', signed, args)).json()).toMatchObject({
    ok: false,
    error: { code: 'invalid_arguments', fields: ['setup_minutes'] },
    conversation: { phase: 'repair' },
  });
  expect((await getMission(m.id, owner)).offers).toHaveLength(0);
  expect(
    await (await generated('submit_offer', signed, { ...args, setup_minutes: '30' })).json(),
  ).toMatchObject({ ok: true, conversation: { action: 'end' } });
  const saved = await getMission(m.id, owner);
  expect(saved.offers).toHaveLength(1);
  expect(saved.attempts[1].phoneToolFailures).toBe(0);
  expect(
    (await invoke('submit_offer', signed, { ...args, setup_minutes: '30' }, 'wrong-secret')).status,
  ).toBe(401);
  expect((await getMission(m.id, owner)).offers).toHaveLength(1);
});
it('a new key for the same current quote does not add a source event or offer in PostgreSQL', async () => {
  const m = await fixture(),
    signed = token(m, 1);
  await generated('get_mission_brief', signed);
  const args = {
    key: 'quote',
    revision: 1,
    price_inr: '1500',
    description: 'Synthetic delivery quote',
    confirmation: 'reported',
  };
  await generated('submit_offer', signed, args);
  await generated('get_mission_brief', signed);
  const before = await getMission(m.id, owner);
  expect(
    await (await generated('submit_offer', signed, { ...args, key: 'same-quote-new-key' })).json(),
  ).toMatchObject({ ok: true });
  const after = await getMission(m.id, owner);
  expect(after.offers).toEqual(before.offers);
  expect(after.events.filter((e) => e.type === 'offer.submitted')).toEqual(
    before.events.filter((e) => e.type === 'offer.submitted'),
  );
});
it('a confirmation saved under an already used operation key gets one repair and persists confirmation with a fresh key', async () => {
  const m = await fixture(),
    signed = token(m, 1);
  await generated('get_mission_brief', signed);
  const args = {
    key: 'quote',
    revision: 1,
    price_inr: '1500',
    description: 'Synthetic delivery quote',
    confirmation: 'reported',
    ready_at: new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString(),
    setup_minutes: '30',
  };
  await generated('submit_offer', signed, args);
  await generated('get_mission_brief', signed);
  expect(
    await (await generated('submit_offer', signed, { ...args, confirmation: 'confirmed' })).json(),
  ).toMatchObject({ ok: false, error: { code: 'new_operation_key', fields: ['key'] } });
  expect((await getMission(m.id, owner)).offers.filter((o) => !o.stale)[0].confirmation).toBe(
    'reported',
  );
  await generated('get_mission_brief', signed);
  const repaired = {
    key: 'confirmed',
    revision: 1,
    price_inr: '1500',
    description: args.description,
    confirmation: 'confirmed',
  };
  expect(await (await generated('submit_offer', signed, repaired)).json()).toMatchObject({
    ok: true,
    conversation: { action: 'end' },
  });
  const saved = await getMission(m.id, owner);
  expect(saved.offers.filter((o) => !o.stale)[0]).toMatchObject({
    confirmation: 'confirmed',
    readyAt: args.ready_at,
    setupMinutes: 30,
  });
  expect(saved.attempts[1].quoteOperations).toHaveLength(2);
  expect(saved.attempts[1].phoneToolFailures).toBe(0);
});
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
