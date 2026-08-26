import { describe, expect, it } from 'vitest';
import { ChorusSimulator } from './chorus-simulator.js';
import { handleBytes, normaliseHandle } from '../normalise.js';

/** Deterministic reporter keys, so failures are reproducible. */
const reporterKey = (n: number): Uint8Array =>
  new Uint8Array(32).fill(n);

const REPORTER_A = reporterKey(1);
const REPORTER_B = reporterKey(2);
const REPORTER_C = reporterKey(3);

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Does `needle` appear anywhere inside `haystack`? */
const containsBytes = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  if (needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
};

describe('normalisation', () => {
  // If this drifts between two clients, two victims of the same scammer never
  // match and Chorus silently fails. There is no error for that, so it is
  // tested directly.
  it('collapses case and whitespace to one canonical form', () => {
    expect(normaliseHandle('  Scammer@UPI ')).toBe('scammer@upi');
    expect(normaliseHandle('SCAMMER@UPI')).toBe('scammer@upi');
    expect(normaliseHandle('scam mer@upi')).toBe('scammer@upi');
  });

  it('produces identical commitments for differently-typed forms of one handle', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const a = sim.commitmentOf(await handleBytes('  Scammer@UPI '));
    const b = sim.commitmentOf(await handleBytes('scammer@upi'));
    expect(hex(a)).toBe(hex(b));
  });

  it('does NOT merge handles that differ meaningfully', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    // Dots and plus-addressing can denote different accounts; collapsing them
    // would let one merchant's reports land on another merchant's commitment.
    const a = sim.commitmentOf(await handleBytes('a.b@upi'));
    const b = sim.commitmentOf(await handleBytes('ab@upi'));
    expect(hex(a)).not.toBe(hex(b));
  });
});

describe('derivations', () => {
  it('same handle + different reporters -> same commitment, different nullifiers', async () => {
    const h = await handleBytes('scammer@upi');
    const sim = new ChorusSimulator(REPORTER_A);

    const commitmentA = sim.commitmentOf(h);
    const nullifierA = sim.nullifierOf(h);

    sim.switchReporter(REPORTER_B);
    const commitmentB = sim.commitmentOf(h);
    const nullifierB = sim.nullifierOf(h);

    // Same handle must always yield the same commitment — that is what lets
    // strangers' reports land on the same counter.
    expect(hex(commitmentA)).toBe(hex(commitmentB));
    // But their nullifiers must differ, or the second reporter would be
    // rejected as a double-report.
    expect(hex(nullifierA)).not.toBe(hex(nullifierB));
  });

  it('one reporter gets unlinkable nullifiers across different handles', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const n1 = sim.nullifierOf(await handleBytes('scammer@upi'));
    const n2 = sim.nullifierOf(await handleBytes('other@upi'));
    expect(hex(n1)).not.toBe(hex(n2));
  });
});

describe('report', () => {
  it('records a first report as count 1, unmatched', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const h = await handleBytes('scammer@upi');
    const c = sim.commitmentOf(h);

    sim.report(h);

    expect(sim.countOf(c)).toBe(1n);
    expect(sim.isMatched(c)).toBe(false);
    expect(sim.getLedger().totalReports).toBe(1n);
  });

  it('rejects the same reporter reporting the same handle twice', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const h = await handleBytes('scammer@upi');

    sim.report(h);
    // Rejected by the CONTRACT via the nullifier set, not by UI validation.
    expect(() => sim.report(h)).toThrow(/already reported this handle/);

    // And the rejection must not have inflated anything.
    expect(sim.countOf(sim.commitmentOf(h))).toBe(1n);
    expect(sim.getLedger().totalReports).toBe(1n);
  });

  it('keeps counts independent across different handles', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const h1 = await handleBytes('scammer@upi');
    const h2 = await handleBytes('other@upi');

    sim.report(h1);
    sim.report(h2);

    expect(sim.countOf(sim.commitmentOf(h1))).toBe(1n);
    expect(sim.countOf(sim.commitmentOf(h2))).toBe(1n);
    expect(sim.getLedger().totalReports).toBe(2n);
  });
});

describe('threshold', () => {
  it('is sealed at 3 and flips match only on the third distinct reporter', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const h = await handleBytes('scammer@upi');
    const c = sim.commitmentOf(h);

    expect(sim.getLedger().threshold).toBe(3n);

    sim.report(h);
    expect(sim.countOf(c)).toBe(1n);
    expect(sim.isMatched(c)).toBe(false);

    sim.switchReporter(REPORTER_B);
    sim.report(h);
    expect(sim.countOf(c)).toBe(2n);
    // Two is still silence. Below the threshold a count means nothing to anyone.
    expect(sim.isMatched(c)).toBe(false);

    sim.switchReporter(REPORTER_C);
    sim.report(h);
    expect(sim.countOf(c)).toBe(3n);
    // Three strangers, who never communicated, simultaneously learn they were
    // hit by the same operator.
    expect(sim.isMatched(c)).toBe(true);
  });

  it('does not flip match for three reports on different handles', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const handles = await Promise.all(
      ['a@upi', 'b@upi', 'c@upi'].map(handleBytes),
    );
    for (const [i, h] of handles.entries()) {
      sim.switchReporter(reporterKey(i + 1));
      sim.report(h);
    }
    for (const h of handles) {
      expect(sim.isMatched(sim.commitmentOf(h))).toBe(false);
    }
  });
});

describe('disclosure — the property the whole design rests on', () => {
  // This is the test to show a judge.
  it('leaks neither the handle nor any secret key into public ledger state', async () => {
    const sim = new ChorusSimulator(REPORTER_A);
    const rawHandle = 'scammer@upi';
    const h = await handleBytes(rawHandle);

    sim.report(h);
    sim.switchReporter(REPORTER_B);
    sim.report(h);
    sim.switchReporter(REPORTER_C);
    sim.report(h);

    const publicBytes = sim.publicStateBytes();
    const flattened = new Uint8Array(
      publicBytes.reduce<number[]>((acc, b) => acc.concat(Array.from(b)), []),
    );

    // The hashed handle must not appear anywhere in public state.
    expect(containsBytes(flattened, h)).toBe(false);

    // Nor must the raw handle string, in any encoding an observer might try.
    expect(containsBytes(flattened, new TextEncoder().encode(rawHandle))).toBe(
      false,
    );

    // Nor any reporter's secret key.
    for (const key of [REPORTER_A, REPORTER_B, REPORTER_C]) {
      expect(containsBytes(flattened, key)).toBe(false);
    }

    // What IS public: opaque 32-byte values and a count. Three commitments'
    // worth of entries (1 commitment + 3 nullifiers + 1 matched), all 32 bytes.
    for (const b of publicBytes) {
      expect(b.length).toBe(32);
    }

    // And the observer can see that *some* handle reached three reports —
    // which is the entire intended disclosure, and nothing more.
    const c = sim.commitmentOf(h);
    expect(sim.countOf(c)).toBe(3n);
    expect(sim.isMatched(c)).toBe(true);
  });
});
