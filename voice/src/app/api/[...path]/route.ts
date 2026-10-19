import { NextResponse } from 'next/server';
import { z } from 'zod';
import { liveReadiness, mintBrowserSession } from '../../../server/live-budget';
import { randomUUID } from 'node:crypto';
import { assertOrigin, equal, sign, supabase, toolScope, user } from '../../../server/auth';
import { config, readiness } from '../../../server/config';
import { getMission, insert, listMissions, mutate, pool, publicMission } from '../../../server/db';
import { createMission, defaultConstraints } from '../../../core/fixtures';
import {
  brief,
  decide,
  declineOffer,
  evaluate,
  event,
  requestApproval,
  revise,
  retryTask,
} from '../../../core/engine';
import { constraintsSchema, kindSchema, termsSchema, type Mission } from '../../../core/types';
import { BolnaAdapter } from '../../../providers/bolna';
import { applyExecution } from '../../../server/coordinator';
import { executeTool } from '../../../server/tools';
import { conduct } from '../../../server/conductor';
import { goalConstraints } from '../../../core/conductor';
import { requestError } from '../../../server/request-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
const loginAttempts = new Map<string, { count: number; at: number }>();
async function body(req: Request) {
  const text = await req.text();
  if (text.length > 64000) throw new Error('Request too large');
  return text ? JSON.parse(text) : {};
}
async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const p = path.join('/');
    if (req.method !== 'GET') assertOrigin(req);
    if (p === 'health') {
      await pool.query('SELECT 1 FROM chorus_migrations LIMIT 1');
      return json({ ok: true });
    }
    if (p === 'auth' && req.method === 'POST') {
      const data = z
        .object({ password: z.string().max(200), email: z.string().max(200).optional() })
        .strict()
        .parse(await body(req));
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || new URL(req.url).hostname;
      const previous = loginAttempts.get(ip);
      if (previous && Date.now() - previous.at < 60000 && previous.count >= 8)
        return json({ error: 'Too many sign-in attempts. Wait one minute.' }, 429);
      loginAttempts.set(ip, {
        count: previous && Date.now() - previous.at < 60000 ? previous.count + 1 : 1,
        at: previous?.at && Date.now() - previous.at < 60000 ? previous.at : Date.now(),
      });
      if (config.local) {
        if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.url).hostname))
          throw new Error('Local login requires loopback');
        if (!process.env.DEMO_PASSWORD || !equal(data.password, process.env.DEMO_PASSWORD))
          return json({ error: 'Incorrect password' }, 401);
        loginAttempts.delete(ip);
        const response = json({ ok: true });
        response.cookies.set(
          'chorus_session',
          sign({ id: 'local-owner', expires: Date.now() + 8 * 3600000 }),
          {
            httpOnly: true,
            sameSite: 'strict',
            secure: config.origin.startsWith('https'),
            path: '/',
            maxAge: 8 * 3600,
          },
        );
        return response;
      }
      const { data: session, error } = await supabase().auth.signInWithPassword({
        email: data.email || '',
        password: data.password,
      });
      if (error || !session.session) return json({ error: 'Sign-in failed' }, 401);
      loginAttempts.delete(ip);
      const response = json({ ok: true });
      response.cookies.set('chorus_access', session.session.access_token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.origin.startsWith('https'),
        path: '/',
        maxAge: session.session.expires_in,
      });
      return response;
    }
    if (p === 'tools' || p.startsWith('tools/')) {
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const raw = await body(req);
      const token = z.string().parse(raw.token);
      const scope = toolScope(req, token);
      const input =
        raw.payload_json !== undefined
          ? { ...JSON.parse(z.string().max(16000).parse(raw.payload_json)), token }
          : raw;
      const result = await mutate(scope.missionId, scope.ownerId, (m) =>
        executeTool(m, scope, path[1], input),
      );
      return json(result);
    }
    if (p === 'bolna/webhook') {
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const secret = process.env.BOLNA_WEBHOOK_SECRET;
      if (!secret || !equal(req.headers.get('x-chorus-webhook-secret') || '', secret))
        return json({ error: 'Callback authentication rejected' }, 401);
      const input = await body(req);
      const executionId = z.uuid().parse(input.id);
      const rows = await pool.query(
        "SELECT id,state FROM chorus_missions WHERE mode='real' AND state->'attempts' @> $1::jsonb",
        [JSON.stringify([{ executionId }])],
      );
      if (!rows.rowCount)
        return json(
          {
            accepted: false,
            reason: 'Unknown execution; polling will reconcile after dispatch persistence',
          },
          202,
        );
      const m = rows.rows[0].state as Mission;
      const a = m.attempts.find((a) => a.executionId === executionId)!;
      await mutate(m.id, undefined, (m) => applyExecution(m, a.id, input));
      return json({ accepted: true });
    }
    const owner = await user(req);
    if (p === 'conductor' && req.method === 'POST')
      return json(await conduct(owner, await body(req)));
    if (p === 'session') return json({ authenticated: true, readiness: readiness() });
    if (p === 'live-readiness' && req.method === 'GET') return json(await liveReadiness());
    if (p === 'logout') {
      const response = json({ ok: true });
      response.cookies.delete('chorus_session');
      response.cookies.delete('chorus_access');
      return response;
    }
    if (path[0] !== 'missions') return json({ error: 'Not found' }, 404);
    if (path.length === 1) {
      if (req.method === 'GET') return json((await listMissions(owner)).map(publicMission));
      const data = z
        .object({
          scenario: z.enum(['relocation', 'equipment']).default('relocation'),
          mode: z.enum(['simulation', 'real']).default('simulation'),
          constraints: constraintsSchema.optional(),
          goal: z.string().max(3000).optional(),
        })
        .strict()
        .parse(await body(req));
      if (data.mode === 'real' && !config.realEnabled)
        throw new Error('Real mode is disabled. Complete deployment configuration first.');
      const m = createMission(
        owner,
        data.scenario,
        data.mode,
        data.constraints ||
          (data.goal
            ? goalConstraints(data.goal, defaultConstraints()).constraints
            : defaultConstraints()),
        data.goal,
      );
      event(
        m,
        'mission.proposed',
        `${data.mode === 'simulation' ? 'Simulation' : 'Live'} mission proposed. Review constraints and contacts.`,
      );
      requestApproval(m, 'research');
      await insert(m);
      return json(publicMission(m), 201);
    }
    const id = z.uuid().parse(path[1]);
    if (path.length === 2 && req.method === 'GET')
      return json(publicMission(await getMission(id, owner)));
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const action = path[2],
      data = await body(req);
    if (action === 'voice') {
      const m = await getMission(id, owner);
      return json(await mintBrowserSession(m));
    }
    if (action === 'reconcile') {
      const input = z.object({ attemptId: z.uuid(), executionId: z.uuid() }).strict().parse(data);
      const m = await getMission(id, owner),
        a = m.attempts.find((a) => a.id === input.attemptId && a.status === 'uncertain');
      if (!a || m.mode !== 'real') throw new Error('Uncertain real attempt required');
      const execution = await new BolnaAdapter().execution(input.executionId);
      const contact = m.contacts.find(
        (c) => c.id === m.tasks.find((t) => t.id === a.taskId)?.contactId,
      );
      const tel = execution.telephony_data as Record<string, unknown> | undefined;
      if (
        execution.agent_id !== process.env.BOLNA_PHONE_AGENT_ID ||
        tel?.to_number !== contact?.phone
      )
        throw new Error(
          'Execution agent or recipient does not match this attempt. Reconcile manually with provider support.',
        );
      await mutate(id, owner, (m) => {
        if (m.attempts.some((x) => x.executionId === input.executionId))
          throw new Error('Execution already associated');
        const a = m.attempts.find((x) => x.id === input.attemptId)!;
        a.executionId = input.executionId;
        applyExecution(m, a.id, execution);
      });
      return json(publicMission(await getMission(id, owner)));
    }
    await mutate(id, owner, (m) => {
      switch (action) {
        case 'approve': {
          const input = z
            .object({
              approvalId: z.uuid(),
              revision: z.number().int(),
              approved: z.boolean(),
              callBudgetMinor: z.number().int().min(0).optional(),
            })
            .strict()
            .parse(data);
          decide(m, input.approvalId, input.revision, input.approved, input.callBudgetMinor);
          break;
        }
        case 'revise': {
          const input = z
            .object({
              revision: z.number().int().positive(),
              constraints: constraintsSchema,
              reason: z.string().min(1).max(1000),
            })
            .strict()
            .parse(data);
          if (input.revision !== m.revision)
            throw new Error(
              'The mission changed. Close this form and review the latest revision before editing again.',
            );
          revise(m, input.constraints, input.reason);
          break;
        }
        case 'request-research':
          if (m.status === 'paused') throw new Error('Resume before requesting approval');
          requestApproval(m, 'research', true);
          break;
        case 'pause':
          m.status = 'paused';
          event(
            m,
            'mission.paused',
            'New dispatches and plan approvals paused. Active provider calls may finish.',
          );
          break;
        case 'resume':
          m.status = 'running';
          event(m, 'mission.resumed', 'Coordination resumed.');
          evaluate(m);
          break;
        case 'decline':
          declineOffer(m, z.uuid().parse(data.offerId));
          break;
        case 'clarify': {
          const input = z
            .object({ conflictId: z.string(), answer: z.string().min(1).max(2000) })
            .strict()
            .parse(data);
          const c = m.conflicts.find(
            (c) => c.id === input.conflictId && c.kind === 'clarification',
          );
          if (!c) throw new Error('Clarification not found');
          event(m, 'clarification.answered', input.answer);
          m.conflicts = m.conflicts.filter((x) => x.id !== c.id);
          for (const t of m.tasks)
            if (t.id === c.taskId) t.question = `User clarification: ${input.answer}`;
          evaluate(m);
          break;
        }
        case 'retry': {
          retryTask(m, z.uuid().parse(data.taskId));
          break;
        }
        case 'contact': {
          const input = z
            .object({
              contactId: z.uuid(),
              name: z.string().min(1).max(120),
              phone: z.string().max(30),
              authorized: z.boolean(),
            })
            .strict()
            .parse(data);
          if (!['draft', 'paused'].includes(m.status))
            throw new Error('Pause before editing contacts');
          if (input.authorized && !config.allowlist.includes(input.phone))
            throw new Error('Participant is absent from server CALL_ALLOWLIST');
          const c = m.contacts.find((c) => c.id === input.contactId);
          if (!c) throw new Error('Contact not found');
          Object.assign(c, input);
          event(
            m,
            'contact.updated',
            'Contact details updated. Research authorization is required again.',
          );
          for (const a of m.approvals.filter(
            (a) => a.kind === 'research' && a.status === 'approved',
          ))
            a.status = 'stale';
          requestApproval(m, 'research');
          break;
        }
        case 'responses': {
          if (m.mode !== 'simulation' || !['draft', 'paused'].includes(m.status))
            throw new Error('Pause the simulation before changing business responses');
          const input = z
            .object({ kind: kindSchema, offers: z.array(termsSchema).max(20) })
            .strict()
            .parse(data);
          m.responses[input.kind] = input.offers;
          event(
            m,
            'simulation.configured',
            `${input.kind} responses updated; an empty list means the business declines.`,
          );
          break;
        }
        default:
          throw new Error('Unknown mission action');
      }
    });
    return json(publicMission(await getMission(id, owner)));
  } catch (e) {
    const { status, ...failure } = requestError(e);
    return json(failure, status);
  }
}
export { handle as GET, handle as POST };
