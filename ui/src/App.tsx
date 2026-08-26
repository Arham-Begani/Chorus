/**
 * One page, three regions, no routing.
 *
 * Report and Check sit side by side because their asymmetry is the product:
 * one is a transaction that costs a proof, the other is a local hash and a
 * public read. The ledger panel runs underneath both and is always visible, so
 * that at any moment during a demo you can point at it and show that it
 * contains nothing legible.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { Report } from './components/Report.js';
import { Check } from './components/Check.js';
import { LedgerPanel } from './components/LedgerPanel.js';
import { readerFor, type Reader, type UiSnapshot } from './chorus.js';
import { loadDeployment, type Deployment } from './config.js';
import { agentStatus } from './agent.js';

/** How often the ledger panel re-reads. Fast enough to feel live in a demo. */
const POLL_MS = 3_000;

export const App = (): JSX.Element => {
  const [deployment, setDeployment] = useState<Deployment>();
  const [reader, setReader] = useState<Reader>();
  const [snapshot, setSnapshot] = useState<UiSnapshot>();
  const [agentReady, setAgentReady] = useState(false);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  // Which register are we reading?
  useEffect(() => {
    loadDeployment()
      .then((record) => {
        setDeployment(record);
        setReader(readerFor(record));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Is the local reporter agent up? Reporting needs it; checking does not, so
  // a missing agent degrades the page rather than breaking it.
  useEffect(() => {
    let cancelled = false;
    const probe = (): void => {
      agentStatus()
        .then(() => {
          if (!cancelled) setAgentReady(true);
        })
        .catch(() => {
          if (!cancelled) setAgentReady(false);
        });
    };
    probe();
    const timer = setInterval(probe, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Poll the public ledger.
  useEffect(() => {
    if (reader === undefined) {
      return;
    }
    let cancelled = false;
    const read = (): void => {
      reader
        .snapshot()
        .then((next) => {
          if (!cancelled) {
            setSnapshot(next);
            setError(undefined);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [reader, revision]);

  const onReported = useCallback(() => setRevision((r) => r + 1), []);

  return (
    <main>
      <header>
        <div className="brand">
          {/* Three bars at three heights: one report, two, threshold. */}
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <h1>Chorus</h1>
        </div>
        <p className="tagline">
          A scam report that nobody can read until someone else independently makes the same one.
        </p>

        <div className="pills">
          <span className="pill">
            network <b>{deployment?.network ?? '…'}</b>
          </span>
          <span className="pill">
            threshold <b>{snapshot?.threshold ?? '…'}</b>
          </span>
          <span className="pill">
            reports <b>{snapshot?.totalReports ?? '…'}</b>
          </span>
          <span className={agentReady ? 'pill live' : 'pill off'}>
            reporter agent <b>{agentReady ? 'connected' : 'offline'}</b>
          </span>
        </div>

        {reader?.simulated === true && (
          <p className="warn">
            <b>SIMULATED MODE</b> — the compiled circuits run in process. Derivations, the duplicate rejection
            and the threshold are all real; there is no proof, no transaction and no chain.
          </p>
        )}
        {!agentReady && (
          <p className="warn">
            Reporter agent not reachable — Check and the ledger still work, but reporting needs the agent
            (<code>npm run agent</code>).
          </p>
        )}
      </header>

      <div className="columns">
        <Report agentReady={agentReady} threshold={snapshot?.threshold} onReported={onReported} />
        <Check reader={reader} revision={revision} />
      </div>

      <LedgerPanel
        snapshot={snapshot}
        network={deployment?.network ?? '…'}
        contractAddress={deployment?.contractAddress ?? '…'}
        error={error}
      />
    </main>
  );
};
