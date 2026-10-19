import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { insert, pool } from '../../src/server/db';
import { mintBrowserSession, reserveLiveCost } from '../../src/server/live-budget';
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
async function reserve(kind: 'phone' | 'browser', mission = randomUUID()) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await reserveLiveCost(c, mission, randomUUID(), kind);
    await c.query('COMMIT');
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
