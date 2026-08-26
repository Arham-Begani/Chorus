/**
 * Check — the half that costs nothing.
 *
 * Debounced on keystroke: derive the commitment locally, read the public
 * counter. No transaction, no proof, no account, and no request to any server
 * that could log which handle was asked about. The label saying so is part of
 * the UI on purpose — it is the claim the panel exists to make, and it is
 * literally true of the code behind it.
 */

import { useEffect, useState, type JSX } from 'react';
import { normaliseHandle, truncate, type Reader, type UiCheck } from '../chorus.js';
import { Meter } from './Meter.js';

type Props = {
  readonly reader: Reader | undefined;
  /** Bumped after any report, so an open Check re-reads the register. */
  readonly revision: number;
};

type State =
  | { kind: 'empty' }
  | { kind: 'checking' }
  | { kind: 'result'; result: UiCheck }
  | { kind: 'failed'; reason: string };

export const Check = ({ reader, revision }: Props): JSX.Element => {
  const [handle, setHandle] = useState('');
  const [state, setState] = useState<State>({ kind: 'empty' });

  useEffect(() => {
    if (handle.trim() === '' || reader === undefined) {
      setState({ kind: 'empty' });
      return;
    }

    let cancelled = false;
    setState({ kind: 'checking' });

    const timer = setTimeout(() => {
      reader
        .check(handle)
        .then((result) => {
          if (!cancelled) {
            setState({ kind: 'result', result });
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setState({ kind: 'failed', reason: e instanceof Error ? e.message : String(e) });
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, reader, revision]);

  return (
    <section className="panel check">
      <div className="panel-head">
        <h2>Check</h2>
        <span className="badge free">free · traceless</span>
      </div>
      <p className="sub">
        <mark>no transaction, no server request</mark>
      </p>

      <label className="field">
        <span>handle you are about to pay</span>
        <input
          type="text"
          value={handle}
          spellCheck={false}
          autoComplete="off"
          placeholder="scammer@upi"
          onChange={(e) => setHandle(e.target.value)}
        />
      </label>

      {handle.trim() === '' && (
        <ol className="steps">
          <li>
            <b>Hash the handle here.</b> The same function the contract uses, run in this tab.
          </li>
          <li>
            <b>Read the public counter.</b> One lookup against a ledger anyone can read.
          </li>
          <li>
            <b>Stop.</b> There is no third step — nothing is submitted and nothing is logged.
          </li>
        </ol>
      )}

      {handle.trim() !== '' && (
        <div className="derivation">
          <div className="row">
            <span className="key">normalised</span>
            <span className="val">&apos;{normaliseHandle(handle)}&apos;</span>
          </div>
          <div className="row">
            <span className="key">commitment</span>
            <span className="val hash">
              {state.kind === 'result' ? truncate(state.result.commitment, 16, 12) : '…'}
            </span>
          </div>
        </div>
      )}

      {state.kind === 'checking' && <p className="status working">deriving locally and reading the ledger…</p>}

      {state.kind === 'result' && state.result.status === 'unreported' && (
        <div className="status ok">
          <strong>No reports.</strong>
          <p>This handle is not in the register. That is not a guarantee of safety — only an absence.</p>
        </div>
      )}

      {state.kind === 'result' && state.result.status === 'below-threshold' && (
        <div className="status below">
          <strong>
            Reported, below threshold ({state.result.count}/{state.result.threshold}).
          </strong>
          <p>Not enough independent reports to assert anything yet.</p>
          <Meter count={state.result.count} threshold={state.result.threshold} />
        </div>
      )}

      {state.kind === 'result' && state.result.status === 'matched' && (
        <div className="status matched">
          <strong>MATCHED — {state.result.count} independent reports.</strong>
          <p>Multiple people who have never met were each defrauded through this handle.</p>
          <Meter count={state.result.count} threshold={state.result.threshold} />
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="status failed">
          <strong>Could not read the register.</strong>
          <p className="note">{state.reason}</p>
        </div>
      )}

      <p className="note footnote">
        This check derived a hash in your browser and read a public ledger. Nothing was submitted, and no server
        was told which handle you asked about.
      </p>
    </section>
  );
};
