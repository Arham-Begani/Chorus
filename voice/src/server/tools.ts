import { z } from 'zod';
import {
  assertScope,
  refreshBrief,
  event,
  evaluate,
  report,
  requestApproval,
  researchApproved,
  revise,
  submit,
} from '../core/engine';
import { constraintsSchema, termsSchema, type Mission, type Scope } from '../core/types';
import { publicMission } from './db';
import { phoneConversation, phoneProgressKey } from '../core/phone-conversation';
import { decodePhoneQuote } from '../core/phone-quote';
const phoneAllowed = [
  'get_mission_brief',
  'report_observation',
  'submit_offer',
  'request_clarification',
];
const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const toolInput = z
  .object({
    token: z.string().max(10000),
    key: z.string().min(1).max(150).optional(),
    revision: z.coerce.number().int().optional(),
    text: z.string().max(2000).optional(),
    reason: z.string().max(1000).optional(),
    constraints: constraintsSchema.optional(),
    terms: termsSchema.optional(),
    kind: z.enum(['research', 'plan']).optional(),
    goal: z.string().max(3000).optional(),
    title: z.string().max(120).optional(),
  })
  .strict();
export function executeTool(m: Mission, scope: Scope, name: string, input: unknown) {
  assertScope(m, scope);
  if (scope.role === 'phone' && !phoneAllowed.includes(name))
    throw new Error('This phone agent cannot change constraints, approvals or permissions');
  const task = m.tasks.find((t) => t.id === scope.taskId);
  const attempt = m.attempts.find((a) => a.id === scope.attemptId);
  if (scope.role === 'phone' && attempt?.phoneEndReason)
    return { ok: false, conversation: phoneConversation(m, task!, attempt) };
  const data = toolInput.parse(input);
  if (name === 'get_mission_brief') {
    if (scope.role !== 'phone') return publicMission(m);
    const a = attempt!;
    const progress = phoneProgressKey(m, task!);
    a.unchangedBriefReads = a.phoneProgressKey === progress ? (a.unchangedBriefReads || 0) + 1 : 1;
    a.phoneProgressKey = progress;
    a.briefReadCount = (a.briefReadCount || 0) + 1;
    if (a.unchangedBriefReads >= 4) {
      a.phoneEndReason = 'repeated-brief-reads';
      event(
        m,
        'call.conversation-stopped',
        'Repeated unchanged brief reads reached the conversation limit. The phone agent was instructed to end politely.',
        a.id,
      );
    }
    return { ...refreshBrief(m, task!, a), conversation: phoneConversation(m, task!, a) };
  }
  const key = z.string().min(1).parse(data.key);
  const dedup = `${scope.attemptId || 'conductor'}:${name}:${key}`;
  const duplicate = m.processedKeys.includes(dedup);
  if (duplicate && name !== 'submit_offer')
    return {
      ok: true,
      duplicate: true,
      revision: m.revision,
      ...(attempt && task ? { conversation: phoneConversation(m, task, attempt) } : {}),
    };
  switch (name) {
    case 'report_observation': {
      const text = z.string().min(1).parse(data.text);
      if (
        m.observations.some(
          (o) => o.attemptId === scope.attemptId && normalized(o.text) === normalized(text),
        )
      ) {
        m.processedKeys.push(dedup);
        return {
          ok: true,
          duplicate: true,
          revision: m.revision,
          ...(attempt && task ? { conversation: phoneConversation(m, task, attempt) } : {}),
        };
      }
      report(m, scope, key, text);
      break;
    }
    case 'submit_offer':
      submit(m, scope, key, z.number().int().parse(data.revision), data.terms);
      if (duplicate)
        return {
          ok: true,
          duplicate: true,
          revision: m.revision,
          ...(attempt && task ? { conversation: phoneConversation(m, task, attempt) } : {}),
        };
      break;
    case 'request_clarification': {
      const text = z.string().min(1).parse(data.text);
      m.conflicts.push({
        id: `clarification:${scope.attemptId || 'conductor'}:${key}`,
        kind: 'clarification',
        taskId: task?.id,
        message: text,
      });
      event(m, 'clarification.requested', text, scope.attemptId);
      if (attempt) attempt.phoneEndReason = 'owner-clarification';
      break;
    }
    case 'propose_mission':
      if (m.status !== 'draft')
        throw new Error('Mission already started; revise constraints instead');
      if (data.title) m.title = data.title;
      if (data.goal) m.goal = data.goal;
      if (data.constraints) revise(m, data.constraints, 'Spoken mission proposal');
      requestApproval(m, 'research');
      break;
    case 'request_approval':
      if (data.kind === 'plan' && !evaluate(m).feasible) throw new Error('Plan is not feasible');
      requestApproval(m, data.kind || 'research');
      break;
    case 'update_mission_constraints':
      revise(
        m,
        constraintsSchema.parse(data.constraints),
        data.reason || 'User revised constraints through the browser conductor',
      );
      break;
    case 'initiate_approved_work':
      if (m.status === 'paused' || !researchApproved(m))
        throw new Error('Current research approval required');
      m.status = 'running';
      event(m, 'mission.started', 'Approved research work queued by conductor.');
      break;
    default:
      throw new Error('Unknown tool');
  }
  m.processedKeys.push(dedup);
  if (scope.role === 'phone') {
    attempt!.phoneToolFailures = 0;
    return {
      ok: true,
      revision: m.revision,
      conversation: phoneConversation(m, task!, attempt!),
    };
  }
  return {
    ok: true,
    revision: m.revision,
    paused: m.status === 'paused',
    plan: m.plan,
    conflicts: m.conflicts,
  };
}

