/**
 * Report — the half that costs something.
 *
 * The sequence deliberately shows the derivation BEFORE the submit button
 * becomes meaningful. A user watching the handle they typed turn into two
 * opaque 32-byte hashes, and then watching only those hashes go to the chain,
 * is most of the argument this product makes.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import {
  derive,
  DuplicateReportError,
  report as submitReport,
  REPORTERS,
  type Derived,
  type Receipt,
  type ReporterId,
} from '../agent.js';
import { normaliseHandle, truncate } from '../chorus.js';
import { Meter } from './Meter.js';

type Phase =
  | { kind: 'idle' }
  | { kind: 'deriving' }
  | { kind: 'derived'; derived: Derived }
  | { kind: 'proving'; derived: Derived }
  | { kind: 'submitted'; derived: Derived; receipt: Receipt }
  | { kind: 'rejected'; derived: Derived; reason: string }
  | { kind: 'failed'; reason: string };

type Props = {
  readonly agentReady: boolean;
  /** The sealed threshold, for the meter. Undefined until the first read lands. */
  readonly threshold: string | undefined;
  readonly onReported: () => void;
};

export const Report = ({ agentReady, threshold, onReported }: Props): JSX.Element => {
  const [handle, setHandle] = useState('');
  const [reporter, setReporter] = useState<ReporterId>('A');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // Re-derive whenever the handle or the reporter changes. The commitment
  // depends only on the handle; the nullifier depends on the handle AND the
  // reporter's secret key, which is exactly why switching reporter changes one
  // value and not the other — visibly, on screen.
  useEffect(() => {
    if (handle.trim() === '' || !agentReady) {
      setPhase({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    setPhase({ kind: 'deriving' });

    const timer = setTimeout(() => {
      derive(reporter, handle)
        .then((derived) => {
          if (!cancelled) {
            setPhase({ kind: 'derived', derived });
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setPhase({ kind: 'failed', reason: e instanceof Error ? e.message : String(e) });
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, reporter, agentReady]);

  const onSubmit = useCallback(async () => {
    if (phase.kind !== 'derived') {
      return;
    }
    const { derived } = phase;
    setPhase({ kind: 'proving', derived });

    try {
      const receipt = await submitReport(reporter, handle);
      setPhase({ kind: 'submitted', derived, receipt });
      onReported();
    } catch (e) {
      if (e instanceof DuplicateReportError) {
        // The contract refused it. This is the nullifier doing its job.
        setPhase({ kind: 'rejected', derived, reason: e.message });
        onReported();
        return;
      }
      setPhase({ kind: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
  }, [phase, reporter, handle, onReported]);

  const derived = 'derived' in phase ? phase.derived : undefined;
  const busy = phase.kind === 'proving';

  return (
    <section className="panel report">
      <div className="panel-head">
        <h2>Report</h2>
        <span className="badge cost">costs a proof</span>
      </div>
      <p className="sub">A transaction. Proof generated locally, two hashes published.</p>

      <label className="field">
        <span>handle that took your money</span>
        <input
          type="text"
          value={handle}
          spellCheck={false}
          autoComplete="off"
          placeholder="scammer@upi"
          disabled={busy}
          onChange={(e) => setHandle(e.target.value)}
        />
      </label>

      <div className="field">
        <span>reporting as</span>
        <div className="reporters">
          {REPORTERS.map((id) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              className={id === reporter ? 'reporter active' : 'reporter'}
              onClick={() => setReporter(id)}
            >
              Reporter {id}
            </button>
          ))}
        </div>
        <span className="note">three independent secret keys, three unlinkable nullifiers</span>
      </div>

      {handle.trim() !== '' && (
        <div className="derivation">
          <div className="row">
            <span className="key">normalised</span>
            <span className="val">&apos;{normaliseHandle(handle)}&apos;</span>
          </div>
          <div className="row">
            <span className="key">commitment</span>
            <span className="val hash">{derived ? truncate(derived.commitment, 16, 12) : '…'}</span>
          </div>
          <div className="row">
            <span className="key">nullifier</span>
            <span className="val hash">{derived ? truncate(derived.nullifier, 16, 12) : '…'}</span>
          </div>
          <p className="note">
            These two values are all that reach the chain. The handle and the secret key stay here.
          </p>
        </div>
      )}

      <button
        type="button"
        className="submit"
        disabled={phase.kind !== 'derived' || !agentReady}
        onClick={() => void onSubmit()}
      >
        {busy ? 'proving…' : 'Report this handle'}
      </button>

      {phase.kind === 'proving' && (
        <p className="status working">generating zero-knowledge proof and submitting transaction…</p>
      )}

      {phase.kind === 'submitted' && (
        <div className={phase.receipt.matched ? 'status matched' : 'status ok'}>
          {phase.receipt.matched ? (
            <>
              <strong>MATCHED — you are not the only one.</strong>
              <p>
                {phase.receipt.count} independent reporters have reported this handle. None of them can identify
                you, and you cannot identify them.
              </p>
            </>
          ) : (
            <>
              <strong>Reported. Count is now {phase.receipt.count}.</strong>
              <p>Below the threshold, this discloses nothing to anyone.</p>
            </>
          )}
          <div className="row">
            <span className="key">tx</span>
            <span className="val hash">{truncate(phase.receipt.txHash, 16, 12)}</span>
          </div>
          <div className="row">
            <span className="key">block</span>
            <span className="val">{phase.receipt.blockHeight}</span>
          </div>
          {threshold !== undefined && <Meter count={phase.receipt.count} threshold={threshold} />}
        </div>
      )}

      {phase.kind === 'rejected' && (
        <div className="status rejected">
          <strong>Rejected by the contract.</strong>
          <p>
            This reporter has already reported this handle. The nullifier is already in the public set, so the
            count cannot be inflated — and the chain still does not know who you are.
          </p>
          <p className="note">{phase.reason}</p>
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="status failed">
          <strong>Failed.</strong>
          <p className="note">{phase.reason}</p>
        </div>
      )}
    </section>
  );
};
