import { expect, it } from 'vitest';
import { decodePhoneQuote } from '../../src/core/phone-quote';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { reserve } from '../../src/core/engine';
import { executeToolRequest } from '../../src/server/tools';
import type { Scope, Terms } from '../../src/core/types';

const quote = (extra: object = {}) => ({
  token: 'verified-test-capability',
  key: 'quote',
  revision: 1,
  price_inr: '1500.50',
  description: 'Delivery of "PA speakers" including fees',
  confirmation: 'reported',
  ...extra,
});
it.each([
  ['1500.50', 150050],
  ['₹1,500.05', 150005],
  ['INR 1,50,000.01', 15000001],
  ['0', 0],
  ['0.10', 10],
  ['1000000', 100000000],
])(
  'stores %s INR as exactly %i paise without floating-point multiplication',
  (price_inr, expected) => {
    expect(decodePhoneQuote(quote({ price_inr })).terms.priceMinor).toBe(expected);
  },
);
it.each(['-1', '1,2,3', '1.005', '1e3', '1000000.01', 'USD 15'])(
  'rejects an ambiguous or unsupported quote amount %s',
  (price_inr) => {
    expect(() => decodePhoneQuote(quote({ price_inr }))).toThrow();
  },
);
it('keeps omitted optional details unknown and retains an explicitly zero setup duration', () => {
  const parsed = decodePhoneQuote(
    quote({
      capacity: { $var: 'capacity' },
      ready_at: { $var: 'ready_at' },
      setup_minutes: '0',
    }),
  );
  expect(parsed.terms).toMatchObject({ priceMinor: 150050, setupMinutes: 0 });
  expect(parsed.terms).not.toHaveProperty('capacity');
  expect(parsed.terms).not.toHaveProperty('readyAt');
  expect(() => decodePhoneQuote(quote({ capacity: { $var: 'setup_minutes' } }))).toThrow();
});
it('retains previous details for a price-only correction, but explicit retraction clears them', () => {
  const previous: Terms = {
    priceMinor: 150050,
    currency: 'INR',
    description: 'Delivery',
    confirmation: 'reported',
    readyAt: '2026-10-20T17:00:00+05:30',
    setupMinutes: 0,
  };
  const corrected = decodePhoneQuote(
    quote({ price_inr: '1600.50', ready_at: { $var: 'ready_at' } }),
    previous,
  );
  expect(corrected.terms).toMatchObject({
    priceMinor: 160050,
    readyAt: previous.readyAt,
    setupMinutes: 0,
  });
  const retracted = decodePhoneQuote(quote({ ready_at: '', setup_minutes: null }), previous);
  expect(retracted.terms).not.toHaveProperty('readyAt');
  expect(retracted.terms).not.toHaveProperty('setupMinutes');
});
function call() {
  const m = createMission('quote-operator', 'equipment', 'real', defaultConstraints());
  m.status = 'running';
  const a = reserve(m, m.tasks[1]);
  a.status = 'in-progress';
  const scope: Scope = {
    role: 'phone',
    ownerId: m.ownerId,
    missionId: m.id,
    taskId: a.taskId,
    attemptId: a.id,
    expires: Date.now() + 60000,
  };
  const invoke = (name: string, data: object = {}) =>
    executeToolRequest(m, scope, name, { token: 'verified-test-capability', ...data }) as any;
  return { m, a, invoke };
}
it('corrects and confirms a quote using known answers, then acknowledges an identical retry without another question', () => {
  const { m, a, invoke } = call();
  invoke('get_mission_brief');
  invoke('report_observation', {
    key: 'availability',
    text: 'Delivery is available. Setup needs zero minutes.',
  });
  invoke('get_mission_brief');
  const ready_at = new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString();
  const original = quote({ ready_at });
  expect(invoke('submit_offer', original).conversation.phase).toBe('collect');
  invoke('get_mission_brief');
  const corrected = quote({
    key: 'corrected',
    price_inr: '1600.50',
    confirmation: 'confirmed',
    setup_minutes: '0',
  });
  expect(invoke('submit_offer', corrected)).toMatchObject({
    ok: true,
    conversation: { action: 'end', reason: 'task-complete' },
  });
  expect(invoke('submit_offer', original)).toMatchObject({
    ok: true,
    duplicate: true,
    conversation: { action: 'end' },
  });
  expect(m.offers.filter((o) => !o.stale)).toEqual([
    expect.objectContaining({
      attemptId: a.id,
      priceMinor: 160050,
      readyAt: ready_at,
      setupMinutes: 0,
      confirmation: 'confirmed',
    }),
  ]);
  expect(invoke('submit_offer', corrected)).toMatchObject({
    ok: true,
    duplicate: true,
    conversation: { action: 'end' },
  });
  expect(m.offers).toHaveLength(2);
  expect(m.observations).toHaveLength(1);
  expect(m.plan.feasible).toBe(false); // Equipment is still unknown, not fabricated.
});
it('repairs a changed quote using an already used key without repeating the human confirmation', () => {
  const { m, a, invoke } = call();
  invoke('get_mission_brief');
  const ready_at = new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString();
  invoke('submit_offer', quote({ ready_at, setup_minutes: '30' }));
  invoke('get_mission_brief');
  const confirmed = quote({ confirmation: 'confirmed' });
  const conflict = invoke('submit_offer', confirmed);
  expect(conflict).toMatchObject({
    ok: false,
    error: { code: 'new_operation_key', fields: ['key'] },
    conversation: { phase: 'repair' },
  });
  expect(conflict.conversation.instruction).toContain('Do not ask for confirmation again');
  expect(m.offers).toHaveLength(1);
  expect(m.offers[0].confirmation).toBe('reported');
  invoke('get_mission_brief');
  expect(invoke('submit_offer', { ...confirmed, key: 'confirmed' })).toMatchObject({
    ok: true,
    conversation: { action: 'end', reason: 'task-complete' },
  });
  expect(a.phoneToolFailures).toBe(0);
  expect(a.quoteOperations).toHaveLength(2);
  expect(m.offers.filter((o) => !o.stale)[0]).toMatchObject({
    confirmation: 'confirmed',
    readyAt: ready_at,
    setupMinutes: 30,
  });
});
it('a new operation key for an unchanged quote cannot fabricate progress or duplicate evidence', () => {
  const { m, a, invoke } = call();
  invoke('get_mission_brief');
  invoke('submit_offer', quote());
  invoke('get_mission_brief');
  const offerId = m.offers[0].id;
  expect(invoke('submit_offer', quote({ key: 'different-key' })).ok).toBe(true);
  expect(m.offers).toHaveLength(1);
  expect(m.offers[0].id).toBe(offerId);
  expect(m.events.filter((e) => e.type === 'offer.submitted')).toHaveLength(1);
  invoke('get_mission_brief');
  expect(a.unchangedBriefReads).toBe(2);
});
it('identifies the invalid amount and permits one silent repair without echoing supplied values', () => {
  const { m, a, invoke } = call();
  invoke('get_mission_brief');
  const failed = invoke('submit_offer', quote({ price_inr: '100.999' }));
  expect(failed).toMatchObject({
    ok: false,
    error: { code: 'invalid_arguments', fields: ['price_inr'] },
    conversation: { phase: 'repair' },
  });
  expect(JSON.stringify(failed)).not.toContain('100.999');
  expect(m.offers).toHaveLength(0);
  expect(invoke('submit_offer', quote({ price_inr: '100.99' })).ok).toBe(true);
  expect(m.offers[0].priceMinor).toBe(10099);
  expect(a.phoneToolFailures).toBe(0);
});
it('rejects mixed quote formats and timestamps without a timezone instead of guessing', () => {
  const { m, invoke } = call();
  invoke('get_mission_brief');
  expect(invoke('submit_offer', quote({ payload_json: '{}' }))).toMatchObject({
    ok: false,
    error: { fields: ['price_inr'] },
  });
  const separate = call();
  separate.invoke('get_mission_brief');
  expect(separate.invoke('submit_offer', quote({ ready_at: '2026-10-20T17:00:00' }))).toMatchObject(
    { ok: false, error: { fields: ['ready_at'] } },
  );
  expect(m.offers).toHaveLength(0);
  expect(separate.m.offers).toHaveLength(0);
});
