'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Phone, RefreshCw } from 'lucide-react';
import { requestJSON } from '../client/api';
import { formatMoney } from '../core/presentation';
type Snapshot = {
  enabled: boolean;
  checks: { name: string; ok: boolean }[];
  outboundConcurrency: number;
  withinCallingHours: boolean;
  policy: {
    state: string;
    startAt: string | null;
    endAt: string | null;
    budgetMinor: number;
    reservedMinor: number;
    remainingMinor: number;
    sessions: number;
    phoneReserveMinor: number;
    browserReserveMinor: number;
  };
};
const groups = [
  {
    title: 'Account connections',
    keys: [
      'Supabase URL',
      'Supabase low-privilege key',
      'Supabase authentication',
      'Bolna API key',
      'Bolna agent IDs',
    ],
    detail: 'Your operator account and two voice agents.',
  },
  {
    title: 'Consenting participants',
    keys: ['authorized participants'],
    detail: 'Only privately allowlisted numbers can receive calls.',
  },
  {
    title: 'Protected callbacks',
    keys: ['callback secrets', 'HTTPS callbacks'],
    detail:
      'Separate secrets protect tools and call updates. Online reachability is checked separately before dialing.',
  },
  {
    title: 'Provider limits',
    keys: ['concurrency', 'call limits and reserve', 'provider limits reviewed'],
    detail: 'Bounded duration, disabled retries, capacity and conservative cost reserves.',
  },
  {
    title: 'Test authorization',
    keys: ['calling window', 'dated test authorization'],
    detail: 'A dated calling window and a total budget covering phone and browser sessions.',
  },
];
export default function CallReadiness() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSnapshot(await requestJSON<Snapshot>('live-readiness'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const passed = (keys: string[]) =>
    keys.every((key) => snapshot?.checks.find((c) => c.name === key)?.ok);
  return (
    <div className="call-readiness">
      <div className="call-readiness-intro">
        <span className="node-icon">
          <Phone size={20} />
        </span>
        <div>
          <strong>
            {snapshot?.enabled
              ? 'Live calling is enabled'
              : 'Simulation is ready. Live calling is off.'}
          </strong>
          <p>
            Finish these once for a real-call rehearsal. You can keep using every simulation and
            typed command now.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!snapshot && loading && <p role="status">Checking call setup…</p>}
      {snapshot && (
        <>
          <ol className="readiness-checks">
            {groups.map((group) => (
              <li key={group.title}>
                <span
                  className={`readiness-mark ${passed(group.keys) ? 'done' : ''}`}
                  aria-label={passed(group.keys) ? 'Ready' : 'Needs setup'}
                >
                  {passed(group.keys) ? <Check size={16} /> : <Clock size={16} />}
                </span>
                <div>
                  <strong>{group.title}</strong>
                  <p>{group.detail}</p>
                </div>
                <span className="caption">{passed(group.keys) ? 'Ready' : 'Pending'}</span>
              </li>
            ))}
          </ol>
          <div className="readiness-budget">
            <div>
              <span className="caption">TOTAL TEST BUDGET</span>
              <strong>
                {snapshot.policy.budgetMinor
                  ? formatMoney(snapshot.policy.budgetMinor)
                  : 'Awaiting authorization'}
              </strong>
            </div>
            <div>
              <span className="caption">RESERVED</span>
              <strong>{formatMoney(snapshot.policy.reservedMinor)}</strong>
            </div>
            <div>
              <span className="caption">REMAINING</span>
              <strong>{formatMoney(snapshot.policy.remainingMinor)}</strong>
            </div>
          </div>
          {snapshot.policy.endAt && (
            <p className="readiness-note">
              Authorization {snapshot.policy.state} · expires{' '}
              {new Date(snapshot.policy.endAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              . {snapshot.outboundConcurrency} outbound{' '}
              {snapshot.outboundConcurrency === 1 ? 'line' : 'lines'} available beside the
              conductor.
            </p>
          )}
          <p className="readiness-note">
            Every paid attempt reserves its worst-case allowance before contacting Bolna. Uncertain
            requests keep their reserve. Explicit pre-call rejections and finalized zero-cost
            outcomes release unused allowance with an audit record; provider invoices determine
            actual charges. This panel does not place a call.
          </p>
        </>
      )}
      <div className="readiness-footer">
        <span className="caption">Numbers and credentials stay private.</span>
        <button className="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} />
          {loading ? 'Checking…' : 'Refresh setup'}
        </button>
      </div>
    </div>
  );
}
