import { z } from 'zod';
import { brief } from '../core/engine';
import { config, inCallingWindow, readiness } from '../server/config';
import { capability } from '../server/auth';
import type { Attempt, Mission } from '../core/types';
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
      });
    } catch {
      throw new DispatchError(
        'Provider request timed out or connection failed; reconcile before retrying',
        true,
      );
    }
    if (!r.ok)
      throw new DispatchError(
        `Bolna returned HTTP ${r.status}`,
        r.status >= 500 || r.status === 408,
      );
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
  async browserSession(m: Mission) {
    if (!config.realEnabled || readiness().missing.length)
      throw new Error('Live voice requires completed Bolna and Supabase configuration');
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
