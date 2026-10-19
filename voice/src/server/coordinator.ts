import { activeStatuses, type Attempt, type CallStatus, type Mission } from '../core/types';
import { event, evaluate, mergeStatus, replan, researchApproved, reserve } from '../core/engine';
import { pool, mutate } from './db';
import { config, inCallingWindow } from './config';
import { livePolicy } from '../core/live-policy';
import { assertCanDial, BolnaAdapter, DispatchError, executionSchema } from '../providers/bolna';
import { SimulationAdapter } from '../providers/simulation';
import { releaseUnusedAllowance, reserveLiveCost } from './live-budget';
import { randomUUID } from 'node:crypto';
const simulation = new SimulationAdapter();
export function applyExecution(m: Mission, attemptId: string, input: unknown) {
  const data = executionSchema.parse(input);
  const a = m.attempts.find((a) => a.id === attemptId && a.mode === 'real');
  if (!a || a.executionId !== data.id) throw new Error('Unknown execution');
  const known: CallStatus[] = [
    'queued',
    'initiated',
    'ringing',
    'in-progress',
    'call-disconnected',
    'completed',
    'failed',
  ];
  const failures = [
    'busy',
    'no-answer',
    'canceled',
    'cancelled',
    'error',
    'stopped',
    'balance-low',
  ];
  let status: CallStatus;
  if (known.includes(data.status as CallStatus)) status = data.status as CallStatus;
  else if (failures.includes(data.status)) status = 'failed';
  else if (['scheduled', 'rescheduled'].includes(data.status)) status = 'queued';
  else return;
  const previous = a.status;
  a.status = mergeStatus(previous, status);
  const terminal = ['completed', 'failed'].includes(a.status);
  let artifactsChanged = false;
  // Transcripts/recordings can be attached after the first terminal callback.
  // Deduplicate the actual state change, rather than discarding every repeated status.
  if (terminal && status === a.status) {
    if (
      data.conversation_duration != null &&
      (a.providerDurationSeconds === undefined ||
        data.conversation_duration > a.providerDurationSeconds)
    ) {
      a.providerDurationSeconds = data.conversation_duration;
      artifactsChanged = true;
    }
    if (data.billing_settled === true && !a.providerBillingSettled) {
      a.providerBillingSettled = true;
      artifactsChanged = true;
    }
    if (
      data.total_cost != null &&
      (a.providerCostCents === undefined || data.total_cost > a.providerCostCents)
    ) {
      a.providerCostCents = data.total_cost;
      artifactsChanged = true;
    }
    if (data.transcript && data.transcript !== a.transcript) {
      a.transcript = data.transcript;
      artifactsChanged = true;
    }
    if (
      data.recording_url &&
      /^https:\/\//.test(data.recording_url) &&
      data.recording_url !== a.recordingUrl
    ) {
      a.recordingUrl = data.recording_url;
      artifactsChanged = true;
    }
  }
  if (previous === a.status && !artifactsChanged) return;
  a.updatedAt = new Date().toISOString();
  if (previous !== a.status) a.providerStatus = data.status;
  if (terminal && previous !== a.status) {
    a.artifactPollCount = 0;
    a.artifactNextPollAt = new Date(Date.now() + 15000).toISOString();
    const t = m.tasks.find((t) => t.id === a.taskId)!;
    t.state = m.offers.some((o) => o.attemptId === a.id && !o.stale && !o.declined)
      ? 'complete'
      : a.revision < m.revision && t.rounds < 3
        ? 'pending'
        : 'blocked';
    if (t.state === 'blocked')
      t.question =
        (
          {
            busy: 'The participant’s line was busy. Confirm they are available before explicitly authorizing another attempt.',
            'no-answer':
              'The participant did not answer. Arrange a suitable time before explicitly authorizing another attempt.',
            'balance-low':
              'Bolna could not place this call because the provider wallet is low. Review credits before an explicit retry.',
            canceled:
              'The provider call was canceled before a conversation. No automatic retry is scheduled.',
            cancelled:
              'The provider call was canceled before a conversation. No automatic retry is scheduled.',
            stopped:
              'The provider call was stopped. Review its evidence before explicitly retrying.',
          } as Record<string, string>
        )[data.status] ||
        'Call ended without current structured terms. Review evidence and explicitly retry if appropriate.';
  }
  if (a.transcript && a.recordingUrl) delete a.artifactNextPollAt;
  event(
    m,
    previous !== a.status ? 'call.status' : 'call.artifacts',
    previous !== a.status
      ? `Provider call status: ${a.status}`
      : 'Provider evidence is now available.',
    a.id,
  );
  evaluate(m);
}
export function recoverDispatches(m: Mission, now = Date.now()) {
  for (const a of m.attempts)
    if (a.mode === 'real' && a.status === 'dispatching' && now - Date.parse(a.createdAt) > 45000) {
      a.status = 'uncertain';
      a.error =
        'Worker interrupted after reservation. Reconcile with provider call history before any further attempt.';
      event(m, 'call.uncertain', a.error, a.id);
    }
}
export async function coordinateTick(provider = new BolnaAdapter()) {
  const lock = await pool.connect();
  const got = await lock.query('SELECT pg_try_advisory_lock(7401931) AS locked');
  if (!got.rows[0].locked) {
    lock.release();
    return;
  }
  try {
    const rows = await pool.query(
      `SELECT id FROM chorus_missions
       WHERE status IN ('running','blocked')
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(state->'attempts') AS a(value)
                     WHERE a.value->>'status' = ANY($1::text[])
                        OR (a.value->>'mode'='real' AND a.value ? 'artifactNextPollAt'))
       ORDER BY created_at`,
      [activeStatuses],
    );
    for (const { id } of rows.rows) {
      await mutate(id, undefined, (m) => {
        recoverDispatches(m);
        if (m.mode === 'simulation' && m.status !== 'paused')
          for (const a of m.attempts) if (activeStatuses.includes(a.status)) simulation.step(m, a);
        replan(m);
      });
    }
    // Query global admission after progress. Uncertain attempts occupy concurrency slots.
    const active = await pool.query(
      `SELECT count(*)::int AS count FROM chorus_missions,
       LATERAL jsonb_array_elements(state->'attempts') AS a(value)
       WHERE a.value->>'mode' = 'real' AND a.value->>'status' = ANY($1::text[])`,
      [activeStatuses],
    );
    let activeReal: number = active.rows[0].count;
    const dispatches: { missionId: string; attempt: Attempt }[] = [];
    for (const { id } of rows.rows) {
      await mutate(id, undefined, async (m, client) => {
        if (
          m.status === 'paused' ||
          !researchApproved(m) ||
          !['running', 'blocked'].includes(m.status)
        )
          return;
        let slots =
          m.mode === 'simulation'
            ? 3 - m.attempts.filter((a) => activeStatuses.includes(a.status)).length
            : config.maxOutbound - activeReal;
        for (const t of m.tasks.filter((t) => t.state === 'pending')) {
          if (slots <= 0) break;
          if (m.attempts.some((a) => a.taskId === t.id && activeStatuses.includes(a.status)))
            continue;
          const attemptId = randomUUID();
          if (m.mode === 'real') {
            try {
              assertCanDial(m, t.id);
              if (m.attempts.length >= config.maxCalls)
                throw new Error('Mission calling limit reached');
              if (m.callReservedMinor + config.reserveMinor > m.callBudgetMinor)
                throw new Error('Approved call-cost budget exhausted; authorize a new budget');
              await reserveLiveCost(client, m.id, attemptId, 'phone');
            } catch (e) {
              t.state = 'blocked';
              t.dispatchBlocked = true;
              t.question = (e as Error).message;
              event(m, 'dispatch.blocked', t.question);
              continue;
            }
            m.callReservedMinor += config.reserveMinor;
            activeReal++;
          }
          const a = reserve(m, t, attemptId);
          slots--;
          if (m.mode === 'simulation') {
            a.status = 'queued';
            a.executionId = `sim-${a.id}`;
          } else dispatches.push({ missionId: m.id, attempt: structuredClone(a) });
        }
        evaluate(m);
      });
    }
    // Attempts were committed above. A crash from here on must never cause a blind repeat.
    await Promise.all(
      dispatches.map(async ({ missionId, attempt }) => {
        // Serialize the final pause check with mutations. Marking network start is the admission boundary.
        const snapshot = await mutate(missionId, undefined, (m) => {
          const a = m.attempts.find((a) => a.id === attempt.id)!;
          if (m.status === 'paused' || !researchApproved(m)) {
            a.status = 'failed';
            a.error = 'Paused before dispatch';
            m.tasks.find((t) => t.id === a.taskId)!.state = 'pending';
            return null;
          }
          event(m, 'call.dispatching', 'Outbound request admitted.', a.id);
          return structuredClone(m);
        });
        if (!snapshot) return;
        try {
          const executionId = await provider.dispatch(snapshot, attempt);
          await mutate(missionId, undefined, (m) => {
            const a = m.attempts.find((a) => a.id === attempt.id)!;
            a.executionId = executionId;
            a.status = mergeStatus(a.status, 'queued');
            a.updatedAt = new Date().toISOString();
            event(m, 'call.queued', 'Bolna accepted the outbound call.', a.id);
          });
        } catch (e) {
          await mutate(missionId, undefined, async (m, client) => {
            const a = m.attempts.find((a) => a.id === attempt.id)!;
            a.status = e instanceof DispatchError && !e.uncertain ? 'failed' : 'uncertain';
            a.error = (e as Error).message;
            if (a.status === 'failed') {
              const t = m.tasks.find((t) => t.id === a.taskId)!;
              t.state = 'blocked';
              t.dispatchBlocked = true;
              t.question = a.error;
            }
            event(m, `call.${a.status}`, a.error!, a.id);
            await releaseUnusedAllowance(client, m, a);
          });
        }
      }),
    );
    for (const { id } of rows.rows) {
      const r = await pool.query('SELECT state FROM chorus_missions WHERE id=$1', [id]);
      const m = r.rows[0].state as Mission;
      for (const a of m.attempts.filter(
        (a) =>
          a.mode === 'real' &&
          a.executionId &&
          ((activeStatuses.includes(a.status) && Date.now() - Date.parse(a.updatedAt) > 5000) ||
            (a.artifactNextPollAt && Date.parse(a.artifactNextPollAt) <= Date.now())),
      )) {
        try {
          if (!activeStatuses.includes(a.status)) {
            await mutate(id, undefined, (snapshot) => {
              const stored = snapshot.attempts.find((x) => x.id === a.id)!;
              stored.artifactPollCount = (stored.artifactPollCount || 0) + 1;
              if (stored.artifactPollCount >= 6) delete stored.artifactNextPollAt;
              else stored.artifactNextPollAt = new Date(Date.now() + 30000).toISOString();
            });
          }
          if (
            (m.status === 'paused' ||
              !inCallingWindow() ||
              livePolicy(process.env).state !== 'active') &&
            a.status === 'queued'
          )
            await provider.stopPending(a.executionId!);
          const data = await provider.execution(a.executionId!);
          if (['scheduled', 'rescheduled'].includes(data.status))
            await provider.stopPending(a.executionId!);
          await mutate(id, undefined, async (m, client) => {
            applyExecution(m, a.id, data);
            await releaseUnusedAllowance(client, m, m.attempts.find((x) => x.id === a.id)!);
          });
        } catch {
          /* Persisted call remains eligible for later polling; never dispatch it again. */
        }
      }
    }
  } finally {
    await lock.query('SELECT pg_advisory_unlock(7401931)');
    lock.release();
  }
}
