import { activeStatuses, type Attempt, type CallStatus, type Mission } from '../core/types';
import { event, evaluate, mergeStatus, replan, researchApproved, reserve } from '../core/engine';
import { pool, mutate } from './db';
import { config } from './config';
import { assertCanDial, BolnaAdapter, DispatchError, executionSchema } from '../providers/bolna';
import { SimulationAdapter } from '../providers/simulation';
const simulation = new SimulationAdapter();
export function applyExecution(m: Mission, attemptId: string, input: unknown) {
  const data = executionSchema.parse(input);
  const a = m.attempts.find((a) => a.id === attemptId && a.mode === 'real');
  if (!a || a.executionId !== data.id) throw new Error('Unknown execution');
  const key = `execution:${data.id}:${data.status}`;
  if (m.processedKeys.includes(key)) return;
  const known: CallStatus[] = [
    'queued',
    'initiated',
    'ringing',
    'in-progress',
    'call-disconnected',
    'completed',
    'failed',
  ];
  const failures = ['busy', 'no-answer', 'canceled', 'cancelled', 'error', 'stopped'];
  let status: CallStatus;
  if (known.includes(data.status as CallStatus)) status = data.status as CallStatus;
  else if (failures.includes(data.status)) status = 'failed';
  else return;
  a.status = mergeStatus(a.status, status);
  a.updatedAt = new Date().toISOString();
  if (a.status === 'completed') {
    if (data.transcript) a.transcript = data.transcript;
    if (data.recording_url && data.recording_url.startsWith('https://'))
      a.recordingUrl = data.recording_url;
  }
  if (['completed', 'failed'].includes(a.status)) {
    const t = m.tasks.find((t) => t.id === a.taskId)!;
    t.state = m.offers.some((o) => o.attemptId === a.id && !o.stale && !o.declined)
      ? 'complete'
      : a.revision < m.revision && t.rounds < 3
        ? 'pending'
        : 'blocked';
    if (t.state === 'blocked')
      t.question =
        'Call ended without current structured terms. Review evidence and explicitly retry if appropriate.';
  }
  m.processedKeys.push(key);
  event(m, 'call.status', `Provider call status: ${a.status}`, a.id);
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
      "SELECT id FROM chorus_missions WHERE status IN ('running','blocked','ready','approved','paused') ORDER BY created_at",
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
    const all = await pool.query('SELECT state FROM chorus_missions');
    let activeReal = all.rows
      .flatMap((r) => (r.state as Mission).attempts)
      .filter((a) => a.mode === 'real' && activeStatuses.includes(a.status)).length;
    const dispatches: { missionId: string; attempt: Attempt }[] = [];
    for (const { id } of rows.rows) {
      await mutate(id, undefined, (m) => {
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
          if (m.mode === 'real') {
            try {
              assertCanDial(m, t.id);
              if (m.attempts.length >= config.maxCalls)
                throw new Error('Mission calling limit reached');
              if (m.callReservedMinor + config.reserveMinor > m.callBudgetMinor)
                throw new Error('Approved call-cost budget exhausted; authorize a new budget');
            } catch (e) {
              t.state = 'blocked';
              t.question = (e as Error).message;
              event(m, 'dispatch.blocked', t.question);
              continue;
            }
            m.callReservedMinor += config.reserveMinor;
            activeReal++;
          }
          const a = reserve(m, t);
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
          await mutate(missionId, undefined, (m) => {
            const a = m.attempts.find((a) => a.id === attempt.id)!;
            a.status = e instanceof DispatchError && !e.uncertain ? 'failed' : 'uncertain';
            a.error = (e as Error).message;
            if (a.status === 'failed') m.tasks.find((t) => t.id === a.taskId)!.state = 'blocked';
            event(m, `call.${a.status}`, a.error!, a.id);
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
          activeStatuses.includes(a.status) &&
          Date.now() - Date.parse(a.updatedAt) > 5000,
      )) {
        try {
          if (m.status === 'paused' && a.status === 'queued')
            await provider.stopPending(a.executionId!);
          const data = await provider.execution(a.executionId!);
          await mutate(id, undefined, (m) => applyExecution(m, a.id, data));
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
