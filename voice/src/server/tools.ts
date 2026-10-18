import { z } from 'zod';
import {
  assertScope,
  brief,
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
  const data = toolInput.parse(input);
  const task = m.tasks.find((t) => t.id === scope.taskId);
  if (name === 'get_mission_brief')
    return scope.role === 'phone'
      ? refreshBrief(m, task!, m.attempts.find((a) => a.id === scope.attemptId)!)
      : publicMission(m);
  const phoneAllowed = ['report_observation', 'submit_offer', 'request_clarification'];
  if (scope.role === 'phone' && !phoneAllowed.includes(name))
    throw new Error('This phone agent cannot change constraints, approvals or permissions');
  const key = z.string().min(1).parse(data.key);
  const dedup = `${scope.attemptId || 'conductor'}:${name}:${key}`;
  if (m.processedKeys.includes(dedup)) return { duplicate: true, revision: m.revision };
  switch (name) {
    case 'report_observation':
      report(m, scope, key, z.string().min(1).parse(data.text));
      break;
    case 'submit_offer':
      submit(m, scope, key, z.number().int().parse(data.revision), data.terms);
      break;
    case 'request_clarification': {
      const text = z.string().min(1).parse(data.text);
      m.conflicts.push({
        id: `clarification:${key}`,
        kind: 'clarification',
        taskId: task?.id,
        message: text,
      });
      event(m, 'clarification.requested', text, scope.attemptId);
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
  return {
    ok: true,
    revision: m.revision,
    paused: m.status === 'paused',
    plan: m.plan,
    conflicts: m.conflicts,
  };
}
