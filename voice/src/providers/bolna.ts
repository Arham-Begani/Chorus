import { z } from 'zod';
import { brief } from '../core/engine';
import { config, inCallingWindow, readiness } from '../server/config';
import { capability } from '../server/auth';
import type { Attempt, Mission } from '../core/types';
import { assertLivePolicy } from '../core/live-policy';
export class DispatchError extends Error {
  constructor(
    message: string,
    public uncertain: boolean,
  ) {
    super(message);
  }
}
export const executionSchema = z
  .object({
    id: z.uuid(),
    status: z.string(),
    transcript: z.string().nullish(),
    recording_url: z.string().nullish(),
    total_cost: z.number().nonnegative().nullish(),
  })
  .passthrough();
export function assertCanDial(m: Mission, taskId: string) {
  if (!config.realEnabled || readiness().missing.length)
    throw new DispatchError('Live calling is disabled or credentials are incomplete', false);
  if (process.env.LIVE_AGENT_LIMITS_VERIFIED !== 'true')
    throw new DispatchError(
      'Verify provider duration limits, retries disabled, and cost reserve before enabling calls',
      false,
    );
  if (!inCallingWindow()) throw new DispatchError('Outside the authorized calling window', false);
  try {
    assertLivePolicy(process.env);
  } catch (e) {
    throw new DispatchError((e as Error).message, false);
  }
  const t = m.tasks.find((t) => t.id === taskId),
    contact = m.contacts.find((c) => c.id === t?.contactId);
  if (
    !contact?.authorized ||
    !/^\+[1-9]\d{7,14}$/.test(contact.phone) ||
    !config.allowlist.includes(contact.phone)
  )
    throw new DispatchError('Contact is not an authorized allowlisted participant', false);
  if (m.attempts.length > config.maxCalls)
    throw new DispatchError('Mission call limit reached', false);
}
export class BolnaAdapter {
  constructor(private request: typeof fetch = fetch) {}
  async api(path: string, body?: object) {
    const key = process.env.BOLNA_API_KEY;
    if (!key) throw new DispatchError('BOLNA_API_KEY missing', false);
    let r: Response;
    try {
      r = await this.request(`${process.env.BOLNA_API_BASE || 'https://api.bolna.ai'}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      throw new DispatchError(
        'Provider request timed out or connection failed; reconcile before retrying',
        true,
      );
    }
    if (!r.ok) {
      let hint = '';
      try {
        const data = await r.json();
        const message =
          typeof data.message === 'string'
            ? data.message
            : typeof data.detail === 'string'
              ? data.detail
              : '';
        // Translate recognized provider failures; never echo arbitrary response text,
        // which may contain recipient numbers, request data or credentials.
        if (/verif|trial/i.test(message))
          hint = ' Verify the test destination in Bolna before trying again.';
        else if (/balance|credit|wallet/i.test(message))
          hint = ' Check available Bolna credits before trying again.';
        else if (/phone|number|caller/i.test(message))
          hint = ' Check the account default caller number and destination in Bolna.';
      } catch {
        /* An unreadable error body still has a definitive HTTP status. */
      }
      throw new DispatchError(
        `Bolna returned HTTP ${r.status}.${hint}`,
        r.status >= 500 || r.status === 408,
      );
    }
    try {
      return await r.json();
    } catch {
      throw new DispatchError(
        'Provider returned an unreadable response; reconcile before retrying',
        true,
      );
    }
  }
  async dispatch(m: Mission, a: Attempt) {
    assertCanDial(m, a.taskId);
    const t = m.tasks.find((t) => t.id === a.taskId)!;
    const c = m.contacts.find((c) => c.id === t.contactId)!;
    const token = capability({
      role: 'phone',
      ownerId: m.ownerId,
      missionId: m.id,
      taskId: t.id,
      attemptId: a.id,
    });
    const data = await this.api('/call', {
      agent_id: process.env.BOLNA_PHONE_AGENT_ID,
      recipient_phone_number: c.phone,
      user_data: {
        chorus_token: token,
        mission_id: m.id,
        task_id: t.id,
        attempt_id: a.id,
        brief: JSON.stringify(brief(m, t)),
        max_duration_seconds: Number(process.env.MAX_CALL_SECONDS || 180),
      },
    });
    const parsed = z.object({ execution_id: z.uuid() }).safeParse(data);
    if (!parsed.success)
      throw new DispatchError('Missing execution id; dispatch is uncertain', true);
    return parsed.data.execution_id;
  }
  async execution(id: string) {
    return executionSchema.parse(await this.api(`/executions/${z.uuid().parse(id)}`));
  }
  async stopPending(id: string) {
    return this.api(`/call/${z.uuid().parse(id)}/stop`, {});
  }
  assertBrowserReady(m: Mission) {
    if (!config.realEnabled || readiness().missing.length)
      throw new Error('Live voice requires completed Bolna and Supabase configuration');
    if (m.mode !== 'real' || m.status === 'paused')
      throw new Error('Open a real mission and resume it before connecting paid browser voice.');
    if (process.env.LIVE_AGENT_LIMITS_VERIFIED !== 'true')
      throw new Error(
        'Verify conductor duration, disabled retries and cost reserve before connecting paid voice.',
      );
    if (!inCallingWindow()) throw new Error('Outside the authorized calling window');
    assertLivePolicy(process.env);
  }
  async browserSession(m: Mission) {
    this.assertBrowserReady(m);
    return this.api('/web-call/freeswitch-session', {
      agent_id: process.env.BOLNA_CONDUCTOR_AGENT_ID,
      user_data: {
        chorus_token: capability({ role: 'conductor', ownerId: m.ownerId, missionId: m.id }),
        mission_id: m.id,
        brief: JSON.stringify({ goal: m.goal, constraints: m.constraints, revision: m.revision }),
      },
    });
  }
}
