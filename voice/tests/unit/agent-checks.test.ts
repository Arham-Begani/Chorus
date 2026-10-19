import { expect, it } from 'vitest';
import { agentChecks } from '../../src/server/agent-checks';
import { bolnaTools } from '../../src/providers/bolna-tools';
import { phoneTaskSettings, phoneWelcome } from '../../src/providers/phone-profile';
const env = {
  CHORUS_CALLBACK_ORIGIN: 'https://callbacks.example.test',
  BOLNA_TOOL_SECRET: 'tool-secret-fixture',
  BOLNA_WEBHOOK_SECRET: 'webhook-secret-fixture',
  MAX_CALL_SECONDS: '180',
};
const fixture = () => ({
  agent_welcome_message: phoneWelcome,
  webhook_url: `${env.CHORUS_CALLBACK_ORIGIN}/api/bolna/webhook`,
  webhook_headers: { 'x-chorus-webhook-secret': env.BOLNA_WEBHOOK_SECRET },
  tasks: [
    {
      task_config: { call_terminate: 180, auto_reschedule: false, ...phoneTaskSettings },
      tools_config: {
        transcriber: { endpointing: 450 },
        api_tools: {
          tools: bolnaTools('phone', env.CHORUS_CALLBACK_ORIGIN, env.BOLNA_TOOL_SECRET).map(
            ({ value, ...tool }) => ({ ...tool, pre_call_message: '' }),
          ),
          tools_params: Object.fromEntries(
            bolnaTools('phone', env.CHORUS_CALLBACK_ORIGIN, env.BOLNA_TOOL_SECRET).map(
              ({ name, value }) => [name, { ...value, param: value.param }],
            ),
          ),
        },
      },
    },
  ],
});
it('checks the actual duration, retries, tool endpoints/templates and independent webhook binding', () => {
  expect(agentChecks(fixture(), 'phone', env).every((c) => c.ok)).toBe(true);
  const changed = fixture();
  changed.tasks[0].task_config.auto_reschedule = true;
  changed.tasks[0].tools_config.api_tools.tools_params.submit_offer.url =
    'https://expired.example.test/api/tools/submit_offer';
  changed.webhook_headers['x-chorus-webhook-secret'] = env.BOLNA_TOOL_SECRET;
  const checks = agentChecks(changed, 'phone', env);
  for (const name of ['phone duration and retries', 'phone tool bindings', 'phone webhook binding'])
    expect(checks.find((c) => c.name === name)?.ok).toBe(false);
});
it('rejects repeated spoken filler, outdated descriptions and aggressive pacing', () => {
  const changed = fixture();
  changed.tasks[0].tools_config.api_tools.tools[0].pre_call_message =
    'Let me check the shared mission brief.';
  changed.tasks[0].tools_config.transcriber.endpointing = 150;
  changed.tasks[0].task_config.max_silence_repeats = 3;
  const checks = agentChecks(changed, 'phone', env);
  expect(checks.find((c) => c.name === 'phone conversation contract')?.ok).toBe(false);
  expect(checks.find((c) => c.name === 'phone speech pacing')?.ok).toBe(false);
  changed.tasks[0].tools_config.api_tools.tools[0].pre_call_message = '';
  expect(
    agentChecks(changed, 'phone', env).find((c) => c.name === 'phone conversation contract')?.ok,
  ).toBe(true);
  Reflect.deleteProperty(changed.tasks[0].tools_config.api_tools.tools[0], 'pre_call_message');
  expect(
    agentChecks(changed, 'phone', env).find((c) => c.name === 'phone conversation contract')?.ok,
  ).toBe(false);
});
it('fails closed for incomplete agent contracts and literal tokens', () => {
  expect(agentChecks({}, 'phone', env)[0].ok).toBe(false);
  const changed = fixture();
  Reflect.set(changed.tasks[0].tools_config.api_tools.tools_params.submit_offer, 'param', {
    token: 'literal-token',
    payload_json: '%(payload_json)s',
  });
  expect(agentChecks(changed, 'phone', env).find((c) => c.name === 'phone tool bindings')?.ok).toBe(
    false,
  );
});
it('rejects serialized variable markers and makes unrelated quote fields optional', () => {
  const changed = fixture();
  const params = changed.tasks[0].tools_config.api_tools.tools_params.submit_offer;
  Reflect.set(params, 'param', JSON.stringify(params.param));
  expect(agentChecks(changed, 'phone', env).find((c) => c.name === 'phone tool bindings')?.ok).toBe(
    false,
  );
  const tool = bolnaTools('phone', env.CHORUS_CALLBACK_ORIGIN, env.BOLNA_TOOL_SECRET).find(
    (t) => t.name === 'submit_offer',
  )!;
  expect(tool.parameters.required).not.toContain('capacity');
  expect(tool.parameters.required).not.toContain('setup_minutes');
  expect(tool.parameters.properties).not.toHaveProperty('payload_json');
  tool.parameters.properties.price_inr.type = 'number';
  expect(
    bolnaTools('phone', env.CHORUS_CALLBACK_ORIGIN, env.BOLNA_TOOL_SECRET).find(
      (t) => t.name === 'submit_offer',
    )!.parameters.properties.price_inr.type,
  ).toBe('string');
});
it('requires an actionable connection check before hangup and forbids repeated silence prompts', () => {
  expect(phoneTaskSettings.trigger_user_online_message_after).toBeLessThan(
    phoneTaskSettings.hangup_after_silence,
  );
  expect(phoneTaskSettings.max_silence_repeats).toBe(0);
  expect(phoneTaskSettings.check_user_online_message).toContain('unmuted');
  for (const override of [
    { check_if_user_online: false },
    { max_silence_repeats: 2 },
    { trigger_user_online_message_after: 20 },
    { check_user_online_message: 'Are you still there?' },
  ]) {
    const changed = fixture();
    Object.assign(changed.tasks[0].task_config, override);
    expect(
      agentChecks(changed, 'phone', env).find((c) => c.name === 'phone speech pacing')?.ok,
    ).toBe(false);
  }
});
