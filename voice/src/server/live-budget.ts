import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { assertLivePolicy, livePolicy } from '../core/live-policy';
import { config, inCallingWindow } from './config';
import { mutate, pool } from './db';
import { event } from '../core/engine';
import { setupChecks } from './setup-checks';
import type { Attempt, Mission } from '../core/types';
import { BolnaAdapter, DispatchError } from '../providers/bolna';

export async function releaseUnusedAllowance(
  c: PoolClient,
  m: Mission,
  a: Pick<
    Attempt,
    | 'id'
    | 'status'
    | 'error'
    | 'executionId'
    | 'providerBillingSettled'
    | 'providerCostCents'
    | 'providerDurationSeconds'
  >,
) {
  if (m.mode !== 'real') return;
  const rejected =
    a.status === 'failed' &&
    !a.executionId &&
    /^Bolna returned HTTP (?:400|401|403|404|422|429)\b/.test(a.error || '');
  const zero =
    ['completed', 'failed'].includes(a.status) &&
    !!a.executionId &&
    a.providerBillingSettled === true &&
    a.providerCostCents === 0 &&
    a.providerDurationSeconds === 0;
  if (!rejected && !zero) return;
  await c.query('SELECT pg_advisory_xact_lock(7401932)');
  const reason = rejected ? 'rejected-before-acceptance' : 'finalized-zero-cost';
  const released = await c.query(
    'UPDATE chorus_live_reservations SET released_at=now(),release_reason=$3 WHERE id=$1 AND mission_id=$2 AND released_at IS NULL RETURNING kind,reserve_minor',
    [a.id, m.id, reason],
  );
  if (released.rowCount) {
    if (released.rows[0].kind === 'phone')
      m.callReservedMinor = Math.max(0, m.callReservedMinor - released.rows[0].reserve_minor);
    event(
      m,
      'call.allowance-released',
      rejected
        ? 'Provider rejected this request before acceptance. Its unused allowance was released; the audit record is retained.'
        : 'Provider finalized a zero-duration, zero-cost execution. Its unused allowance was released; the audit record is retained.',
      a.id,
    );
  }
}

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
    'SELECT coalesce(sum(reserve_minor),0)::bigint AS reserved FROM chorus_live_reservations WHERE authorization_id=$1 AND released_at IS NULL',
    [policy.id],
  );
  if (Number(totals.rows[0].reserved) + cost > policy.budgetMinor)
    throw new Error(
      'The total authorized test budget has no room for another session, including browser voice.',
    );
  if (kind === 'browser') {
    const active = await c.query(
      "SELECT 1 FROM chorus_live_reservations WHERE kind='browser' AND released_at IS NULL AND lease_until > now() LIMIT 1",
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
  const reservationId = randomUUID();
  const snapshot = await mutate(m.id, m.ownerId, async (current, c) => {
    provider.assertBrowserReady(current);
    await reserveLiveCost(c, m.id, reservationId, 'browser');
    event(
      current,
      'voice.reserved',
      'A bounded browser voice session was admitted against the total test budget.',
    );
    return structuredClone(current);
  });
  // Even a lost response keeps its conservative reserve. Never retry a mint automatically.
  try {
    return await provider.browserSession(snapshot);
  } catch (e) {
    if (
      e instanceof DispatchError &&
      !e.uncertain &&
      /^Bolna returned HTTP (?:400|401|403|404|422|429)\b/.test(e.message)
    )
      await mutate(m.id, m.ownerId, async (current, c) => {
        await releaseUnusedAllowance(c, current, {
          id: reservationId,
          status: 'failed',
          error: e.message,
        });
      });
    throw e;
  }
}

export async function liveReadiness() {
  const policy = livePolicy(process.env);
  const totals = policy.valid
    ? await pool.query(
        'SELECT coalesce(sum(reserve_minor) FILTER (WHERE released_at IS NULL),0)::bigint AS reserved, count(*)::int AS sessions FROM chorus_live_reservations WHERE authorization_id=$1',
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
