import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { insert, mutate, getMission, pool } from '../../src/server/db';
import {
  mintBrowserSession,
  releaseUnusedAllowance,
  reserveLiveCost,
} from '../../src/server/live-budget';
import { reserve as reserveAttempt } from '../../src/core/engine';
import { BolnaAdapter } from '../../src/providers/bolna';
const owner = `live-budget-${randomUUID()}`;
const grants: string[] = [];
beforeEach(() => {
  const id = randomUUID();
  grants.push(id);
  for (const [key, value] of Object.entries({
    LIVE_TEST_ID: id,
    LIVE_TEST_START_AT: new Date(Date.now() - 60000).toISOString(),
    LIVE_TEST_END_AT: new Date(Date.now() + 3600000).toISOString(),
    LIVE_TEST_BUDGET_MINOR: '10000',
    CALL_COST_RESERVE_MINOR: '6000',
    BROWSER_COST_RESERVE_MINOR: '6000',
    MAX_CALL_SECONDS: '180',
  }))
    vi.stubEnv(key, value);
});
afterEach(async () => {
  await pool.query('DELETE FROM chorus_live_reservations WHERE authorization_id=$1', [
    process.env.LIVE_TEST_ID,
  ]);
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await pool.query('DELETE FROM chorus_live_reservations WHERE authorization_id=ANY($1::text[])', [
    grants,
  ]);
  await pool.query('DELETE FROM chorus_missions WHERE owner_id=$1', [owner]);
  await pool.end();
});
async function reserve(kind: 'phone' | 'browser', mission: string = randomUUID()) {
  const c = await pool.connect();
  const id = randomUUID();
  try {
    await c.query('BEGIN');
    await reserveLiveCost(c, mission, id, kind);
    await c.query('COMMIT');
    return id;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
it('serializes concurrent reservations across missions and shares one total budget', async () => {
  const attempts = await Promise.allSettled([reserve('phone'), reserve('browser')]);
  expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (
      await pool.query(
        'SELECT sum(reserve_minor)::int AS n FROM chorus_live_reservations WHERE authorization_id=$1',
        [process.env.LIVE_TEST_ID],
      )
    ).rows[0].n,
  ).toBe(6000);
  await expect(reserve('phone')).rejects.toThrow('total authorized test budget');
});
it('releases an explicit pre-acceptance rejection exactly once and retains its audit row', async () => {
  const m = createMission(owner, 'equipment', 'real', defaultConstraints());
  const id = await reserve('phone', m.id);
  const a = reserveAttempt(m, m.tasks[0], id);
  a.status = 'failed';
  a.error = 'Bolna returned HTTP 400. Verify the test destination in Bolna before trying again.';
  m.callReservedMinor = 6000;
  await insert(m);
  for (let i = 0; i < 2; i++)
    await mutate(m.id, owner, async (snapshot, c) =>
      releaseUnusedAllowance(c, snapshot, snapshot.attempts[0]),
    );
  const after = await getMission(m.id, owner);
  expect(after.callReservedMinor).toBe(0);
  expect(after.events.filter((e) => e.type === 'call.allowance-released')).toHaveLength(1);
  expect(
    (
      await pool.query(
        'SELECT reserve_minor,release_reason FROM chorus_live_reservations WHERE id=$1',
        [id],
      )
    ).rows,
  ).toEqual([{ reserve_minor: 6000, release_reason: 'rejected-before-acceptance' }]);
  await reserve('phone');
});
it('keeps provisional zero costs and uncertain dispatches reserved until billing is final', async () => {
  const m = createMission(owner, 'equipment', 'real', defaultConstraints());
  const id = await reserve('phone', m.id);
  const a = reserveAttempt(m, m.tasks[0], id);
  a.status = 'uncertain';
  await insert(m);
  await mutate(m.id, owner, async (snapshot, c) =>
    releaseUnusedAllowance(c, snapshot, snapshot.attempts[0]),
  );
  await mutate(m.id, owner, async (snapshot, c) => {
    const a = snapshot.attempts[0];
    a.status = 'failed';
    a.executionId = randomUUID();
    a.providerStatus = 'busy';
    a.providerCostCents = 0;
    a.providerDurationSeconds = 0;
    a.providerBillingSettled = false;
    await releaseUnusedAllowance(c, snapshot, a);
  });
  expect(
    (await pool.query('SELECT released_at FROM chorus_live_reservations WHERE id=$1', [id])).rows[0]
      .released_at,
  ).toBeNull();
  await mutate(m.id, owner, async (snapshot, c) => {
    snapshot.attempts[0].providerBillingSettled = true;
    await releaseUnusedAllowance(c, snapshot, snapshot.attempts[0]);
  });
  expect(
    (await pool.query('SELECT release_reason FROM chorus_live_reservations WHERE id=$1', [id]))
      .rows[0].release_reason,
  ).toBe('finalized-zero-cost');
});
it('releases a rejected browser mint while retaining uncertain mints', async () => {
  const m = createMission(owner, 'equipment', 'real', defaultConstraints());
  await insert(m);
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ message: 'Trial destination verification required' }, { status: 400 }),
    )
    .mockResolvedValueOnce(Response.json({ testSession: true }));
  const provider = new BolnaAdapter(request);
  vi.spyOn(provider, 'assertBrowserReady').mockImplementation(() => {});
  vi.stubEnv('BOLNA_API_KEY', 'contract-test-only');
  await expect(mintBrowserSession(m, provider)).rejects.toMatchObject({ uncertain: false });
  await expect(mintBrowserSession(m, provider)).resolves.toEqual({ testSession: true });
  expect(request).toHaveBeenCalledTimes(2);
});
it('reserves one browser line across tabs even when there is enough money', async () => {
  vi.stubEnv('LIVE_TEST_BUDGET_MINOR', '100000');
  await reserve('browser');
  await expect(reserve('browser')).rejects.toThrow('already reserved');
  await reserve('phone');
});
it('retains the browser allowance after an uncertain provider mint and prevents a second mint', async () => {
  vi.stubEnv('LIVE_TEST_BUDGET_MINOR', '100000');
  const m = createMission(owner, 'equipment', 'real', defaultConstraints());
  await insert(m);
  const request = vi.fn().mockRejectedValue(new Error('network timeout'));
  const provider = new BolnaAdapter(request);
  vi.spyOn(provider, 'assertBrowserReady').mockImplementation(() => {});
  vi.stubEnv('BOLNA_API_KEY', 'contract-test-only');
  await expect(mintBrowserSession(m, provider)).rejects.toMatchObject({ uncertain: true });
  await expect(mintBrowserSession(m, provider)).rejects.toThrow('already reserved');
  expect(request).toHaveBeenCalledTimes(1);
  expect(
    (
      await pool.query(
        'SELECT reserve_minor FROM chorus_live_reservations WHERE authorization_id=$1',
        [process.env.LIVE_TEST_ID],
      )
    ).rows,
  ).toEqual([{ reserve_minor: 6000 }]);
});
