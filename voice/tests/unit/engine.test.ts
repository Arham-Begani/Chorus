import { beforeEach, describe, expect, it } from 'vitest';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import {
  assertScope,
  brief,
  refreshBrief,
  decide,
  declineOffer,
  evaluate,
  latest,
  mergeStatus,
  report,
  requestApproval,
  reserve,
  revise,
  submit,
} from '../../src/core/engine';
import { executeTool } from '../../src/server/tools';
import { SimulationAdapter } from '../../src/providers/simulation';
import { recoverDispatches } from '../../src/server/coordinator';
import { assertCanDial } from '../../src/providers/bolna';
import type { Mission, Scope } from '../../src/core/types';
let m: Mission;
const scope = (index: number): Scope => {
  const t = m.tasks[index];
  const a = reserve(m, t);
  refreshBrief(m, t, a);
  return {
    role: 'phone',
    missionId: m.id,
    ownerId: m.ownerId,
    taskId: t.id,
    attemptId: a.id,
    expires: Date.now() + 60000,
  };
};
const finish = () => {
  for (let i = 0; i < m.tasks.length; i++) {
    const s = scope(i);
    submit(m, s, 'offer', m.revision, m.responses[m.tasks[i].kind].at(-1));
    m.attempts.find((a) => a.id === s.attemptId)!.status = 'completed';
    m.tasks[i].state = 'complete';
  }
  m.status = 'running';
  evaluate(m);
};
beforeEach(() => {
  m = createMission('alice', 'relocation', 'simulation', defaultConstraints());
});
describe('coordination and evidence', () => {
  it('a catering fact changes the venue brief', () => {
    const venue = m.tasks[0];
    expect(brief(m, venue).latestAccessAt).toBeUndefined();
    const s = scope(1);
    submit(m, s, 'setup', 1, m.responses.caterer[0]);
    expect(brief(m, venue).latestAccessAt).toBe(
      new Date(Date.parse(m.constraints.eventStart) - 45 * 60000).toISOString(),
    );
    expect(brief(m, venue).sharedEvidence.some((x) => x.terms?.setupMinutes === 45)).toBe(true);
  });
  it('detects access plus setup exceeding deadline', () => {
    submit(m, scope(0), 'v', 1, m.responses.venue[0]);
    submit(m, scope(1), 'c', 1, m.responses.caterer[0]);
    expect(m.conflicts.find((c) => c.kind === 'timing')?.message).toContain('15 minutes');
  });
  it('rejects undersized venues', () => {
    submit(m, scope(0), 'v', 1, { ...m.responses.venue[0], capacity: 20 });
    expect(m.conflicts.some((c) => c.kind === 'capacity')).toBe(true);
  });
  it('requires explicit timing, capacity and setup facts', () => {
    submit(m, scope(0), 'v', 1, {
      priceMinor: 100,
      currency: 'INR',
      description: 'unknown terms',
      confirmation: 'reported',
    });
    expect(m.conflicts.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['capacity', 'missing', 'confirmation']),
    );
  });
  it('sums prices in minor units and detects over-budget plans', () => {
    finish();
    revise(m, { ...m.constraints, budgetMinor: 100 }, 'Lower budget');
    for (let i = 0; i < m.tasks.length; i++)
      submit(m, scope(i), 'new', 2, m.responses[m.tasks[i].kind][0]);
    expect(m.plan.totalMinor).toBe(1100000);
    expect(m.conflicts.some((c) => c.kind === 'budget')).toBe(true);
  });
  it('lower budget marks proposals and approvals stale', () => {
    finish();
    const a = requestApproval(m, 'plan');
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Budget cut');
    expect(m.offers.every((o) => o.stale)).toBe(true);
    expect(a.status).toBe('stale');
    expect(m.revisions).toHaveLength(2);
    expect(m.plan.feasible).toBe(false);
  });
  it('outdated revision cannot authorize a plan', () => {
    finish();
    const a = requestApproval(m, 'plan');
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Budget cut');
    expect(() => decide(m, a.id, 1, true)).toThrow(/stale/);
  });
  it('current evidence changes invalidate a prior plan decision', () => {
    finish();
    const a = requestApproval(m, 'plan');
    decide(m, a.id, 1, true);
    submit(m, scope(0), 'changed', 1, { ...m.responses.venue[2], priceMinor: 2000000 });
    expect(a.status).toBe('stale');
    expect(m.status).not.toBe('approved');
  });
  it('rejects stale agent proposals until brief refresh', () => {
    const s = scope(0);
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Budget cut');
    expect(() => submit(m, s, 'stale', 1, m.responses.venue[0])).toThrow(/Stale revision/);
  });
  it('guessing the current revision cannot bypass the required brief refresh', () => {
    const s = scope(0);
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Budget cut');
    expect(() => submit(m, s, 'guess', 2, m.responses.venue[0])).toThrow(/Brief changed/);
    refreshBrief(m, m.tasks[0], m.attempts[0]);
    expect(() => submit(m, s, 'current', 2, m.responses.venue[0])).not.toThrow();
  });
  it('shared evidence arriving after a brief read requires another refresh', () => {
    const venue = scope(0);
    submit(m, scope(1), 'setup', 1, m.responses.caterer[0]);
    expect(() => submit(m, venue, 'stale-evidence', 1, m.responses.venue[0])).toThrow(
      /Brief changed/,
    );
  });
  it('deduplicates tool facts and offers', () => {
    const s = scope(0);
    report(m, s, 'fact', 'Availability reported');
    report(m, s, 'fact', 'Availability reported');
    submit(m, s, 'offer', 1, m.responses.venue[0]);
    submit(m, s, 'offer', 1, m.responses.venue[0]);
    expect(m.observations).toHaveLength(1);
    expect(m.offers).toHaveLength(1);
  });
  it('every fact and offer has provenance and explicit mode', () => {
    const s = scope(0);
    report(m, s, 'fact', 'Fact');
    submit(m, s, 'offer', 1, m.responses.venue[0]);
    expect(m.observations[0]).toMatchObject({
      attemptId: s.attemptId,
      mode: 'simulation',
      revision: 1,
    });
    expect(m.offers[0]).toMatchObject({
      attemptId: s.attemptId,
      mode: 'simulation',
      currency: 'INR',
    });
  });
  it('declining an offer schedules alternative research', () => {
    finish();
    const o = latest(m, m.tasks[0].id)!;
    declineOffer(m, o.id);
    expect(o.declined).toBe(true);
    expect(m.tasks[0].state).toBe('pending');
    expect(m.plan.feasible).toBe(false);
  });
  it('declined plan stays declined through reevaluation', () => {
    finish();
    const a = requestApproval(m, 'plan');
    decide(m, a.id, 1, false);
    evaluate(m);
    expect(m.status).toBe('blocked');
    expect(m.approvals.filter((a) => a.kind === 'plan' && a.status === 'requested')).toHaveLength(
      0,
    );
  });
  it('pause blocks approvals', () => {
    const a = requestApproval(m, 'research');
    m.status = 'paused';
    expect(() => decide(m, a.id, 1, true)).toThrow(/Resume/);
  });
});
describe('scope and reliability', () => {
  it('caller cannot expand phone-agent permissions', () => {
    const s = scope(0);
    expect(() =>
      executeTool(m, s, 'update_mission_constraints', {
        token: 'test',
        key: 'evil',
        constraints: { ...m.constraints, budgetMinor: 9999999 },
      }),
    ).toThrow(/cannot change/);
    expect(m.constraints.budgetMinor).toBe(1200000);
  });
  it('rejects cross-mission scopes', () => {
    const s = scope(0);
    expect(() => assertScope(m, { ...s, missionId: 'other' })).toThrow(/scope/);
  });
  it('rejects cross-task attempt impersonation', () => {
    const s = scope(0);
    expect(() => assertScope(m, { ...s, taskId: m.tasks[1].id })).toThrow(/capability/);
  });
  it('expired or ended phone capabilities cannot mutate', () => {
    const s = scope(0);
    expect(() => assertScope(m, { ...s, expires: 0 })).toThrow();
    m.attempts[0].status = 'completed';
    expect(() => report(m, s, 'x', 'fact')).toThrow(/active/);
  });
  it('completed status cannot regress on an old callback', () => {
    expect(mergeStatus('completed', 'ringing')).toBe('completed');
    expect(mergeStatus('in-progress', 'queued')).toBe('in-progress');
  });
  it('worker restart marks a stranded real dispatch uncertain', () => {
    m.mode = 'real';
    const a = reserve(m, m.tasks[0]);
    a.createdAt = new Date(Date.now() - 60000).toISOString();
    recoverDispatches(m);
    expect(a.status).toBe('uncertain');
    expect(m.tasks[0].state).toBe('active');
    recoverDispatches(m);
    expect(m.attempts).toHaveLength(1);
  });
  it('cannot dial an unauthorized contact even when live credentials exist', () => {
    const env = { ...process.env };
    try {
      Object.assign(process.env, {
        SIMULATION_ONLY: 'false',
        AUTH_MODE: 'supabase',
        ENABLE_REAL_CALLS: 'true',
        LIVE_AGENT_LIMITS_VERIFIED: 'true',
        BOLNA_API_KEY: 'test',
        BOLNA_CONDUCTOR_AGENT_ID: 'test',
        BOLNA_PHONE_AGENT_ID: 'test',
        BOLNA_WEBHOOK_SECRET: 'test',
        BOLNA_TOOL_SECRET: 'test',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'test',
        CALLING_WINDOW_START: '00:00',
        CALLING_WINDOW_END: '23:59',
        CALL_ALLOWLIST: '+919999999999',
      });
      m.mode = 'real';
      expect(() => assertCanDial(m, m.tasks[0].id)).toThrow(/authorized/);
    } finally {
      process.env = env;
    }
  });
  it('simulation adapter cannot operate a real mission', () => {
    const a = reserve(m, m.tasks[0]);
    m.mode = 'real';
    expect(() => new SimulationAdapter().step(m, a)).toThrow(/Mode/);
  });
  it('empty business responses produce a clear blocked task', () => {
    const a = reserve(m, m.tasks[0]);
    m.responses.venue = [];
    const sim = new SimulationAdapter();
    for (let n = 0; n < 4; n++) {
      a.dueAt = new Date(0).toISOString();
      sim.step(m, a);
    }
    expect(a.status).toBe('completed');
    expect(m.tasks[0].state).toBe('blocked');
    expect(latest(m, m.tasks[0].id)).toBeUndefined();
  });
  it('an active simulation refreshes if the user revises after terms but before hangup', () => {
    const a = reserve(m, m.tasks[0]);
    const sim = new SimulationAdapter();
    for (let i = 0; i < 3; i++) {
      a.dueAt = new Date(0).toISOString();
      sim.step(m, a);
    }
    expect(a.phase).toBe(3);
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Budget revision before hangup');
    a.dueAt = new Date(0).toISOString();
    sim.step(m, a);
    expect(a.status).toBe('in-progress');
    expect(a.phase).toBe(1);
    for (let i = 0; i < 3; i++) {
      a.dueAt = new Date(0).toISOString();
      sim.step(m, a);
    }
    expect(latest(m, m.tasks[0].id)?.revision).toBe(2);
    expect(a.status).toBe('completed');
  });
  it('second mission applies reusable delivery and setup constraints', () => {
    m = createMission('alice', 'equipment', 'simulation', defaultConstraints());
    finish();
    expect(m.plan.feasible).toBe(true);
    const s = scope(1);
    submit(m, s, 'late', 1, { ...m.responses.delivery[0], readyAt: m.constraints.eventStart });
    expect(m.conflicts.some((c) => c.kind === 'timing')).toBe(true);
  });
});
