import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { conductorIntent, missionSummary } from '../core/conductor';
import { createMission, defaultConstraints } from '../core/fixtures';
import { event, evaluate, requestApproval, researchApproved, revise } from '../core/engine';
import { activeStatuses, type Mission } from '../core/types';
import { getMission, insert, mutate, publicMission } from './db';
import { config } from './config';
const inputSchema = z
  .object({
    key: z.uuid(),
    text: z.string().trim().min(1).max(3000),
    source: z.enum(['voice', 'text']),
    missionId: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
  })
  .strict();
const help =
  'I can draft an event relocation or equipment-and-delivery mission, change its budget, guest count or deadline, read the current brief, pause, resume, request research, or retry a task. For example: “Our venue cancelled. Find a venue for 40 people tomorrow at 6 pm, under 12000 rupees.”';
export async function conduct(owner: string, raw: unknown) {
  const input = inputSchema.parse(raw);
  const current = input.missionId ? await getMission(input.missionId, owner) : null;
  const intent = conductorIntent(input.text, current, defaultConstraints());
  if (intent.kind === 'create') {
    // The owner-scoped digest gives repeated requests a stable ID without accepting arbitrary mission IDs.
    const h = createHmac('sha256', config.secret)
      .update(owner + '\0' + input.key)
      .digest('hex');
    const m = createMission(owner, intent.scenario, 'simulation', intent.constraints, intent.goal);
    m.id = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    event(m, 'conductor.' + input.source, input.text);
    event(m, 'mission.proposed', 'Simulation mission drafted by the browser conductor.');
    requestApproval(m, 'research');
    const message = `I drafted a simulation with ${m.tasks.map((t) => t.kind).join(', ')} tasks. ${missionSummary(m)} Review the contacts and authorize simulated research when ready. No telephone number is needed.`;
    event(m, 'conductor.reply', message);
    const saved = await insert(m);
    return {
      mission: publicMission(saved),
      message:
        saved === m ? message : 'This request already created a mission. ' + missionSummary(saved),
    };
  }
  if (!current) return { message: help, mission: null };
  return mutate(current.id, owner, (m) => {
    const key = 'browser-conductor:' + input.key;
    if (m.processedKeys.includes(key))
      return {
        mission: publicMission(m),
        message: 'That command was already processed. ' + missionSummary(m),
        duplicate: true,
      };
    if (input.revision !== m.revision)
      throw new Error(
        'The mission changed. Review the latest revision and send your command again.',
      );
    // Parse once more under the row lock so a concurrent revision can never overwrite current constraints.
    const command = conductorIntent(input.text, m, defaultConstraints());
    let message: string;
    switch (command.kind) {
      case 'revise':
        revise(m, command.constraints, input.text);
        message = `Updated ${command.changed.join(', ')} in revision ${m.revision}. Previous terms and approvals are stale. Review the new research card. Phone agents see changes on their next brief refresh.`;
        break;
      case 'pause':
        m.status = 'paused';
        event(
          m,
          'mission.paused',
          'Paused by the browser conductor; new dispatches and approvals are blocked.',
        );
        message =
          'Mission paused. No new research or plan approvals can start. An already active real call may finish.';
        break;
      case 'resume':
        m.status = m.approvals.some(
          (a) => a.kind === 'plan' && a.status === 'approved' && a.revision === m.revision,
        )
          ? 'approved'
          : 'running';
        evaluate(m);
        event(m, 'mission.resumed', 'Resumed by the browser conductor.');
        message = 'Mission resumed. ' + missionSummary(m);
        break;
      case 'research':
        if (m.status === 'paused')
          throw new Error('Resume the mission before requesting research.');
        if (researchApproved(m)) {
          if (m.tasks.some((t) => t.state === 'pending' || t.state === 'active')) {
            m.status = 'running';
            evaluate(m);
            event(m, 'mission.started', 'Approved research queued by the browser conductor.');
            message =
              'Your approved research is queued. The worker will coordinate the conversations.';
          } else {
            message = 'The current research has finished. ' + missionSummary(m);
          }
        } else {
          requestApproval(m, 'research', true);
          message =
            'Review the research approval card and contacts. ' +
            (m.mode === 'simulation'
              ? 'Authorize simulated research to begin; no telephone number is needed.'
              : 'Real calls still require authorized contacts and a separate call-cost approval.');
        }
        break;
      case 'retry': {
        const t = m.tasks.find((t) => t.kind === command.taskKind);
        if (!t) throw new Error('That task is not part of this mission.');
        if (
          m.status === 'paused' ||
          m.attempts.some((a) => a.taskId === t.id && activeStatuses.includes(a.status))
        )
          throw new Error(
            'Resume or resolve the active/uncertain attempt before retrying this task.',
          );
        t.state = 'pending';
        m.status = 'running';
        for (const a of m.approvals.filter((a) => a.kind === 'research' && a.status === 'approved'))
          a.status = 'stale';
        requestApproval(m, 'research', true);
        event(m, 'task.retry', `Owner requested another ${t.kind} research attempt.`);
        message = `Another ${t.kind} attempt is prepared. Review the new research approval card before it starts.`;
        break;
      }
      case 'approval':
        message =
          'Use the authenticated approval card to authorize research or approve a proposed plan. Spoken or typed commands never make purchases, reservations or cancellations.';
        break;
      case 'status':
        message = missionSummary(m);
        break;
      default:
        message = help;
    }
    event(m, 'conductor.' + input.source, input.text);
    event(m, 'conductor.reply', message);
    m.processedKeys.push(key);
    return { mission: publicMission(m), message };
  });
}
