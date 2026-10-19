import { describe, expect, it } from 'vitest';
import { createMission, defaultConstraints } from '../../src/core/fixtures';
import { reserve, revise } from '../../src/core/engine';
import { executeToolRequest } from '../../src/server/tools';
import { bolnaTools } from '../../src/providers/bolna-tools';
import type { Scope } from '../../src/core/types';
import { applyExecution } from '../../src/server/coordinator';

function call() {
  const m = createMission(
    'operator',
    'equipment',
    'real',
    defaultConstraints(),
    'CHORUS rehearsal: research a PA system and microphones for 40 people, including delivery.',
  );
  m.status = 'running';
  const a = reserve(m, m.tasks[1]);
  a.status = 'in-progress';
  const scope: Scope = {
    role: 'phone',
    ownerId: m.ownerId,
    missionId: m.id,
    taskId: a.taskId,
    attemptId: a.id,
    expires: Date.now() + 60000,
  };
  const invoke = (name: string, data: object = {}) =>
    executeToolRequest(m, scope, name, { ...data, token: 'server-verified-fixture' }) as any;
  return { m, a, scope, invoke };
}
describe('phone conversation recovery contracts (no model or calls)', () => {
  it('moves from one introduction to collection and confirmation without restarting the request', () => {
    const { m, invoke } = call();
    expect(invoke('get_mission_brief').conversation.phase).toBe('introduce');
    const fact = invoke('report_observation', {
      key: 'price',
      text: 'Delivery and installation total INR 1500, including fees.',
    });
    expect(fact.conversation.phase).toBe('collect');
    expect(fact.conversation.recordedFacts).toEqual([
      'Delivery and installation total INR 1500, including fees.',
    ]);
    invoke('get_mission_brief');
    const result = invoke('submit_offer', {
      payload_json: JSON.stringify({
        key: 'reported',
        revision: 1,
        terms: {
          priceMinor: 150000,
          currency: 'INR',
          description: 'Delivery and installation',
          confirmation: 'reported',
          readyAt: new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString(),
          setupMinutes: 30,
        },
      }),
    });
    expect(result.conversation.phase).toBe('confirm');
    expect(result.conversation.terms.confirmation).toBe('reported');
  });
  it('reads a scoped brief without pointless generated JSON or repeated spoken filler', () => {
    const tools = bolnaTools('phone', 'https://callbacks.example.test', 'fixture-secret');
    expect(tools.every((t) => t.pre_call_message === '')).toBe(true);
    const read = tools.find((t) => t.name === 'get_mission_brief')!;
    expect(read.parameters.required).toEqual([]);
    expect(read.value.param).toEqual({ token: '%(chorus_token)s' });
    const { invoke } = call();
    expect(invoke('get_mission_brief')).toMatchObject({
      taskKind: 'delivery',
      goal: expect.stringContaining('PA system'),
      conversation: { action: 'continue' },
    });
  });
  it('warns on unchanged reads and latches a polite stop after four, without endless state writes', () => {
    const { m, a, invoke } = call();
    invoke('get_mission_brief');
    expect(invoke('get_mission_brief').conversation.instruction).toContain(
      'Answer the participant directly',
    );
    invoke('get_mission_brief');
    expect(invoke('get_mission_brief').conversation).toMatchObject({
      action: 'end',
      reason: 'repeated-brief-reads',
    });
    expect(a.briefReadCount).toBe(4);
    const stopped = JSON.stringify(m);
    expect(
      invoke('report_observation', { key: 'late', text: 'More unsupported interaction' }).ok,
    ).toBe(false);
    invoke('get_mission_brief');
    expect(JSON.stringify(m)).toBe(stopped);
    expect(m.events.filter((e) => e.type === 'call.conversation-stopped')).toHaveLength(1);
  });
  it('new facts reset the read guard, but reworded operation IDs cannot fake progress', () => {
    const { m, a, invoke } = call();
    invoke('get_mission_brief');
    invoke('get_mission_brief');
    invoke('report_observation', {
      key: 'availability',
      text: 'Delivery is available on the requested date.',
    });
    expect(invoke('get_mission_brief').conversation.recordedFacts).toHaveLength(1);
    expect(a.unchangedBriefReads).toBe(1);
    expect(
      invoke('report_observation', {
        key: 'duplicate-key',
        text: ' delivery IS available on the requested date. ',
      }).duplicate,
    ).toBe(true);
    invoke('get_mission_brief');
    expect(a.unchangedBriefReads).toBe(2);
    expect(m.observations).toHaveLength(1);
  });
  it('a genuine owner revision refreshes the brief without confusing it with a repeated check', () => {
    const { m, a, invoke } = call();
    invoke('get_mission_brief');
    invoke('get_mission_brief');
    invoke('get_mission_brief');
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Owner lowered the budget');
    expect(invoke('get_mission_brief')).toMatchObject({
      revision: 2,
      constraints: { budgetMinor: 900000 },
      conversation: { action: 'continue' },
    });
    expect(a.unchangedBriefReads).toBe(1);
  });
  it('offers one repair for malformed arguments, then ends without echoing private data', () => {
    const { m, a, scope, invoke } = call();
    const raw = { token: 'private-token-fixture', payload_json: '{private-invalid-json' };
    const first = executeToolRequest(m, scope, 'submit_offer', raw) as any;
    expect(first).toMatchObject({
      ok: false,
      error: { code: 'invalid_arguments' },
      conversation: { action: 'continue', phase: 'repair' },
    });
    expect(JSON.stringify(first)).not.toContain('private-');
    const second = invoke('submit_offer', { payload_json: '[]' });
    expect(second.conversation).toMatchObject({ action: 'end', reason: 'repeated-tool-errors' });
    expect(a.phoneToolFailures).toBe(2);
    const stopped = JSON.stringify(m);
    invoke('submit_offer', { payload_json: '{' });
    expect(JSON.stringify(m)).toBe(stopped);
  });
  it('refreshes a stale quote once, then accepts actual terms without asking the participant to start again', () => {
    const { m, a, invoke } = call();
    invoke('get_mission_brief');
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Owner changed the limit');
    const terms = {
      priceMinor: 150000,
      currency: 'INR',
      description: 'Delivery and installation',
      confirmation: 'confirmed',
      readyAt: new Date(Date.parse(m.constraints.eventStart) - 3600000).toISOString(),
      setupMinutes: 30,
    };
    expect(
      invoke('submit_offer', { payload_json: JSON.stringify({ key: 'quote', revision: 1, terms }) })
        .error.code,
    ).toBe('refresh_required');
    invoke('get_mission_brief');
    const result = invoke('submit_offer', {
      payload_json: JSON.stringify({ key: 'quote', revision: 2, terms }),
    });
    expect(result).toMatchObject({
      ok: true,
      conversation: { action: 'end', reason: 'task-complete' },
    });
    expect(result).not.toHaveProperty('plan');
    expect(a.phoneToolFailures).toBe(0);
    expect(m.offers[0]).toMatchObject({ attemptId: a.id, revision: 2, priceMinor: 150000 });
    expect(m.plan.feasible).toBe(false); // Another task is still waiting for its own call.
  });
  it('sends a missing-detail request to the owner once and stops instead of promising callbacks', () => {
    const { m, invoke } = call();
    const result = invoke('request_clarification', {
      key: 'missing-service',
      text: 'Which equipment should be delivered?',
    });
    expect(result).toMatchObject({
      ok: true,
      conversation: { action: 'end', reason: 'owner-clarification' },
    });
    expect(result.conversation.instruction).toContain('Do not promise a callback');
    invoke('request_clarification', {
      key: 'another-key',
      text: 'Which equipment should be delivered?',
    });
    expect(m.conflicts.filter((c) => c.kind === 'clarification')).toHaveLength(1);
  });
  it('keeps scope and role rejections outside recoverable model-format errors', () => {
    const { m, a, scope, invoke } = call();
    expect(() => invoke('update_mission_constraints', { payload_json: '{' })).toThrow(
      'cannot change',
    );
    expect(() =>
      executeToolRequest(m, { ...scope, taskId: m.tasks[0].id }, 'get_mission_brief', {}),
    ).toThrow('capability');
    expect(a.phoneToolFailures).toBeUndefined();
    a.status = 'completed';
    expect(() => invoke('get_mission_brief')).toThrow('active');
  });
  it('returns an explicit polite end when the owner pauses during an active call', () => {
    const { m, invoke } = call();
    m.status = 'paused';
    expect(invoke('get_mission_brief').conversation).toMatchObject({
      action: 'end',
      reason: 'paused',
    });
  });
  it('a quality stop remains blocked after hangup even when the owner revised mid-call', () => {
    const { m, a } = call();
    a.executionId = '123e4567-e89b-42d3-a456-426614174000';
    a.phoneEndReason = 'repeated-brief-reads';
    m.revision++;
    applyExecution(m, a.id, { id: a.executionId, status: 'completed' });
    expect(m.tasks[1]).toMatchObject({ state: 'blocked', dispatchBlocked: true });
    expect(m.tasks[1].question).toContain('repeated unchanged checks');
    expect(m.attempts).toHaveLength(1);
  });
});
