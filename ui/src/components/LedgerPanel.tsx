/**
 * The raw public ledger.
 *
 * This panel exists to be pointed at. It must be visually obvious that it
 * contains nothing but hashes and counters.
 *
 * Deliberately NOT done here, and please do not add them: prettifying the
 * rows, labelling commitments with human-readable names, or resolving a
 * commitment back to a handle even when the browser happens to know the handle
 * that produced it. The ugliness is the argument. A judge who sees a friendly
 * table of scammer names has been shown the opposite of what Chorus does.
 */

import { type JSX } from 'react';
import { type UiSnapshot } from '../chorus.js';

type Props = {
  readonly snapshot: UiSnapshot | undefined;
  readonly network: string;
  readonly contractAddress: string;
  readonly error: string | undefined;
};

export const LedgerPanel = ({ snapshot, network, contractAddress, error }: Props): JSX.Element => (
  <section className="panel ledger">
    <div className="panel-head">
      <h2>Public ledger</h2>
      <span className="badge public">world-readable · permanent</span>
    </div>
    <p className="sub">Everything below is what an observer with the whole chain can see.</p>

    <div className="row">
      <span className="key">network</span>
      <span className="val">{network}</span>
    </div>
    <div className="row">
      <span className="key">contract</span>
      <span className="val hash wrap">{contractAddress}</span>
    </div>

    {error !== undefined && <p className="status failed">{error}</p>}

    {snapshot === undefined ? (
      <p className="note">reading…</p>
    ) : (
      <>
        <div className="tiles">
          <div className="tile sealed">
            <span className="k">threshold</span>
            <span className="v">{snapshot.threshold}</span>
            <span className="hint">sealed — nobody can change it</span>
          </div>
          <div className="tile">
            <span className="k">totalReports</span>
            <span className="v">{snapshot.totalReports}</span>
            <span className="hint">accepted, all time</span>
          </div>
          <div className="tile">
            <span className="k">seenNullifiers</span>
            <span className="v">{snapshot.nullifierCount}</span>
            <span className="hint">spent, unlinkable</span>
          </div>
          <div className="tile">
            <span className="k">handles stored</span>
            <span className="v">0</span>
            <span className="hint">and there is no field for one</span>
          </div>
        </div>

        <h3>reportCount</h3>
        {snapshot.commitments.length === 0 ? (
          <p className="note">empty</p>
        ) : (
          <table className="raw">
            <tbody>
              {snapshot.commitments.map((row) => (
                <tr key={row.commitment} className={row.matched ? 'matched' : undefined}>
                  <td className="hash">{row.commitment}</td>
                  <td className="count">{row.count}</td>
                  <td className="flag">{row.matched ? 'MATCHED' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="note footnote">
          An observer with the full chain and unlimited compute learns that some handle received N reports. Not
          which handle, not from whom, not for how much.
        </p>
      </>
    )}
  </section>
);
