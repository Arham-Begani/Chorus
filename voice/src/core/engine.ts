import { randomUUID } from 'node:crypto';
import {
  activeStatuses,
  constraintsSchema,
  termsSchema,
  type Approval,
  type Attempt,
  type Constraints,
  type Mission,
  type Offer,
  type Scope,
  type Task,
} from './types';
export function event(m: Mission, type: string, message: string, attemptId?: string) {
  m.updatedAt = new Date().toISOString();
  m.events.push({
    id: randomUUID(),
    type,
    message,
    at: m.updatedAt,
    mode: m.mode,
    revision: m.revision,
    attemptId,
  });
}
export function latest(m: Mission, taskId: string): Offer | undefined {
  return [...m.offers].reverse().find((o) => o.taskId === taskId && !o.declined && !o.stale);
}
export function evidenceKey(m: Mission) {
  return m.tasks.map((t) => latest(m, t.id)?.id || '-').join(':');
}
export function researchApproved(m: Mission) {
  return m.approvals.some(
    (a) => a.kind === 'research' && a.status === 'approved' && a.revision === m.revision,
  );
}
export function requestApproval(m: Mission, kind: Approval['kind'], force = false) {
  if (force)
    for (const a of m.approvals)
      if (
        a.kind === kind &&
        a.revision === m.revision &&
        ['requested', 'approved'].includes(a.status)
      )
        a.status = 'stale';
  const key = kind === 'plan' ? evidenceKey(m) : '';
  const existing =
    !force &&
    m.approvals.find(
      (a) =>
        a.kind === kind &&
        a.revision === m.revision &&
        a.evidenceKey === key &&
        ['requested', 'approved', 'declined'].includes(a.status),
    );
  if (existing) return existing;
  const a: Approval = {
    id: randomUUID(),
    kind,
    revision: m.revision,
    evidenceKey: key,
    status: 'requested',
    createdAt: new Date().toISOString(),
  };
  m.approvals.push(a);
  event(
    m,
    'approval.requested',
    kind === 'research'
      ? 'Review contacts and authorize research conversations.'
      : 'A feasible plan is ready for your review. No booking has been made.',
  );
  return a;
}
export function evaluate(m: Mission) {
  const conflicts: Mission['conflicts'] = [];
  const add = (kind: Mission['conflicts'][number]['kind'], message: string, taskId?: string) =>
    conflicts.push({ id: `${kind}:${taskId || 'all'}`, kind, message, taskId });
  const offers = m.tasks.map((t) => latest(m, t.id));
  const total = offers.reduce((s, o) => s + (o?.priceMinor || 0), 0);
  for (const [i, o] of offers.entries()) {
    const t = m.tasks[i];
    if (!o) {
      add('missing', `${t.title}: current terms needed.`, t.id);
      continue;
    }
    if (o.confirmation !== 'confirmed')
      add('confirmation', `${t.title}: terms are reported, awaiting confirmation.`, t.id);
    if (
      ['venue', 'transport', 'equipment'].includes(t.kind) &&
      (o.capacity === undefined || o.capacity < m.constraints.quantity)
    )
      add('capacity', `${t.title}: capacity must be at least ${m.constraints.quantity}.`, t.id);
  }
  if (total > m.constraints.budgetMinor)
    add(
      'budget',
      `Additional spending exceeds the budget by INR ${((total - m.constraints.budgetMinor) / 100).toLocaleString('en-IN')}.`,
    );
  const end = Date.parse(m.constraints.eventStart);
  const byKind = (kind: string) => offers.find((o, i) => o && m.tasks[i].kind === kind);
  const venue = byKind('venue'),
    caterer = byKind('caterer'),
    transport = byKind('transport'),
    equipment = byKind('equipment'),
    delivery = byKind('delivery');
  if (m.scenario === 'relocation') {
    if (venue && !venue.readyAt) add('missing', 'Venue access time is required.', venue.taskId);
    if (caterer && caterer.setupMinutes === undefined)
      add('missing', 'Caterer setup duration is required.', caterer.taskId);
    if (
      venue?.readyAt &&
      caterer?.setupMinutes !== undefined &&
      Date.parse(venue.readyAt) + caterer.setupMinutes * 60000 > end
    )
      add(
        'timing',
        `Venue access plus ${caterer.setupMinutes} minutes of catering setup misses the start by ${Math.ceil((Date.parse(venue.readyAt) + caterer.setupMinutes * 60000 - end) / 60000)} minutes. Ask for earlier access.`,
        venue.taskId,
      );
    if (transport && (!transport.readyAt || Date.parse(transport.readyAt) > end))
      add('timing', 'Transport must arrive before the event starts.', transport.taskId);
  } else {
    if (equipment && (!equipment.readyAt || Date.parse(equipment.readyAt) > end))
      add('timing', 'Equipment must be available before the event.', equipment.taskId);
    if (
      delivery &&
      (!delivery.readyAt ||
        delivery.setupMinutes === undefined ||
        Math.max(
          Date.parse(delivery.readyAt),
          equipment?.readyAt ? Date.parse(equipment.readyAt) : 0,
        ) +
          (delivery.setupMinutes || 0) * 60000 >
          end)
    )
      add(
        'timing',
        'Delivery, equipment availability and installation must fit before the event.',
        delivery.taskId,
      );
  }
  for (const c of m.conflicts.filter((c) => c.kind === 'clarification')) conflicts.push(c);
  const previous = m.conflicts.map((c) => c.id + ':' + c.message).join('|');
  m.conflicts = conflicts;
  m.plan = {
    offerIds: offers.filter((o): o is Offer => !!o).map((o) => o.id),
    totalMinor: total,
    feasible: conflicts.length === 0,
  };
  for (const a of m.approvals)
    if (
      a.kind === 'plan' &&
      ['requested', 'approved'].includes(a.status) &&
      (a.revision !== m.revision || a.evidenceKey !== evidenceKey(m) || !m.plan.feasible)
    )
      a.status = 'stale';
  if (previous !== conflicts.map((c) => c.id + ':' + c.message).join('|'))
    event(
      m,
      'plan.evaluated',
      conflicts.length
        ? conflicts
            .filter((c) => c.kind !== 'missing')
            .map((c) => c.message)
            .join(' ') || 'Waiting for current evidence.'
        : 'All deterministic checks pass. Review the proposal.',
    );
  if (m.status !== 'paused' && m.status !== 'draft') {
    if (m.plan.feasible) {
      const decision = requestApproval(m, 'plan');
      m.status =
        decision.status === 'declined'
          ? 'blocked'
          : decision.status === 'approved'
            ? 'approved'
            : 'ready';
    } else {
      m.status = m.tasks.some((t) => t.state === 'pending' || t.state === 'active')
        ? 'running'
        : 'blocked';
    }
  }
  return m.plan;
}
export function revise(m: Mission, constraints: Constraints, reason: string) {
  if (!reason.trim()) throw new Error('Revision reason required');
  m.constraints = constraintsSchema.parse(constraints);
  m.revision++;
  m.revisions.push({
    id: randomUUID(),
    number: m.revision,
    constraints: structuredClone(m.constraints),
    reason,
    createdAt: new Date().toISOString(),
  });
  for (const a of m.approvals)
    if (a.status === 'requested' || a.status === 'approved') a.status = 'stale';
  for (const o of m.offers) o.stale = true;
  for (const t of m.tasks) {
    delete t.dispatchBlocked;
    t.rounds = t.state === 'active' ? 1 : 0;
    if (t.state !== 'active') {
      t.state = 'pending';
      t.question = 'Reconfirm your terms against the revised budget, quantity and deadline.';
    }
  }
  if (!['paused', 'draft'].includes(m.status)) m.status = 'running';
  event(m, 'mission.revised', reason);
  evaluate(m);
  requestApproval(m, 'research');
}
export function decide(
  m: Mission,
  id: string,
  revision: number,
  approved: boolean,
  callBudgetMinor = 0,
) {
  if (m.status === 'paused') throw new Error('Resume the mission before approving work');
  const a = m.approvals.find((a) => a.id === id);
  if (!a || a.status !== 'requested' || revision !== m.revision || a.revision !== m.revision)
    throw new Error('This approval is stale; refresh the mission');
  if (a.kind === 'plan') {
    evaluate(m);
    if (a.status !== 'requested' || !m.plan.feasible || a.evidenceKey !== evidenceKey(m))
      throw new Error('Plan checks changed; refresh');
  }
  if (
    a.kind === 'research' &&
    m.mode === 'real' &&
    approved &&
    (!Number.isSafeInteger(callBudgetMinor) || callBudgetMinor <= 0)
  )
    throw new Error('Explicit call-cost budget required');
  a.status = approved ? 'approved' : 'declined';
  a.decidedAt = new Date().toISOString();
  if (a.kind === 'research' && approved) {
    m.callBudgetMinor = callBudgetMinor;
    m.status = 'running';
  }
  if (a.kind === 'plan' && approved) m.status = 'approved';
  if (!approved) m.status = 'blocked';
  event(
    m,
    'approval.decided',
    `${a.kind === 'plan' ? 'Plan' : 'Research'} ${approved ? 'approved' : 'declined'}. ${a.kind === 'plan' ? 'No purchase or reservation was performed.' : ''}`,
  );
}
export function brief(m: Mission, t: Task) {
  const own = latest(m, t.id);
  const others = m.tasks
    .filter((x) => x.id !== t.id)
    .map((x) => ({
      task: x.kind,
      terms: latest(m, x.id),
      facts: m.observations
        .filter((o) => o.taskId === x.id)
        .slice(-2)
        .map((o) => o.text),
    }));
  const otherCost = others.reduce((s, x) => s + (x.terms?.priceMinor || 0), 0);
  const setup = m.tasks.find((t) => t.kind === 'caterer');
  const setupMins = setup ? latest(m, setup.id)?.setupMinutes : undefined;
  return {
    missionId: m.id,
    missionTitle: m.title,
    goal: m.goal,
    taskId: t.id,
    taskKind: t.kind,
    taskTitle: t.title,
    revision: m.revision,
    paused: m.status === 'paused',
    constraints: m.constraints,
    question: t.question,
    latestTerms: own,
    sharedEvidence: others,
    maxPriceMinor: Math.max(0, m.constraints.budgetMinor - otherCost),
    latestAccessAt:
      setupMins === undefined
        ? undefined
        : new Date(Date.parse(m.constraints.eventStart) - setupMins * 60000).toISOString(),
    conflicts: m.conflicts,
    permissions: ['read_brief', 'report_observation', 'submit_offer', 'request_clarification'],
    commitmentAllowed: false,
  };
}
export function assertScope(m: Mission, scope: Scope, phone = false) {
  if (scope.missionId !== m.id || scope.ownerId !== m.ownerId || scope.expires < Date.now())
    throw new Error('Invalid or expired scope');
  if (phone && scope.role !== 'phone') throw new Error('Phone scope required');
  if (scope.role === 'phone') {
    const a = m.attempts.find(
      (a) => a.id === scope.attemptId && a.taskId === scope.taskId && a.mode === m.mode,
    );
    if (!a || !activeStatuses.includes(a.status))
      throw new Error('Call capability is no longer active');
  }
}
export function report(m: Mission, scope: Scope, key: string, text: string) {
  assertScope(m, scope, true);
  const dedup = `${scope.attemptId}:observation:${key}`;
  if (m.processedKeys.includes(dedup)) return;
  const o = {
    id: randomUUID(),
    taskId: scope.taskId!,
    attemptId: scope.attemptId!,
    mode: m.mode,
    text,
    createdAt: new Date().toISOString(),
    revision: m.revision,
    confirmation: 'reported' as const,
  };
  m.observations.push(o);
  m.processedKeys.push(dedup);
  event(m, 'observation.reported', text, scope.attemptId);
}
export function submit(m: Mission, scope: Scope, key: string, revision: number, input: unknown) {
  assertScope(m, scope, true);
  const terms = termsSchema.parse(input);
  const dedup = `${scope.attemptId}:offer:${key}`;
  if (m.processedKeys.includes(dedup)) return;
  if (revision !== m.revision)
    throw new Error('Stale revision. Refresh get_mission_brief before submitting terms.');
  const source = m.attempts.find((a) => a.id === scope.attemptId)!;
  if (source.briefRevision !== m.revision || source.briefEvidenceKey !== evidenceKey(m))
    throw new Error('Brief changed. Refresh get_mission_brief before submitting terms.');
  for (const o of m.offers) if (o.taskId === scope.taskId) o.stale = true;
  m.offers.push({
    ...terms,
    id: randomUUID(),
    taskId: scope.taskId!,
    attemptId: scope.attemptId!,
    mode: m.mode,
    revision,
    stale: false,
    declined: false,
    createdAt: new Date().toISOString(),
  });
  m.processedKeys.push(dedup);
  event(m, 'offer.submitted', terms.description, scope.attemptId);
  evaluate(m);
}
export function reserve(m: Mission, t: Task, id: string = randomUUID()): Attempt {
  const now = new Date().toISOString();
  const a: Attempt = {
    id,
    taskId: t.id,
    mode: m.mode,
    status: 'dispatching',
    createdAt: now,
    updatedAt: now,
    revision: m.revision,
    phase: 0,
    dueAt: now,
  };
  m.attempts.push(a);
  t.state = 'active';
  t.rounds++;
  event(m, 'call.reserved', `${t.title}: research attempt ${t.rounds} reserved.`, a.id);
  return a;
}
export function replan(m: Mission) {
  evaluate(m);
  if (
    m.status === 'paused' ||
    m.status === 'draft' ||
    m.plan.feasible ||
    m.tasks.some((t) => t.state === 'active')
  )
    return;
  const problems = m.conflicts.filter((c) => c.kind !== 'missing' && c.kind !== 'clarification');
  const questions = new Map<Task, string[]>();
  for (const c of problems) {
    let t = m.tasks.find((t) => t.id === c.taskId);
    if (c.kind === 'budget')
      t = [...m.tasks]
        .sort((a, b) => (latest(m, b.id)?.priceMinor || 0) - (latest(m, a.id)?.priceMinor || 0))
        .find((t) => t.rounds < 3 && !t.dispatchBlocked);
    if (t && t.rounds < 3 && !t.dispatchBlocked)
      questions.set(t, [...(questions.get(t) || []), c.message]);
  }
  for (const [t, messages] of questions) {
    const question = [...new Set(messages)].join(' ');
    if (t.state !== 'pending' || t.question !== question) {
      t.state = 'pending';
      t.question = question;
      event(m, 'task.replanned', `${t.title}: ${question}`);
    }
  }
  if (m.tasks.every((t) => t.state !== 'pending' && t.state !== 'active') && !m.plan.feasible)
    m.status = 'blocked';
}
export function declineOffer(m: Mission, id: string) {
  const o = m.offers.find((o) => o.id === id);
  if (!o) throw new Error('Offer not found');
  if (o.stale || o.declined || o.revision !== m.revision)
    throw new Error('These terms are stale. Refresh the mission before deciding.');
  o.declined = true;
  const t = m.tasks.find((t) => t.id === o.taskId)!;
  t.state = t.rounds < 3 ? 'pending' : 'blocked';
  t.question = 'The user declined previous terms. Investigate an alternative without committing.';
  event(m, 'offer.declined', 'User declined an offer; alternatives required.', o.attemptId);
  evaluate(m);
}
export function retryTask(m: Mission, taskId: string) {
  const task = m.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('Task not found');
  if (
    m.status === 'paused' ||
    m.attempts.some((a) => a.taskId === taskId && activeStatuses.includes(a.status))
  )
    throw new Error('Resolve the active/uncertain attempt or resume first');
  for (const offer of m.offers) if (offer.taskId === taskId) offer.stale = true;
  task.state = 'pending';
  task.rounds = 0;
  delete task.dispatchBlocked;
  task.question =
    'The owner requested fresh research. Reconfirm current terms without making a commitment.';
  m.status = 'running';
  requestApproval(m, 'research', true);
  evaluate(m);
  event(
    m,
    'task.retry',
    `Another ${task.kind} research attempt is prepared; new authorization is required.`,
  );
}
export function mergeStatus(current: Attempt['status'], next: Attempt['status']) {
  if (current === 'completed' || current === 'failed') return current;
  if (next === 'failed') return 'failed';
  const order = [
    'dispatching',
    'uncertain',
    'queued',
    'initiated',
    'ringing',
    'in-progress',
    'call-disconnected',
    'completed',
  ];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

export function refreshBrief(m: Mission, t: Task, a: Attempt) {
  const value = brief(m, t);
  a.lastBrief = JSON.stringify(value);
  a.briefRevision = m.revision;
  a.briefEvidenceKey = evidenceKey(m);
  a.revision = m.revision;
  return value;
}
