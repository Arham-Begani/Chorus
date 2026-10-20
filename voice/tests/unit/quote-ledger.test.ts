import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import QuoteLedger from '../../src/components/quote-ledger';
import { createMission, defaultConstraints } from '../../src/core/fixtures';

it('keeps historical prices out of comparison while preserving an explicitly free quote and zero setup', () => {
  const m = createMission('unit-owner', 'equipment', 'simulation', defaultConstraints());
  m.revision = 2;
  const task = m.tasks.find((t) => t.kind === 'delivery')!;
  const base = {
    taskId: task.id,
    attemptId: 'source-unit-attempt',
    mode: 'simulation' as const,
    description: 'Delivery test terms',
    confirmation: 'confirmed' as const,
    currency: 'INR' as const,
    stale: false,
    declined: false,
    createdAt: new Date().toISOString(),
  };
  m.offers.push(
    { ...base, id: 'old-quote', revision: 1, priceMinor: 9900000 },
    { ...base, id: 'current-quote', revision: 2, priceMinor: 0, setupMinutes: 0 },
  );
  const html = renderToStaticMarkup(
    createElement(QuoteLedger, { mission: m, onEvidence: () => {} }),
  );
  expect(html).not.toContain('99,000');
  expect(html).toContain('₹0');
  expect(html).toContain('0 min');
  expect(html).toContain('Not supplied');
  expect(html).toContain('Not received');
  expect(html).toContain('Confirmed');
});
