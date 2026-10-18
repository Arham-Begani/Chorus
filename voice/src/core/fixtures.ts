import { randomUUID } from 'node:crypto';
import type { Constraints, Mission, TaskKind, Terms } from './types';
export function defaultConstraints(): Constraints {
  const date = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
  return {
    budgetMinor: 1200000,
    currency: 'INR',
    quantity: 40,
    eventStart: `${date}T18:00:00+05:30`,
    timezone: 'Asia/Kolkata',
  };
}
export function createMission(
  ownerId: string,
  scenario: 'relocation' | 'equipment',
  mode: 'simulation' | 'real',
  constraints: Constraints,
  goal?: string,
): Mission {
  const now = new Date().toISOString();
  const kinds: TaskKind[] =
    scenario === 'relocation' ? ['venue', 'caterer', 'transport'] : ['equipment', 'delivery'];
  const labels: Record<TaskKind, string> = {
    venue: 'The Courtyard',
    caterer: 'Saffron Kitchen',
    transport: 'City Shuttle',
    equipment: 'Signal Rentals',
    delivery: 'Swift Logistics',
  };
  const tasks = kinds.map((kind) => ({
    id: randomUUID(),
    kind,
    contactId: randomUUID(),
    title: {
      venue: 'Find an alternative venue',
      caterer: 'Coordinate catering',
      transport: 'Arrange guest transport',
      equipment: 'Source equipment',
      delivery: 'Coordinate delivery',
    }[kind],
    dependsOn: [] as string[],
    state: 'pending' as const,
    question: 'Confirm availability, complete additional cost, capacity and timing. Do not book.',
    rounds: 0,
  }));
  if (tasks[1]) tasks[1].dependsOn = [tasks[0].id];
  if (tasks[2]) tasks[2].dependsOn = [tasks[0].id];
  const at = (mins: number) =>
    new Date(Date.parse(constraints.eventStart) - mins * 60000).toISOString();
  const term = (priceMinor: number, description: string, extra: Partial<Terms> = {}): Terms => ({
    priceMinor,
    currency: 'INR',
    description,
    confirmation: 'confirmed',
    ...extra,
  });
  const responses: Record<string, Terms[]> = {
    venue: [
      term(600000, 'Courtyard hall, access from 17:30', { capacity: 50, readyAt: at(30) }),
      term(550000, 'Earlier access available from 17:00', { capacity: 50, readyAt: at(60) }),
      term(450000, 'Smaller hall; same capacity and earlier access', {
        capacity: 40,
        readyAt: at(60),
      }),
    ],
    caterer: [
      term(250000, 'Relocation fee; 45 minutes to set up', { setupMinutes: 45 }),
      term(200000, 'Reduced relocation fee; setup still 45 minutes', { setupMinutes: 45 }),
    ],
    transport: [
      term(250000, 'Two shuttles; guests arrive 15 minutes before start', {
        capacity: 40,
        readyAt: at(15),
      }),
      term(200000, 'Single larger shuttle; arrival unchanged', { capacity: 40, readyAt: at(15) }),
    ],
    equipment: [term(500000, 'PA system and microphones', { capacity: 40, readyAt: at(90) })],
    delivery: [term(150000, 'Delivery and installation', { readyAt: at(60), setupMinutes: 30 })],
  };
  const m: Mission = {
    id: randomUUID(),
    ownerId,
    title:
      scenario === 'relocation'
        ? 'Bring the evening back together'
        : 'Everything in place, before doors open',
    goal:
      goal ||
      (scenario === 'relocation'
        ? 'Our venue cancelled. Find an alternative for 40 people, coordinate the existing caterer, and arrange transport.'
        : 'Rent sound equipment and coordinate delivery and setup before the event.'),
    scenario,
    mode,
    status: 'draft',
    revision: 1,
    constraints,
    revisions: [
      {
        id: randomUUID(),
        number: 1,
        constraints: structuredClone(constraints),
        reason: 'Mission proposed',
        createdAt: now,
      },
    ],
    contacts: tasks.map((t) => ({
      id: t.contactId,
      name: labels[t.kind],
      kind: t.kind,
      phone: '',
      authorized: false,
    })),
    tasks,
    attempts: [],
    observations: [],
    offers: [],
    approvals: [],
    conflicts: [],
    events: [],
    processedKeys: [],
    responses,
    createdAt: now,
    updatedAt: now,
    plan: { offerIds: [], totalMinor: 0, feasible: false },
    callBudgetMinor: 0,
    callReservedMinor: 0,
  };
  return m;
}
