import { expect, it } from 'vitest';
import { agentUpdate } from '../../src/server/agent-update';
import { agentChecks } from '../../src/server/agent-checks';
const env = {
  CHORUS_CALLBACK_ORIGIN: 'https://callbacks.example.test',
  BOLNA_TOOL_SECRET: 'tool-fixture-'.repeat(4),
  BOLNA_WEBHOOK_SECRET: 'independent-webhook-fixture-'.repeat(2),
  MAX_CALL_SECONDS: '180',
};
function current() {
  return {
    id: 'read-only-id',
    agent_name: 'CHORUS phone',
    agent_type: 'other',
    webhook_headers: { 'existing-custom-header': 'keep-this' },
    calling_guardrails: { call_start_hour: 9, call_end_hour: 20 },
    tasks: [
      {
        task_type: 'conversation',
        toolchain: { execution: 'sequential' },
        task_config: { call_terminate: 120, auto_reschedule: true, custom_setting: 'preserve' },
        tools_config: {
          llm_agent: { provider: 'existing-model-provider', model: 'existing-model' },
          synthesizer: { provider: 'existing-voice-provider', voice_id: 'existing-voice' },
          transcriber: { provider: 'deepgram', model: 'nova-3', endpointing: 250, language: 'en' },
          input: { provider: 'existing-carrier' },
          output: { provider: 'existing-carrier' },
          api_tools: {},
        },
      },
    ],
    agent_prompts: { task_1: { system_prompt: 'old', extra_prompt_setting: 'keep' } },
  };
}
it('preserves current providers, voice, guardrails and prompt extras while applying the reviewed contract', () => {
  const before = current(),
    copy = structuredClone(before);
  const update = agentUpdate(before, 'phone', 'reviewed-prompt', env);
  expect(before).toEqual(copy);
  for (const key of ['llm_agent', 'synthesizer', 'input', 'output'])
    expect(update.agent_config.tasks[0].tools_config[key]).toEqual(
      (before.tasks[0].tools_config as any)[key],
    );
  expect(update.agent_config.calling_guardrails).toEqual(before.calling_guardrails);
  expect(update.agent_config.tasks[0].task_config).toMatchObject({
    call_terminate: 120,
    auto_reschedule: false,
    custom_setting: 'preserve',
    check_if_user_online: false,
  });
  expect(update.agent_prompts.task_1).toEqual({
    system_prompt: 'reviewed-prompt',
    extra_prompt_setting: 'keep',
  });
  expect(update.agent_config).not.toHaveProperty('id');
  expect(
    agentChecks(
      { ...update.agent_config, agent_prompts: update.agent_prompts },
      'phone',
      env,
    ).every((c) => c.ok),
  ).toBe(true);
});
it('never overwrites unsupported rich-text prompts or silently changes speech providers', () => {
  expect(() =>
    agentUpdate(
      { ...current(), composition_by_language: { en: { text: 'custom' } } },
      'phone',
      'new',
      env,
    ),
  ).toThrow('preserved');
  const changed = current();
  changed.tasks[0].tools_config.transcriber.model = 'different';
  expect(() => agentUpdate(changed, 'phone', 'new', env)).toThrow('no provider change');
  expect(changed.tasks[0].tools_config.transcriber.endpointing).toBe(250);
});
it('rejects callback origins and missing secrets before returning an update body', () => {
  expect(() =>
    agentUpdate(current(), 'phone', 'new', {
      ...env,
      CHORUS_CALLBACK_ORIGIN: 'http://localhost:3000',
    }),
  ).toThrow('HTTPS');
  expect(() => agentUpdate(current(), 'phone', 'new', { ...env, BOLNA_TOOL_SECRET: '' })).toThrow(
    'secrets',
  );
});
