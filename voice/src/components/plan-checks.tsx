'use client';
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock, FileText } from 'lucide-react';
import type { Mission } from '../core/types';
import { assessPlan } from '../core/plan-assessment';

export default function PlanChecks({
  mission: m,
  onEvidence,
}: {
  mission: Mission;
  onEvidence: () => void;
}) {
  const assessment = assessPlan(m);
  const passed = assessment.checks.filter((check) => check.status === 'pass').length;
  const deadline = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: m.constraints.timezone,
  }).format(new Date(m.constraints.eventStart));
  return (
    <section className="plan-checks panel" id="plan-checks" aria-labelledby="plan-checks-title">
      <div className="panel-header">
        <div>
          <span className="eyebrow">THE REASONING BEHIND THE DECISION</span>
          <h2 id="plan-checks-title">Plan checks</h2>
        </div>
        <button className="text-button" onClick={onEvidence}>
          <FileText size={14} /> Check sources <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="plan-checks-context">
        <strong>
          {passed} of {assessment.checks.length} checks pass
        </strong>
        <span>
          Revision {m.revision} · {m.mode === 'simulation' ? 'Simulated evidence' : 'Call evidence'}
        </span>
        <span>
          Start: {deadline} ({m.constraints.timezone})
        </span>
      </div>
      <dl className="plan-checks-list">
        {assessment.checks.map((check) => {
          const Icon =
            check.status === 'pass' ? CheckCircle2 : check.status === 'fail' ? AlertCircle : Clock;
          return (
            <div className="plan-check-row" key={check.id}>
              <dt>
                <span className={`plan-check-status ${check.status}`}>
                  <Icon size={16} aria-hidden="true" />
                  {check.status === 'pass'
                    ? 'Pass'
                    : check.status === 'fail'
                      ? 'Needs attention'
                      : 'Needs evidence'}
                </span>
                <strong>{check.label}</strong>
              </dt>
              <dd>
                {check.details.map((detail, index) => (
                  <p key={index}>{detail}</p>
                ))}
                {check.attemptIds.length > 0 && (
                  <small>
                    Source attempts {check.attemptIds.map((id) => id.slice(0, 8)).join(', ')}
                  </small>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="plan-checks-note">
        {assessment.feasible
          ? 'The current terms fit. Review the sources before approving; passing checks does not book or pay.'
          : 'Missing, unconfirmed or conflicting terms keep the plan from approval. Earlier revisions cannot fill a gap.'}
      </p>
    </section>
  );
}
