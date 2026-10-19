import { expect, it } from 'vitest';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { conductorIntent, goalConstraints } from '../../src/core/conductor';
import {
  decide,
  requestApproval,
  researchApproved,
  retryTask,
  evaluate,
  reserve,
} from '../../src/core/engine';
import {
  callOutcome,
  exportBrief,
  missionGuidance,
  formatMoney,
} from '../../src/core/presentation';
import { applyExecution } from '../../src/server/coordinator';
import { requestError } from '../../src/server/request-error';
const base = { ...defaultConstraints(), eventStart: '2030-05-02T18:00:00+05:30' },
  now = new Date('2030-05-01T10:00:00Z');
it('distinguishes participant busy/no-answer outcomes from software failures', () => {
  const m = createMission('owner', 'equipment', 'real', base);
  const a = reserve(m, m.tasks[0]);
  a.status = 'failed';
  a.providerStatus = 'busy';
  expect(callOutcome(a)).toBe('Line busy');
  a.providerStatus = 'no-answer';
  expect(callOutcome(a)).toBe('No answer');
  a.providerStatus = 'balance-low';
  expect(callOutcome(a)).toBe('Credits needed');
});
it('late conflicting terminal callbacks cannot zero out a completed paid execution', () => {
  const m = createMission('owner', 'equipment', 'real', base);
  const a = reserve(m, m.tasks[0]);
  a.status = 'completed';
  a.executionId = '123e4567-e89b-42d3-a456-426614174000';
  a.providerCostCents = 10;
  a.providerDurationSeconds = 60;
  applyExecution(m, a.id, {
    id: a.executionId,
    status: 'busy',
    total_cost: 0,
    conversation_duration: 0,
    billing_settled: true,
  });
  expect(a.providerCostCents).toBe(10);
  expect(a.providerDurationSeconds).toBe(60);
  expect(a.providerBillingSettled).toBeUndefined();
});
it('quote display preserves paise without adding noise to whole-rupee quotes', () => {
  expect(formatMoney(185501)).toBe('₹1,855.01');
  expect(formatMoney(900000)).toBe('₹9,000');
  expect(formatMoney(0)).toBe('₹0');
});
it('understands polite edits and spoken clock minutes without interpreting questions as commands', () => {
  const m = createMission('owner', 'relocation', 'simulation', base);
  expect(
    conductorIntent('Could you please lower the budget to nine thousand rupees?', m, base, now),
  ).toMatchObject({ kind: 'revise', constraints: { budgetMinor: 900000 } });
  expect(
    conductorIntent('Can we lower the budget to nine thousand rupees?', m, base, now).kind,
  ).toBe('status');
  expect(goalConstraints('Tomorrow six thirty pm', base, now).constraints.eventStart).toBe(
    '2030-05-02T13:00:00.000Z',
  );
  expect(conductorIntent('Don’t change the budget to 9000', m, base, now).kind).toBe('help');
});
it('does not silently replace an ambiguous spoken deadline with the default', () => {
  for (const text of ['Tomorrow at 6', 'Move the deadline to 7', 'Today by 6', 'Under ₹-100'])
    expect(() => goalConstraints(text, base, now)).toThrow();
  expect(goalConstraints('Move to 7 pm tomorrow', base, now).constraints.eventStart).toBe(
    '2030-05-02T13:30:00.000Z',
  );
});
it('a retry invalidates current terms and plan approval, and requires fresh research authorization', () => {
  const m = createMission('owner', 'equipment', 'simulation', base);
  decide(m, requestApproval(m, 'research').id, 1, true);
  for (const t of m.tasks) {
    const a = reserve(m, t);
    a.status = 'completed';
    t.state = 'complete';
    m.offers.push({
      ...m.responses[t.kind][0],
      id: 'offer-' + t.id,
      taskId: t.id,
      attemptId: a.id,
      mode: 'simulation',
      revision: 1,
      stale: false,
      declined: false,
      createdAt: new Date().toISOString(),
    });
  }
  evaluate(m);
  decide(m, requestApproval(m, 'plan').id, 1, true);
  retryTask(m, m.tasks[0].id);
  expect(m.plan.feasible).toBe(false);
  expect(researchApproved(m)).toBe(false);
  expect(m.approvals.some((a) => a.kind === 'plan' && a.status === 'approved')).toBe(false);
  expect(m.approvals.filter((a) => a.kind === 'research' && a.status === 'requested')).toHaveLength(
    1,
  );
  expect(m.offers.find((o) => o.taskId === m.tasks[0].id)?.stale).toBe(true);
});
it('a retry cannot bypass an uncertain or paused attempt', () => {
  const m = createMission('owner', 'relocation', 'simulation', base),
    t = m.tasks[0],
    a = reserve(m, t);
  a.status = 'uncertain';
  expect(() => retryTask(m, t.id)).toThrow(/active\/uncertain/);
  a.status = 'failed';
  m.status = 'paused';
  expect(() => retryTask(m, t.id)).toThrow(/resume/);
});
it('guidance prioritizes a pause and explicit approval over an optimistic plan summary', () => {
  const m = createMission('owner', 'relocation', 'simulation', base);
  requestApproval(m, 'research');
  expect(missionGuidance(m).kind).toBe('decisions');
  m.status = 'paused';
  expect(missionGuidance(m).kind).toBe('resume');
});
it('an exported brief keeps missing evidence, simulation and commitment boundaries explicit', () => {
  const m = createMission('owner', 'relocation', 'simulation', base),
    output = exportBrief(m);
  expect(output).toContain('Mode: simulation');
  expect(output).toContain('Current terms not received');
  expect(output).toContain('incomplete or blocked');
  expect(output).toContain('no purchase, reservation or cancellation');
  expect(output).not.toContain('owner');
});
it('service failures are recoverable and never expose connection details', () => {
  const failure = requestError(
    Object.assign(new Error('connect to private-host with private-password'), {
      code: 'ECONNREFUSED',
    }),
  );
  expect(failure.status).toBe(503);
  expect(JSON.stringify(failure)).not.toContain('private-');
  expect(
    requestError(Object.assign(new Error('sensitive SQL statement'), { code: '42P01' })).status,
  ).toBe(503);
});
it('stale commands have a distinct conflict response while expired sessions still require sign-in', () => {
  expect(requestError(new Error('The mission changed. Review the latest revision.'))).toMatchObject(
    { status: 409, code: 'REVISION_CONFLICT' },
  );
  expect(requestError(new Error('Sign in required')).status).toBe(401);
});
it('live-session budget and expiry failures do not sign the operator out', () => {
  for (const message of [
    'A browser voice session is already reserved. Wait before reconnecting.',
    'Live-test authorization is expired. No paid session can start.',
    'Verify conductor duration, disabled retries and cost reserve before connecting paid voice.',
  ])
    expect(requestError(new Error(message)).status).toBe(400);
  expect(requestError(new Error('Session expired')).status).toBe(401);
});
