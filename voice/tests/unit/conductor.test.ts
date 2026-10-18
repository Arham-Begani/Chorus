import { expect, it } from 'vitest';
import { conductorIntent, goalConstraints, normalizeSpeech } from '../../src/core/conductor';
import { createMission } from '../../src/core/fixtures';
import { requestApproval, decide, researchApproved } from '../../src/core/engine';
const now = new Date('2030-05-01T10:00:00Z');
const base = {
  budgetMinor: 1200000,
  currency: 'INR' as const,
  quantity: 40,
  eventStart: '2030-05-02T18:00:00+05:30',
  timezone: 'Asia/Kolkata',
};
it('a new research approval supersedes earlier permission before replacement work can start', () => {
  const m = createMission('owner', 'relocation', 'simulation', base);
  decide(m, requestApproval(m, 'research').id, 1, true);
  expect(researchApproved(m)).toBe(true);
  const next = requestApproval(m, 'research', true);
  expect(researchApproved(m)).toBe(false);
  expect(m.approvals.filter((a) => a.status === 'requested')).toHaveLength(1);
  expect(() => decide(m, m.approvals[0].id, 1, true)).toThrow(/stale/);
  decide(m, next.id, 1, true);
  expect(researchApproved(m)).toBe(true);
});
it('extracts the flagship spoken goal, including number words and a local deadline', () => {
  const intent = conductorIntent(
    'Our venue cancelled. Find an alternative for forty people tomorrow at six p.m. under twelve thousand rupees.',
    null,
    base,
    now,
  );
  expect(intent).toMatchObject({
    kind: 'create',
    scenario: 'relocation',
    constraints: { budgetMinor: 1200000, quantity: 40, eventStart: '2030-05-02T12:30:00.000Z' },
  });
  expect(normalizeSpeech('one lakh twenty thousand')).toBe('120000');
});
it('supports equipment goals and preserves unspecified constraints on revisions', () => {
  expect(
    conductorIntent(
      'Rent sound equipment and arrange delivery for 80 people under 8k rupees',
      null,
      base,
      now,
    ),
  ).toMatchObject({
    kind: 'create',
    scenario: 'equipment',
    constraints: { budgetMinor: 800000, quantity: 80 },
  });
  const m = createMission('owner', 'relocation', 'simulation', base);
  expect(conductorIntent('Lower the budget to nine thousand rupees', m, base, now)).toMatchObject({
    kind: 'revise',
    constraints: { ...base, budgetMinor: 900000 },
    changed: ['budget'],
  });
  expect(goalConstraints('Move the deadline to 5 pm', base, now).constraints.eventStart).toBe(
    '2030-05-02T11:30:00.000Z',
  );
});
it('never treats questions, negation or approval requests as constraint-changing authority', () => {
  const m = createMission('owner', 'relocation', 'simulation', base);
  expect(conductorIntent('Can we fit 80 people under 9000 rupees?', m, base, now).kind).toBe(
    'status',
  );
  expect(conductorIntent('Do not lower the budget to 9000', m, base, now).kind).toBe('help');
  expect(conductorIntent('Approve the plan and book it', m, base, now).kind).toBe('approval');
  expect(conductorIntent('What venue can we use?', null, base, now).kind).toBe('help');
});
it('rejects invalid counts, currencies, dates and ambiguous times rather than silently guessing', () => {
  for (const command of [
    'budget to -100',
    'for 40.5 people',
    'under $9000',
    'event starts at 6',
    'deadline 2030-02-30 at 6 pm',
  ])
    expect(() => goalConstraints(command, base, now)).toThrow();
  const newYork = { ...base, timezone: 'America/New_York' };
  expect(() => goalConstraints('Move the deadline to 2030-11-03 at 1:30 am', newYork, now)).toThrow(
    /ambiguous/,
  );
  expect(
    goalConstraints('Deadline 2030-05-02T20:00:00+05:30', base, now).constraints.eventStart,
  ).toBe('2030-05-02T14:30:00.000Z');
});
