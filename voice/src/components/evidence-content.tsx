'use client';
import { useState } from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import type { Mission } from '../core/types';
import { callOutcome, formatMoney } from '../core/presentation';
export type EvidenceFilter = 'all' | 'quotes' | 'facts' | 'calls';

export default function EvidenceContent({
  mission: m,
  initialFilter = 'all',
}: {
  mission: Mission | null;
  initialFilter?: EvidenceFilter;
}) {
  const [filter, setFilter] = useState<EvidenceFilter>(initialFilter);
  const facts = m?.observations || [],
    quotes = m?.offers || [],
    calls = m?.attempts.filter((a) => a.mode === 'real') || [];
  const count =
    filter === 'all'
      ? facts.length + quotes.length + calls.length
      : filter === 'quotes'
        ? quotes.length
        : filter === 'facts'
          ? facts.length
          : calls.length;
  const displayTime = (iso: string) =>
    new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: m?.constraints.timezone || 'Asia/Kolkata',
    }).format(new Date(iso));
  const supplier = (taskId: string) => {
    const task = m?.tasks.find((t) => t.id === taskId);
    return (
      m?.contacts.find((c) => c.id === task?.contactId)?.name || task?.title || 'Research task'
    );
  };
  return (
    <div className="evidence-content">
      <p className="caption">
        Review the source before the decision. Earlier revisions stay visible as history; simulation
        stays labelled.
      </p>
      <div className="evidence-filters" role="group" aria-label="Evidence type">
        {(['all', 'quotes', 'facts', 'calls'] as const).map((key) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {{ all: 'All', quotes: 'Quotes', facts: 'Facts', calls: 'Calls' }[key]}
            <span>
              {key === 'all'
                ? facts.length + quotes.length + calls.length
                : key === 'quotes'
                  ? quotes.length
                  : key === 'facts'
                    ? facts.length
                    : calls.length}
            </span>
          </button>
        ))}
      </div>
      {count === 0 && (
        <div className="evidence-empty">
          <FileText size={24} />
          <h3>
            {filter === 'calls'
              ? 'No phone call evidence'
              : filter === 'quotes'
                ? 'No quotes saved yet'
                : filter === 'facts'
                  ? 'No business facts saved yet'
                  : 'Your evidence starts here'}
          </h3>
          <p>
            {filter === 'calls' && m?.mode === 'simulation'
              ? 'This mission runs in simulation. It places no phone calls.'
              : 'Research will save sourced facts and terms here. Missing information stays unknown.'}
          </p>
        </div>
      )}
      {(filter === 'all' || filter === 'facts') &&
        facts
          .slice()
          .reverse()
          .map((o) => (
            <article className="evidence-item" key={o.id}>
              <span className="subtle-badge">
                Fact · {o.mode} · {o.confirmation} · rev {o.revision}
              </span>
              <h3>{supplier(o.taskId)}</h3>
              <p>{o.text}</p>
              <code>Attempt {o.attemptId.slice(0, 8)}</code>
            </article>
          ))}
      {(filter === 'all' || filter === 'quotes') &&
        quotes
          .slice()
          .reverse()
          .map((o) => (
            <article className={`evidence-item ${o.stale ? 'stale' : ''}`} key={o.id}>
              <span className="subtle-badge">
                {o.mode} · {o.stale ? 'historical' : o.declined ? 'declined' : o.confirmation} · rev{' '}
                {o.revision}
              </span>
              <h3>
                {formatMoney(o.priceMinor)} · {supplier(o.taskId)}
              </h3>
              <p>{o.description}</p>
              <dl className="evidence-terms">
                <div>
                  <dt>Ready / access</dt>
                  <dd>{o.readyAt ? displayTime(o.readyAt) : 'Not supplied'}</dd>
                </div>
                <div>
                  <dt>Setup</dt>
                  <dd>{o.setupMinutes === undefined ? 'Not supplied' : `${o.setupMinutes} min`}</dd>
                </div>
                {o.capacity !== undefined && (
                  <div>
                    <dt>Capacity</dt>
                    <dd>{o.capacity}</dd>
                  </div>
                )}
              </dl>
              <code>Attempt {o.attemptId.slice(0, 8)}</code>
            </article>
          ))}
      {(filter === 'all' || filter === 'calls') &&
        calls
          .slice()
          .reverse()
          .map((a) => (
            <article className="evidence-item" key={a.id}>
              <span className="subtle-badge">
                Phone call · {callOutcome(a)} · rev {a.revision}
              </span>
              <h3>{supplier(a.taskId)}</h3>
              <p>
                {a.providerDurationSeconds === undefined
                  ? 'Duration pending'
                  : `${a.providerDurationSeconds}s duration`}
                {a.providerCostCents === undefined
                  ? ''
                  : ` · $${(a.providerCostCents / 100).toFixed(2)} USD reported`}
                {!a.providerBillingSettled ? ' · billing pending' : ''}
              </p>
              {a.transcript ? (
                <details className="evidence-transcript">
                  <summary>Read transcript</summary>
                  <p className="transcript">{a.transcript}</p>
                </details>
              ) : (
                <p className="caption">No transcript supplied by the provider.</p>
              )}
              {a.recordingUrl && (
                <a href={a.recordingUrl} target="_blank" rel="noreferrer">
                  Open actual recording <ArrowUpRight size={12} />
                </a>
              )}
              <code>Attempt {a.id.slice(0, 8)}</code>
            </article>
          ))}
      {filter === 'all' && (
        <>
          <h3 className="ledger-heading">Event ledger</h3>
          {m?.events
            .slice()
            .reverse()
            .map((e) => (
              <div className="ledger-event" key={e.id}>
                <span>
                  {e.mode} · rev {e.revision} · {displayTime(e.at)}
                </span>
                <p>{e.message}</p>
                <code>{e.type}</code>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
