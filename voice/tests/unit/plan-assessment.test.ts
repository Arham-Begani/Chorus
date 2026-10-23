import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { assessPlan } from '../../src/core/plan-assessment';
import { brief, evidenceKey, evaluate, latest } from '../../src/core/engine';
import { currentOffer, exportBrief } from '../../src/core/presentation';
import PlanChecks from '../../src/components/plan-checks';
import type { Mission, Offer } from '../../src/core/types';

function filled(scenario: Mission['scenario'] = 'relocation') {
  const m = createMission('assessment-unit', scenario, 'simulation', {
    ...defaultConstraints(),
    eventStart: '2026-10-24T18:00:00+05:30',
  });
  m.status = 'running';
  m.offers = m.tasks.map((task) => ({
    ...m.responses[task.kind][0],
    id: `offer-${task.kind}`,
    taskId: task.id,
    attemptId: `attempt-${task.kind}`,
    mode: m.mode,
    revision: m.revision,
    stale: false,
    declined: false,
    createdAt: '2026-10-23T10:00:00Z',
  }));
  return m;
}

it('shows the actual 15-minute setup conflict and source attempts without mutating the mission', () => {
  const m = filled(),
    before = JSON.stringify(m);
  const result = assessPlan(m);
  expect(result.feasible).toBe(false);
  expect(result.conflicts).toContainEqual(
    expect.objectContaining({ kind: 'timing', message: expect.stringContaining('15 minutes') }),
  );
  expect(result.checks[0]).toMatchObject({
    status: 'fail',
    attemptIds: ['attempt-venue', 'attempt-caterer', 'attempt-transport'],
  });
  expect(result.checks[0].details.join(' ')).toContain('45 min setup');
  expect(result.checks[0].details.join(' ')).toContain('15 min after');
  expect(JSON.stringify(m)).toBe(before);
});

it('recomputes the explanation when earlier access makes setup fit', () => {
  const m = filled();
  m.offers[0].readyAt = '2026-10-24T17:00:00+05:30';
  const result = assessPlan(m);
  expect(result.feasible).toBe(true);
  expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  expect(result.checks[0].details.join(' ')).toContain('15 min before');
  evaluate(m);
  expect(m.plan).toEqual({
    offerIds: result.offerIds,
    totalMinor: result.totalMinor,
    feasible: true,
  });
});

it('installation starts only after both equipment and delivery are ready, including an exact deadline', () => {
  const m = filled('equipment');
  m.offers[0].readyAt = '2026-10-24T17:00:00+05:30';
  m.offers[1].readyAt = '2026-10-24T16:30:00+05:30';
  m.offers[1].setupMinutes = 60;
  expect(assessPlan(m).checks[0].details.join(' ')).toContain('Ready exactly at the start');
  expect(assessPlan(m).feasible).toBe(true);
  m.offers[0].readyAt = '2026-10-24T17:30:00+05:30';
  expect(assessPlan(m).feasible).toBe(false);
  expect(assessPlan(m).checks[0].details.join(' ')).toContain('30 min after');
});

it.each([{ revision: 0 }, { mode: 'real' as const }, { stale: true }, { declined: true }])(
  'rejects ineligible quotes in the engine, brief and display: %j',
  (invalid) => {
    const m = filled();
    const valid = m.offers[0];
    const bad: Offer = {
      ...valid,
      ...invalid,
      id: 'ineligible',
      attemptId: 'ineligible-source',
      priceMinor: 9900000,
    };
    m.offers.push(bad);
    expect(currentOffer(m, valid.taskId)?.id).toBe(valid.id);
    expect(latest(m, valid.taskId)?.id).toBe(valid.id);
    expect(brief(m, m.tasks[0]).latestTerms?.id).toBe(valid.id);
    expect(evidenceKey(m)).not.toContain('ineligible');
    expect(assessPlan(m).totalMinor).toBe(1100000);
    m.offers = m.offers.filter((o) => o.id !== valid.id);
    evaluate(m);
    expect(m.plan.offerIds).not.toContain('ineligible');
    expect(m.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'missing', taskId: valid.taskId }),
    );
    expect(exportBrief(m)).not.toContain('ineligible-source');
  },
);

it('does not present a partial total as a passed budget check', () => {
  const m = filled('equipment');
  m.offers.splice(0, 1);
  const result = assessPlan(m);
  expect(result.feasible).toBe(false);
  expect(result.checks.find((c) => c.id === 'budget')).toMatchObject({ status: 'pending' });
  expect(result.checks.find((c) => c.id === 'budget')!.details.join(' ')).toContain(
    'total is incomplete',
  );
  expect(result.checks[0].status).toBe('pending');
  m.constraints.budgetMinor = 1;
  expect(assessPlan(m).checks.find((c) => c.id === 'budget')!.status).toBe('fail');
});

it('keeps missing capacity and reported confirmations blocking approval', () => {
  const m = filled('equipment');
  delete m.offers[0].capacity;
  m.offers[1].confirmation = 'reported';
  const result = assessPlan(m);
  expect(result.feasible).toBe(false);
  expect(result.checks.find((c) => c.id === 'capacity')!.status).toBe('pending');
  expect(result.checks.find((c) => c.id === 'confirmation')!.status).toBe('pending');
  evaluate(m);
  expect(m.approvals.some((a) => a.kind === 'plan' && a.status === 'requested')).toBe(false);
});

it('preserves a free, zero-installation plan and the same calculation in exports', () => {
  const m = filled('equipment');
  m.constraints.budgetMinor = 0;
  for (const o of m.offers) {
    o.priceMinor = 0;
    o.readyAt = m.constraints.eventStart;
  }
  m.offers[1].setupMinutes = 0;
  evaluate(m);
  expect(m.plan.feasible).toBe(true);
  const html = renderToStaticMarkup(
    createElement(PlanChecks, { mission: m, onEvidence: () => {} }),
  );
  expect(html).toContain('4 of 4 checks pass');
  expect(html).toContain('0 min installation');
  expect(html).toContain('₹0 remaining');
  expect(exportBrief(m)).toContain('Ready exactly at the start');
  expect(exportBrief(m)).toContain('attempt-equipment, attempt-delivery');
});

it('blocks an invalid legacy access timestamp instead of letting NaN appear feasible', () => {
  const m = filled();
  m.offers[0].readyAt = 'not-a-date';
  const result = assessPlan(m);
  expect(result.feasible).toBe(false);
  expect(result.checks[0].status).toBe('pending');
  expect(result.conflicts).toContainEqual(
    expect.objectContaining({ kind: 'missing', taskId: m.tasks[0].id }),
  );
});

it('retains owner clarification as a blocker even when all vendor terms fit', () => {
  const m = filled('equipment');
  m.conflicts = [
    { id: 'clarification:owner', kind: 'clarification', message: 'Confirm the loading entrance.' },
  ];
  const result = assessPlan(m);
  expect(result.feasible).toBe(false);
  expect(result.checks.at(-1)).toMatchObject({
    id: 'clarification',
    status: 'fail',
    details: ['Confirm the loading entrance.'],
  });
});
