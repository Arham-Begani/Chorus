import { expect, it } from 'vitest';
import { agentChecks } from '../../src/server/agent-checks';
const env = {
  CHORUS_CALLBACK_ORIGIN: 'https://callbacks.example.test',
  BOLNA_TOOL_SECRET: 'tool-secret-fixture',
  BOLNA_WEBHOOK_SECRET: 'webhook-secret-fixture',
  MAX_CALL_SECONDS: '180',
};
const names = ['get_mission_brief', 'report_observation', 'submit_offer', 'request_clarification'];
const fixture = () => ({
  webhook_url: `${env.CHORUS_CALLBACK_ORIGIN}/api/bolna/webhook`,
  webhook_headers: { 'x-chorus-webhook-secret': env.BOLNA_WEBHOOK_SECRET },
  tasks: [
    {
      task_config: { call_terminate: 180, auto_reschedule: false },
      tools_config: {
        api_tools: {
          tools: names.map((name) => ({ name })),
          tools_params: Object.fromEntries(
            names.map((name) => [
              name,
              {
                url: `${env.CHORUS_CALLBACK_ORIGIN}/api/tools/${name}`,
                method: 'POST',
                headers: { 'x-chorus-tool-secret': env.BOLNA_TOOL_SECRET },
                param: JSON.stringify({
                  token: '%(chorus_token)s',
                  payload_json: '%(payload_json)s',
                }),
              },
            ]),
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
  expect(agentChecks(changed, 'phone', env).every((c) => !c.ok)).toBe(true);
});
it('fails closed for incomplete agent contracts and literal tokens', () => {
  expect(agentChecks({}, 'phone', env)[0].ok).toBe(false);
  const changed = fixture();
  changed.tasks[0].tools_config.api_tools.tools_params.submit_offer.param = JSON.stringify({
    token: 'literal-token',
    payload_json: '%(payload_json)s',
  });
  expect(agentChecks(changed, 'phone', env).find((c) => c.name === 'phone tool bindings')?.ok).toBe(
    false,
  );
});
