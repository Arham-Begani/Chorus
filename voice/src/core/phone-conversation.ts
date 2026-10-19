import type { Attempt, Mission, Task } from './types';

export function phoneProgressKey(m: Mission, t: Task) {
  return JSON.stringify({
    revision: m.revision,
    goal: m.goal,
    question: t.question,
    offers: m.offers.filter((o) => !o.stale && !o.declined).map((o) => o.id),
    facts: m.observations.map((o) => o.id),
  });
}

export function phoneConversation(m: Mission, t: Task, a: Attempt) {
  const recordedFacts = m.observations.filter((o) => o.attemptId === a.id).map((o) => o.text);
  const ownConflicts = m.conflicts.filter((c) => c.taskId === t.id || c.kind === 'budget');
  const terms = [...m.offers].reverse().find((o) => o.taskId === t.id && !o.stale && !o.declined);
  const stop = (reason: string, instruction: string) => ({
    action: 'end' as const,
    phase: 'end' as const,
    reason,
    instruction,
    recordedFacts,
  });
  if (m.status === 'paused')
    return stop(
      'paused',
      'The owner paused research. Say a short goodbye; do not ask more questions.',
    );
  if (a.phoneEndReason)
    return stop(
      a.phoneEndReason,
      a.phoneEndReason === 'owner-clarification'
        ? 'The missing detail was sent to the owner. Explain that once and say goodbye. Do not promise a callback.'
        : 'The call is not making progress. Apologize once and say goodbye. Do not call another tool or repeat the question.',
    );
  if (terms && terms.confirmation === 'confirmed' && ownConflicts.length === 0)
    return stop(
      'task-complete',
      'Your assigned terms are recorded and confirmed. Thank the participant and end. Other tasks belong to other calls.',
    );
  const phase =
    a.briefReadCount === 1 && recordedFacts.length === 0 && !terms
      ? 'introduce'
      : terms && ownConflicts.every((c) => c.kind === 'confirmation')
        ? 'confirm'
        : 'collect';
  return {
    action: 'continue' as const,
    phase,
    instruction:
      (a.unchangedBriefReads || 0) >= 2
        ? 'The brief has not changed. Answer the participant directly using this result. Do not fetch it again for identity questions or greetings. Ask one relevant question at a time.'
        : phase === 'introduce'
          ? 'Explain the request from goal and taskKind once, then ask one relevant question.'
          : phase === 'confirm'
            ? 'If not yet confirmed, summarize the supplied terms once and ask whether that summary is correct. If the participant already confirmed, save the confirmed terms now without asking again. Do not restart the introduction.'
            : 'Use the recorded facts and latest answer. Save the quote when the answers are complete; otherwise ask only a genuinely missing detail. Do not restart the introduction or repeat answered questions.',
    recordedFacts,
    terms,
    unresolved: ownConflicts.map((c) => c.message),
    briefReads: a.briefReadCount || 0,
  };
}
