import { type Attempt, type Mission, activeStatuses } from './types';
import { currentOffer } from './offers';
import { assessPlan } from './plan-assessment';
export { currentOffer } from './offers';
export function callOutcome(a: Attempt) {
  return (
    (
      {
        busy: 'Line busy',
        'no-answer': 'No answer',
        'balance-low': 'Credits needed',
        canceled: 'Canceled',
        cancelled: 'Canceled',
        stopped: 'Stopped',
      } as Record<string, string>
    )[a.providerStatus || ''] || a.status
  );
}
export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
export function missionGuidance(m: Mission) {
  const pending = m.approvals.find((a) => a.status === 'requested' && a.revision === m.revision);
  if (m.status === 'paused')
    return {
      title: 'Ready when you are.',
      detail: 'Research is paused. Your brief, evidence and decisions are saved.',
      action: 'Resume mission',
      kind: 'resume' as const,
    };
  if (pending)
    return {
      title:
        pending.kind === 'research'
          ? 'Your brief is ready. Review the research.'
          : 'The details agree. Your decision is next.',
      detail:
        pending.kind === 'research'
          ? 'Check the contacts and constraints, then authorize the conversations.'
          : 'Quotes, capacity and timing pass the current checks. Review the sources before approving.',
      action: pending.kind === 'research' ? 'Review research' : 'Review proposed plan',
      kind: 'decisions' as const,
    };
  if (m.status === 'approved')
    return {
      title: 'A plan you can move forward with.',
      detail:
        'Your preferred plan is recorded. Export the brief to take the details with you; nothing has been booked.',
      action: 'Export brief',
      kind: 'export' as const,
    };
  if (m.attempts.some((a) => a.status === 'uncertain'))
    return {
      title: 'One conversation needs reconciliation.',
      detail:
        'The provider may have accepted a call. Match its execution before retrying to avoid a duplicate.',
      action: 'Review conversations',
      kind: 'conversations' as const,
    };
  if (m.status === 'blocked')
    return {
      title: 'A few details still need a way through.',
      detail:
        'Inspect the missing terms or conflicts. Adjust your constraints or prepare another research attempt.',
      action: 'Review conversations',
      kind: 'conversations' as const,
    };
  const active = m.attempts.filter((a) => activeStatuses.includes(a.status)).length;
  return {
    title: active
      ? `${active} conversation${active === 1 ? ' is' : 's are'} moving the plan forward.`
      : 'Research is preparing the next step.',
    detail:
      'Shared evidence updates the brief as it arrives. You can revise your goal or pause at any time.',
    action: 'Open conductor',
    kind: 'conductor' as const,
  };
}
export function exportBrief(m: Mission) {
  const money = (v: number) => `INR ${(v / 100).toLocaleString('en-IN')}`;
  const current = m.tasks.map((t) => ({
    t,
    o: currentOffer(m, t.id),
  }));
  return [
    `# ${m.title}`,
    '',
    m.goal,
    '',
    `Mode: ${m.mode} · Revision: ${m.revision} · Status: ${m.status}`,
    `Mission: ${m.id}`,
    `Exported: ${new Date().toISOString()}`,
    '',
    '## Current brief',
    `- Budget: ${money(m.constraints.budgetMinor)}`,
    `- People / capacity: ${m.constraints.quantity}`,
    `- Deadline: ${m.constraints.eventStart} (${m.constraints.timezone})`,
    `- Current quotes: ${money(m.plan.totalMinor)}`,
    `- Checks: ${m.plan.feasible ? 'pass' : 'incomplete or blocked'}`,
    '',
    '## Terms and sources',
    ...current.flatMap(({ t, o }) => [
      `### ${m.contacts.find((c) => c.id === t.contactId)?.name || t.title} (${t.kind})`,
      o
        ? `${money(o.priceMinor)} · ${o.confirmation} · ${o.mode} · revision ${o.revision}\n\n${o.description}\n\nReady / access: ${o.readyAt || 'not supplied'}\nSetup: ${o.setupMinutes === undefined ? 'not supplied' : o.setupMinutes + ' minutes'}\nSource attempt: ${o.attemptId}`
        : 'Current terms not received.',
      '',
    ]),
    '## Open checks',
    ...(m.conflicts.length ? m.conflicts.map((c) => '- ' + c.message) : ['No current conflicts.']),
    '',
    '## Plan checks and reasoning',
    ...assessPlan(m).checks.flatMap((check) => [
      `### ${check.label}: ${check.status}`,
      ...check.details,
      ...(check.attemptIds.length ? [`Source attempts: ${check.attemptIds.join(', ')}`] : []),
      '',
    ]),
    'This is a research proposal. Approval records a preference; no purchase, reservation or cancellation has been made.',
  ].join('\n');
}
