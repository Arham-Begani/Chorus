import { currentOffer } from './offers';
import type { Mission, Offer } from './types';

export type PlanCheck = {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  details: string[];
  attemptIds: string[];
};

const timestamp = (value?: string) => {
  const parsed = value === undefined ? NaN : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100);

// One pure assessment supplies admission checks, the workspace explanation and exported evidence.
export function assessPlan(m: Mission) {
  const conflicts: Mission['conflicts'] = [];
  const add = (kind: Mission['conflicts'][number]['kind'], message: string, taskId?: string) =>
    conflicts.push({ id: `${kind}:${taskId || 'all'}`, kind, message, taskId });
  const offers = m.tasks.map((t) => currentOffer(m, t.id));
  const received = offers.filter((o): o is Offer => !!o);
  const totalMinor = received.reduce((sum, o) => sum + o.priceMinor, 0);
  const sources = (items: (Offer | undefined)[]) => [
    ...new Set(items.flatMap((o) => (o ? [o.attemptId] : []))),
  ];
  const name = (o: Offer) => {
    const task = m.tasks.find((t) => t.id === o.taskId)!;
    return m.contacts.find((c) => c.id === task.contactId)?.name || task.title;
  };
  const time = (value: number) =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: m.constraints.timezone,
    }).format(new Date(value));
  const end = Date.parse(m.constraints.eventStart);
  const margin = (finish: number) =>
    finish > end
      ? `${Math.ceil((finish - end) / 60000)} min after the start.`
      : finish === end
        ? 'Ready exactly at the start.'
        : `${Math.floor((end - finish) / 60000)} min before the start.`;

  const capacityDetails: string[] = [];
  let capacityStatus: PlanCheck['status'] = 'pass';
  for (const [index, offer] of offers.entries()) {
    const task = m.tasks[index];
    if (!offer) add('missing', `${task.title}: current terms needed.`, task.id);
    else if (offer.confirmation !== 'confirmed')
      add('confirmation', `${task.title}: terms are reported, awaiting confirmation.`, task.id);
    if (!['venue', 'transport', 'equipment'].includes(task.kind)) continue;
    const label = m.contacts.find((c) => c.id === task.contactId)?.name || task.title;
    if (offer?.capacity === undefined) {
      capacityDetails.push(`${label}: capacity not supplied; ${m.constraints.quantity} required.`);
      if (capacityStatus !== 'fail') capacityStatus = 'pending';
    } else {
      capacityDetails.push(`${label}: ${offer.capacity} for ${m.constraints.quantity} people.`);
      if (offer.capacity < m.constraints.quantity) capacityStatus = 'fail';
    }
    if (offer && (offer.capacity === undefined || offer.capacity < m.constraints.quantity))
      add(
        'capacity',
        `${task.title}: capacity must be at least ${m.constraints.quantity}.`,
        task.id,
      );
  }
  if (totalMinor > m.constraints.budgetMinor)
    add(
      'budget',
      `Additional spending exceeds the budget by INR ${((totalMinor - m.constraints.budgetMinor) / 100).toLocaleString('en-IN')}.`,
    );

  const byKind = (kind: string) => offers.find((o, i) => o && m.tasks[i].kind === kind);
  const venue = byKind('venue'),
    caterer = byKind('caterer'),
    transport = byKind('transport');
  const equipment = byKind('equipment'),
    delivery = byKind('delivery');
  const timingDetails: string[] = [];
  let timingStatus: PlanCheck['status'] = 'pass';
  const pendingTiming = (detail: string) => {
    timingDetails.push(detail);
    if (timingStatus !== 'fail') timingStatus = 'pending';
  };
  const finishCheck = (finish: number, detail: string) => {
    timingDetails.push(`${detail} ${margin(finish)}`);
    if (finish > end) timingStatus = 'fail';
  };
  if (m.scenario === 'relocation') {
    const access = timestamp(venue?.readyAt),
      arrival = timestamp(transport?.readyAt);
    if (venue && access === undefined)
      add('missing', 'Venue access time is required.', venue.taskId);
    if (caterer && caterer.setupMinutes === undefined)
      add('missing', 'Caterer setup duration is required.', caterer.taskId);
    if (venue && caterer && access !== undefined && caterer.setupMinutes !== undefined) {
      const finish = access + caterer.setupMinutes * 60000;
      finishCheck(
        finish,
        `${time(access)} access + ${caterer.setupMinutes} min setup = ${time(finish)}.`,
      );
      if (finish > end)
        add(
          'timing',
          `Venue access plus ${caterer.setupMinutes} minutes of catering setup misses the start by ${Math.ceil((finish - end) / 60000)} minutes. Ask for earlier access.`,
          venue.taskId,
        );
    } else
      pendingTiming(
        'Venue access and catering setup are needed to calculate when the room is ready.',
      );
    if (transport && arrival !== undefined)
      finishCheck(arrival, `${name(transport)} arrives ${time(arrival)}.`);
    else pendingTiming('Transport arrival time is needed.');
    if (transport && (arrival === undefined || arrival > end))
      add('timing', 'Transport must arrive before the event starts.', transport.taskId);
  } else {
    const available = timestamp(equipment?.readyAt),
      arrival = timestamp(delivery?.readyAt);
    if (equipment && (available === undefined || available > end))
      add('timing', 'Equipment must be available before the event.', equipment.taskId);
    if (equipment && available !== undefined)
      finishCheck(available, `Equipment is available ${time(available)}.`);
    else pendingTiming('Equipment availability time is needed.');
    if (
      equipment &&
      delivery &&
      available !== undefined &&
      arrival !== undefined &&
      delivery.setupMinutes !== undefined
    ) {
      const start = Math.max(available, arrival),
        finish = start + delivery.setupMinutes * 60000;
      finishCheck(
        finish,
        `Later of equipment ${time(available)} and delivery ${time(arrival)}, plus ${delivery.setupMinutes} min installation = ${time(finish)}.`,
      );
    } else
      pendingTiming(
        'Equipment, delivery and installation terms are needed to calculate readiness.',
      );
    if (
      delivery &&
      (arrival === undefined ||
        delivery.setupMinutes === undefined ||
        Math.max(arrival, available ?? 0) + (delivery.setupMinutes ?? 0) * 60000 > end)
    )
      add(
        'timing',
        'Delivery, equipment availability and installation must fit before the event.',
        delivery.taskId,
      );
  }
  for (const c of m.conflicts.filter((c) => c.kind === 'clarification')) conflicts.push(c);

  const complete = received.length === m.tasks.length;
  const confirmed = received.filter((o) => o.confirmation === 'confirmed').length;
  const budgetDetails = [
    `${money(totalMinor)} received against a ${money(m.constraints.budgetMinor)} limit.`,
  ];
  if (totalMinor > m.constraints.budgetMinor)
    budgetDetails.push(`${money(totalMinor - m.constraints.budgetMinor)} over budget.`);
  else if (complete)
    budgetDetails.push(`${money(m.constraints.budgetMinor - totalMinor)} remaining.`);
  if (!complete)
    budgetDetails.push(
      `${received.length} of ${m.tasks.length} quotes received; the total is incomplete.`,
    );
  const checks: PlanCheck[] = [
    {
      id: 'timing',
      label: 'Readiness & setup',
      status: timingStatus,
      details: timingDetails,
      attemptIds: sources(offers),
    },
    {
      id: 'budget',
      label: 'Shared budget',
      status: totalMinor > m.constraints.budgetMinor ? 'fail' : complete ? 'pass' : 'pending',
      details: budgetDetails,
      attemptIds: sources(offers),
    },
    {
      id: 'capacity',
      label: 'Capacity',
      status: capacityStatus,
      details: capacityDetails,
      attemptIds: sources(
        offers.filter((o, i) => ['venue', 'transport', 'equipment'].includes(m.tasks[i].kind)),
      ),
    },
    {
      id: 'confirmation',
      label: 'Current confirmations',
      status: confirmed === m.tasks.length ? 'pass' : 'pending',
      details: [
        `${confirmed} of ${m.tasks.length} current quotes confirmed.`,
        'Only this mission’s current revision and mode can support the plan.',
      ],
      attemptIds: sources(offers),
    },
  ];
  const clarifications = conflicts.filter((c) => c.kind === 'clarification');
  if (clarifications.length)
    checks.push({
      id: 'clarification',
      label: 'Owner clarification',
      status: 'fail',
      details: clarifications.map((c) => c.message),
      attemptIds: [],
    });
  return {
    conflicts,
    checks,
    offerIds: received.map((o) => o.id),
    totalMinor,
    feasible: conflicts.length === 0,
  };
}
