import { brief, refreshBrief, event, latest, report, submit } from '../core/engine';
import type { Attempt, Mission, Scope } from '../core/types';
export class SimulationAdapter {
  step(m: Mission, a: Attempt, now = Date.now()) {
    if (m.mode !== 'simulation' || a.mode !== 'simulation') throw new Error('Mode mismatch');
    if (Date.parse(a.dueAt) > now || ['completed', 'failed', 'uncertain'].includes(a.status))
      return;
    const t = m.tasks.find((t) => t.id === a.taskId)!;
    const scope: Scope = {
      role: 'phone',
      missionId: m.id,
      ownerId: m.ownerId,
      taskId: t.id,
      attemptId: a.id,
      expires: now + 60000,
    };
    if (a.phase === 0) {
      a.status = 'in-progress';
      a.phase = 1;
      event(m, 'simulation.connected', `${t.title}: simulated conversation started.`, a.id);
    } else if (a.phase === 1) {
      const b = refreshBrief(m, t, a);
      report(
        m,
        scope,
        `brief-read-r${m.revision}`,
        `Simulation agent refreshed revision ${m.revision}. ${b.sharedEvidence.some((x) => x.terms) ? 'Evidence from other conversations is now in this brief.' : 'Collecting initial terms.'}`,
      );
      a.phase = 2;
    } else if (a.phase === 2) {
      const b = refreshBrief(m, t, a);
      const options = m.responses[t.kind] || [];
      if (!options.length) {
        report(m, scope, 'declined', 'The simulated business declined; no terms available.');
        t.state = 'blocked';
        a.status = 'completed';
        event(
          m,
          'simulation.declined',
          `${t.title}: no acceptable business offer is available.`,
          a.id,
        );
        return;
      }
      const target = b.maxPriceMinor;
      const previous = latest(m, t.id);
      const fits = options.filter(
        (o) =>
          o.priceMinor <= target &&
          (!o.capacity || o.capacity >= m.constraints.quantity) &&
          (t.kind !== 'venue' ||
            !b.latestAccessAt ||
            (!!o.readyAt && Date.parse(o.readyAt) <= Date.parse(b.latestAccessAt))),
      );
      const choice = fits[0] || options[Math.min(t.rounds - 1, options.length - 1)];
      submit(m, scope, `terms-r${m.revision}`, m.revision, choice);
      if (
        previous &&
        choice.priceMinor === previous.priceMinor &&
        choice.readyAt === previous.readyAt
      )
        report(m, scope, 'no-change', 'Business cannot improve its current terms.');
      a.phase = 3;
    } else if (a.revision !== m.revision) {
      // A revision may arrive between collecting terms and ending the conversation.
      // Keep this attempt alive and refresh instead of finalizing stale terms.
      a.phase = 1;
      event(
        m,
        'simulation.refresh-needed',
        'Mission changed before the conversation ended; refreshing terms.',
        a.id,
      );
    } else {
      a.status = 'completed';
      t.state = latest(m, t.id) ? 'complete' : 'blocked';
      event(m, 'simulation.completed', `${t.title}: simulated terms received.`, a.id);
    }
    a.updatedAt = new Date(now).toISOString();
    a.dueAt = new Date(now + 1800).toISOString();
  }
}