// Provider tool errors need one actionable repair path, not another opaque check.
// Scope/role violations stay outside this recovery path and retain HTTP errors.
export function executeToolRequest(m: Mission, scope: Scope, name: string, raw: unknown) {
  assertScope(m, scope);
  if (scope.role === 'phone' && !phoneAllowed.includes(name))
    throw new Error('This phone agent cannot change constraints, approvals or permissions');
  if (scope.role === 'phone') {
    const a = m.attempts.find((a) => a.id === scope.attemptId)!;
    if (a.phoneEndReason)
      return {
        ok: false,
        conversation: phoneConversation(m, m.tasks.find((t) => t.id === scope.taskId)!, a),
      };
  }
  try {
    const envelope = z.record(z.string(), z.unknown()).parse(raw);
    const nativeQuote =
      scope.role === 'phone' &&
      name === 'submit_offer' &&
      envelope.payload_json === undefined &&
      envelope.terms === undefined;
    if (
      scope.role === 'phone' &&
      name === 'submit_offer' &&
      envelope.payload_json !== undefined &&
      ['price_inr', 'ready_at', 'setup_minutes', 'description', 'confirmation'].some(
        (k) => k in envelope,
      )
    )
      throw new z.ZodError([
        { code: 'custom', path: ['price_inr'], message: 'Use a single quote format.' },
      ]);
    const suppliedKey = typeof envelope.key === 'string' ? envelope.key.trim() : undefined;
    const operation =
      nativeQuote && suppliedKey
        ? m.attempts
            .find((a) => a.id === scope.attemptId)
            ?.quoteOperations?.find((o) => o.key === suppliedKey)
        : undefined;
    const previous =
      (operation?.offerId
        ? m.offers.find((o) => o.id === operation.offerId && o.attemptId === scope.attemptId)
        : undefined) ||
      [...m.offers]
        .reverse()
        .find(
          (o) =>
            o.attemptId === scope.attemptId && o.revision === m.revision && !o.stale && !o.declined,
        );
    const input = nativeQuote
      ? decodePhoneQuote(envelope, previous)
      : envelope.payload_json === undefined
        ? envelope
        : {
            ...z
              .record(z.string(), z.unknown())
              .parse(JSON.parse(z.string().max(16000).parse(envelope.payload_json))),
            token: envelope.token,
          };
    return executeTool(m, scope, name, input);
  } catch (error) {
    const stale = error instanceof Error && /^(Stale revision|Brief changed)/.test(error.message);
    const keyConflict = error instanceof Error && /^Operation key already used/.test(error.message);
    if (
      scope.role !== 'phone' ||
      !(error instanceof z.ZodError || error instanceof SyntaxError || stale || keyConflict)
    )
      throw error;
    const a = m.attempts.find((a) => a.id === scope.attemptId)!;
    const t = m.tasks.find((t) => t.id === scope.taskId)!;
    a.phoneToolFailures = (a.phoneToolFailures || 0) + 1;
    if (a.phoneToolFailures >= 2) a.phoneEndReason = 'repeated-tool-errors';
    event(
      m,
      'call.tool-rejected',
      stale
        ? 'Phone terms used an outdated brief; refresh once before correcting the offer.'
        : keyConflict
          ? 'Changed phone quote terms reused an operation key; a fresh key is required without asking for the answers again.'
          : 'Phone tool arguments were invalid; one correction is allowed before a polite stop.',
      a.id,
    );
    const conversation = phoneConversation(m, t, a);
    const names: Record<string, string> = {
      key: 'key',
      revision: 'revision',
      text: 'text',
      price_inr: 'price_inr',
      priceMinor: 'price_inr',
      description: 'description',
      confirmation: 'confirmation',
      ready_at: 'ready_at',
      readyAt: 'ready_at',
      setup_minutes: 'setup_minutes',
      setupMinutes: 'setup_minutes',
      capacity: 'capacity',
    };
    const fields = keyConflict
      ? ['key']
      : error instanceof z.ZodError
        ? [
            ...new Set(
              error.issues.map((issue) => names[String(issue.path.at(-1))]).filter(Boolean),
            ),
          ]
        : [];
    return {
      ok: false,
      error: {
        code: stale ? 'refresh_required' : keyConflict ? 'new_operation_key' : 'invalid_arguments',
        fields,
        message: stale
          ? 'Refresh get_mission_brief once and use its current revision before resubmitting actual terms.'
          : keyConflict
            ? 'Use a fresh key for corrected or newly confirmed terms. Refresh the brief once, then save using the answers and confirmation already given.'
            : fields.includes('price_inr')
              ? 'Use price_inr as the actual INR rupee total with at most two decimal places, for example 1500.50. Do not multiply by 100 or ask the participant to repeat the price.'
              : 'Use the documented tool arguments. Correct the format once without asking the participant to repeat facts or supply JSON.',
      },
      conversation:
        conversation.action === 'end'
          ? conversation
          : {
              ...conversation,
              phase: 'repair',
              instruction: stale
                ? 'Refresh the brief once, then correct the offer silently using its current revision and the participant’s existing answers.'
                : keyConflict
                  ? 'Generate a fresh operation key, refresh the brief once, and save the corrected or confirmed terms using existing answers. Do not ask for confirmation again.'
                  : 'Correct the tool format once using the existing answers. Do not ask another business question, restart the introduction or ask the participant to repair JSON.',
            },
    };
  }
}
