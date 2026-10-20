'use client';
import { ArrowUpRight, Check, Clock, FileText } from 'lucide-react';
import type { Mission } from '../core/types';
import { callOutcome, currentOffer, formatMoney } from '../core/presentation';

export default function QuoteLedger({
  mission: m,
  onEvidence,
}: {
  mission: Mission;
  onEvidence: () => void;
}) {
  const rows = m.tasks.map((task) => ({
    task,
    contact: m.contacts.find((c) => c.id === task.contactId),
    offer: currentOffer(m, task.id),
    attempt: [...m.attempts]
      .reverse()
      .find((a) => a.taskId === task.id && a.revision === m.revision),
  }));
  const confirmed = rows.filter((r) => r.offer?.confirmation === 'confirmed').length;
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: m.constraints.timezone,
    }).format(new Date(value));
  return (
    <section className="quote-ledger panel" id="quotes" aria-labelledby="quotes-title">
      <div className="panel-header">
        <div>
          <span className="eyebrow">THE DETAILS THAT MAKE THE PLAN</span>
          <h2 id="quotes-title">Quotes & readiness</h2>
        </div>
        <button className="text-button" onClick={onEvidence}>
          <FileText size={14} /> View sources <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="quote-ledger-meta">
        <span>
          {confirmed} of {rows.length} confirmed
        </span>
        <span>
          Revision {m.revision} ·{' '}
          {m.mode === 'simulation' ? 'Simulated terms' : 'Actual call evidence'}
        </span>
      </div>
      <table aria-label="Current quote comparison">
        <thead>
          <tr>
            <th scope="col">Research task</th>
            <th scope="col">Total quote</th>
            <th scope="col">Ready / access</th>
            <th scope="col">Setup time</th>
            <th scope="col">Confirmation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, contact, offer, attempt }) => (
            <tr key={task.id}>
              <th scope="row">
                <strong>{contact?.name || task.title}</strong>
                <span className="quote-task-kind">{task.kind}</span>
                <small>
                  {offer
                    ? `Source attempt ${offer.attemptId.slice(0, 8)}`
                    : attempt
                      ? callOutcome(attempt).replaceAll('-', ' ')
                      : 'Research not started'}
                </small>
              </th>
              <td data-label="Total quote" className="quote-amount">
                {offer ? (
                  formatMoney(offer.priceMinor)
                ) : (
                  <span className="quote-unknown">Not received</span>
                )}
              </td>
              <td data-label="Ready / access">
                {offer?.readyAt ? (
                  <>
                    <span>{date(offer.readyAt)}</span>
                    <small>{m.constraints.timezone}</small>
                  </>
                ) : (
                  <span className="quote-unknown">
                    {['caterer'].includes(task.kind) ? 'See setup duration' : 'Not supplied'}
                  </span>
                )}
              </td>
              <td data-label="Setup time">
                {['delivery', 'caterer'].includes(task.kind) ? (
                  offer?.setupMinutes === undefined ? (
                    <span className="quote-unknown">Not supplied</span>
                  ) : (
                    `${offer.setupMinutes} min`
                  )
                ) : (
                  <span className="quote-unknown">Not required</span>
                )}
              </td>
              <td data-label="Confirmation">
                <span className={`quote-confirmation ${offer?.confirmation || 'missing'}`}>
                  {offer?.confirmation === 'confirmed' ? <Check size={13} /> : <Clock size={13} />}
                  {offer?.confirmation === 'confirmed'
                    ? 'Confirmed'
                    : offer
                      ? 'Needs confirmation'
                      : 'Awaiting quote'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="quote-ledger-note">
        {rows.some((r) => r.offer)
          ? 'Only current, confirmed terms support the plan. Review timing and capacity checks before approving.'
          : 'Quotes appear here when research saves actual terms. A completed conversation alone is not a confirmed quote.'}
      </p>
    </section>
  );
}
