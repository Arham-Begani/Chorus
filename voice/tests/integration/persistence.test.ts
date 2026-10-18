import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { decide, requestApproval, revise } from '../../src/core/engine';
import { activeStatuses } from '../../src/core/types';
import { getMission, insert, mutate, pool } from '../../src/server/db';
import { applyExecution, coordinateTick } from '../../src/server/coordinator';
import { config } from '../../src/server/config';
const owner = `integration-${randomUUID()}`;
afterAll(async () => {
  await pool.query('DELETE FROM chorus_missions WHERE owner_id=$1', [owner]);
  await pool.end();
});
async function advance(id: string, n = 24) {
  for (let i = 0; i < n; i++) {
    await mutate(id, owner, (m) => {
      for (const a of m.attempts) a.dueAt = new Date(0).toISOString();
    });
    await coordinateTick();
  }
  return getMission(id, owner);
}
it('idle coordination and unchanged locked mutations preserve row and projection versions', async () => {
  const m = createMission(owner, 'equipment', 'simulation', defaultConstraints());
  m.status = 'paused';
  await insert(m);
  const versions = async () => ({
    mission: (
      await pool.query('SELECT xmin::text,updated_at FROM chorus_missions WHERE id=$1', [m.id])
    ).rows,
    entities: (
      await pool.query(
        'SELECT kind,id,xmin::text FROM chorus_entities WHERE mission_id=$1 ORDER BY kind,id',
        [m.id],
      )
    ).rows,
  });
  const before = await versions();
  await mutate(m.id, owner, (snapshot) => structuredClone(snapshot));
  await coordinateTick();
  expect(await versions()).toEqual(before);
  await mutate(m.id, owner, (snapshot) => {
    snapshot.title = 'An actual edit still persists';
  });
  expect((await getMission(m.id, owner)).title).toBe('An actual edit still persists');
  expect(await versions()).not.toEqual(before);
});
it('runs relocation, propagates setup timing, revises budget and persists across a fresh DB connection', async () => {
  const m = createMission(owner, 'relocation', 'simulation', defaultConstraints());
  const approval = requestApproval(m, 'research');
  decide(m, approval.id, 1, true);
  await insert(m);
  const initial = await advance(m.id, 16);
  expect(initial.plan.feasible).toBe(true);
  expect(initial.events.some((e) => e.message.includes('15 minutes'))).toBe(true);
  expect(initial.tasks[0].rounds).toBeGreaterThan(1);
  expect(initial.attempts.some((a) => a.lastBrief?.includes('latestAccessAt'))).toBe(true);
  await mutate(m.id, owner, (m) => {
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Budget reduced by user');
    const a = requestApproval(m, 'research');
    decide(m, a.id, 2, true);
  });
  const revised = await advance(m.id, 30);
  expect(revised.plan.feasible).toBe(true);
  expect(revised.plan.totalMinor).toBeLessThanOrEqual(900000);
  expect(revised.offers.some((o) => o.stale)).toBe(true);
  const fresh = new Pool({ connectionString: config.databaseUrl });
  try {
    const read = await fresh.query('SELECT state FROM chorus_missions WHERE id=$1', [m.id]);
    expect(read.rows[0].state.revision).toBe(2);
    expect(read.rows[0].state.plan).toEqual(revised.plan);
    const entities = await fresh.query(
      'SELECT DISTINCT kind FROM chorus_entities WHERE mission_id=$1',
      [m.id],
    );
    expect(entities.rows.map((x) => x.kind)).toEqual(
      expect.arrayContaining([
        'revision',
        'task',
        'contact',
        'dependency',
        'attempt',
        'offer',
        'observation',
        'approval',
      ]),
    );
    const events = await fresh.query(
      'SELECT count(*)::int AS n FROM chorus_events WHERE mission_id=$1',
      [m.id],
    );
    expect(events.rows[0].n).toBe(revised.events.length);
  } finally {
    await fresh.end();
  }
  await expect(getMission(m.id, 'another-user')).rejects.toThrow('Mission not found');
});
it('pause prevents dispatch and a resumed worker continues the same attempts', async () => {
  const m = createMission(owner, 'equipment', 'simulation', defaultConstraints());
  decide(m, requestApproval(m, 'research').id, 1, true);
  await insert(m);
  await coordinateTick();
  const started = await getMission(m.id, owner);
  expect(started.attempts).toHaveLength(2);
  await mutate(m.id, owner, (m) => {
    m.status = 'paused';
  });
  await coordinateTick();
  const paused = await getMission(m.id, owner);
  expect(paused.attempts.map((a) => a.phase)).toEqual(started.attempts.map((a) => a.phase));
  await mutate(m.id, owner, (m) => {
    m.status = 'running';
  });
  const resumed = await advance(m.id, 8);
  expect(resumed.plan.feasible).toBe(true);
  expect(resumed.attempts.map((a) => a.id)).toEqual(started.attempts.map((a) => a.id));
});
it('duplicate and out-of-order callbacks cannot duplicate actions or regress a terminal call', async () => {
  const m = createMission(owner, 'equipment', 'real', defaultConstraints());
  const a = {
    id: randomUUID(),
    taskId: m.tasks[0].id,
    mode: 'real' as const,
    status: 'in-progress' as const,
    executionId: randomUUID(),
    revision: 1,
    phase: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: new Date().toISOString(),
  };
  m.attempts.push(a);
  m.tasks[0].state = 'active';
  await insert(m);
  const payload = {
    id: a.executionId,
    status: 'completed',
    transcript: 'Actual provider fixture for HTTP contract testing only.',
  };
  await mutate(m.id, owner, (m) => applyExecution(m, a.id, payload));
  const before = await getMission(m.id, owner);
  await mutate(m.id, owner, (m) => applyExecution(m, a.id, payload));
  const after = await getMission(m.id, owner);
  expect(after.events).toHaveLength(before.events.length);
  await mutate(m.id, owner, (m) =>
    applyExecution(m, a.id, { id: a.executionId, status: 'ringing' }),
  );
  expect((await getMission(m.id, owner)).attempts[0].status).toBe('completed');
});
it('a stranded dispatch stays uncertain over repeated worker ticks and never redials', async () => {
  const m = createMission(owner, 'equipment', 'real', defaultConstraints());
  m.status = 'running';
  m.approvals.push({
    id: randomUUID(),
    kind: 'research',
    status: 'approved',
    revision: 1,
    evidenceKey: '',
    createdAt: new Date().toISOString(),
  });
  const a = {
    id: randomUUID(),
    taskId: m.tasks[0].id,
    mode: 'real' as const,
    status: 'dispatching' as const,
    revision: 1,
    phase: 0,
    createdAt: new Date(Date.now() - 60000).toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: new Date().toISOString(),
  };
  m.attempts.push(a);
  m.tasks[0].state = 'active';
  m.tasks[1].state = 'blocked';
  await insert(m);
  await coordinateTick();
  await coordinateTick();
  const after = await getMission(m.id, owner);
  expect(after.attempts).toHaveLength(1);
  expect(after.attempts[0].status).toBe('uncertain');
  expect(activeStatuses).toContain('uncertain');
});
it('all business refusals return blocked rather than a fabricated plan', async () => {
  const m = createMission(owner, 'relocation', 'simulation', defaultConstraints());
  m.responses = { venue: [], caterer: [], transport: [] };
  decide(m, requestApproval(m, 'research').id, 1, true);
  await insert(m);
  const end = await advance(m.id, 8);
  expect(end.status).toBe('blocked');
  expect(end.plan.feasible).toBe(false);
  expect(end.offers).toHaveLength(0);
  expect(end.attempts.every((a) => a.mode === 'simulation')).toBe(true);
});
it('simultaneous worker ticks reserve each task once', async () => {
  const m = createMission(owner, 'equipment', 'simulation', defaultConstraints());
  decide(m, requestApproval(m, 'research').id, 1, true);
  await insert(m);
  await Promise.all([coordinateTick(), coordinateTick(), coordinateTick()]);
  const stored = await getMission(m.id, owner);
  expect(stored.attempts).toHaveLength(2);
  expect(new Set(stored.attempts.map((a) => a.taskId)).size).toBe(2);
});
