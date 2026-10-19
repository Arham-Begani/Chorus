import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { assertLivePolicy, livePolicy } from '../core/live-policy';
import { config, inCallingWindow } from './config';
import { mutate, pool } from './db';
import { event } from '../core/engine';
import { setupChecks } from './setup-checks';
import type { Mission } from '../core/types';
import { BolnaAdapter } from '../providers/bolna';

// Caller owns a short transaction. Serialize browser and worker cost reservations
// across missions/processes; never hold this lock across a provider network request.
export async function reserveLiveCost(
  c: PoolClient,
  missionId: string,
  id: string,
  kind: 'phone' | 'browser',
) {
  await c.query('SELECT pg_advisory_xact_lock(7401932)');
  const policy = assertLivePolicy(process.env);
  const cost = kind === 'phone' ? policy.phoneReserveMinor : policy.browserReserveMinor;
  const totals = await c.query(
    'SELECT coalesce(sum(reserve_minor),0)::bigint AS reserved FROM chorus_live_reservations WHERE authorization_id=$1',
    [policy.id],
  );
  if (Number(totals.rows[0].reserved) + cost > policy.budgetMinor)
    throw new Error(
      'The total authorized test budget has no room for another session, including browser voice.',
    );
  if (kind === 'browser') {
    const active = await c.query(
      "SELECT 1 FROM chorus_live_reservations WHERE kind='browser' AND lease_until > now() LIMIT 1",
    );
    if (active.rowCount)
      throw new Error(
        'A browser voice session is already reserved. Wait for its bounded lease to expire before reconnecting.',
      );
  }
  await c.query(
    `INSERT INTO chorus_live_reservations(id,authorization_id,mission_id,kind,reserve_minor,lease_until)
     VALUES($1,$2,$3,$4,$5,now()+($6::int * interval '1 second'))`,
    [id, policy.id, missionId, kind, cost, policy.maxSeconds + 135],
  );
}

export async function mintBrowserSession(m: Mission, provider = new BolnaAdapter()) {
  const snapshot = await mutate(m.id, m.ownerId, async (current, c) => {
    provider.assertBrowserReady(current);
    await reserveLiveCost(c, m.id, randomUUID(), 'browser');
    event(
      current,
      'voice.reserved',
      'A bounded browser voice session was admitted against the total test budget.',
    );
    return structuredClone(current);
  });
  // Even a lost response keeps its conservative reserve. Never retry a mint automatically.
  return provider.browserSession(snapshot);
}

export async function liveReadiness() {
  const policy = livePolicy(process.env);
  const totals = policy.valid
    ? await pool.query(
        'SELECT coalesce(sum(reserve_minor),0)::bigint AS reserved, count(*)::int AS sessions FROM chorus_live_reservations WHERE authorization_id=$1',
        [policy.id],
      )
    : null;
  const reservedMinor = Number(totals?.rows[0].reserved || 0);
  return {
    enabled: config.realEnabled,
    checks: setupChecks(process.env),
    policy: {
      state: policy.state,
      startAt: policy.startAt,
      endAt: policy.endAt,
      budgetMinor: policy.budgetMinor,
      phoneReserveMinor: policy.phoneReserveMinor,
      browserReserveMinor: policy.browserReserveMinor,
      reservedMinor,
      remainingMinor: Math.max(0, policy.budgetMinor - reservedMinor),
      sessions: totals?.rows[0].sessions || 0,
    },
    withinCallingHours: inCallingWindow(),
    outboundConcurrency: config.maxOutbound,
  };
}
