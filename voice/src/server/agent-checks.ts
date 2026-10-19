import { z } from 'zod';
import type { SetupCheck } from './setup-checks';
const agentSchema = z.object({
  webhook_url: z.string().optional(),
  webhook_headers: z.record(z.string(), z.unknown()).nullish(),
  tasks: z.array(
    z.object({
      task_config: z.object({ call_terminate: z.number(), auto_reschedule: z.boolean() }),
      tools_config: z.object({
        api_tools: z.object({
          tools: z.array(z.object({ name: z.string() })),
          tools_params: z.record(
            z.string(),
            z.object({
              url: z.string(),
              method: z.string(),
              headers: z.record(z.string(), z.unknown()),
              param: z.union([z.string(), z.record(z.string(), z.unknown())]),
            }),
          ),
        }),
      }),
    }),
  ),
});
export function agentChecks(
  input: unknown,
  role: 'conductor' | 'phone',
  env: Record<string, string | undefined>,
): SetupCheck[] {
  const parsed = agentSchema.safeParse(input);
  if (!parsed.success || parsed.data.tasks.length !== 1)
    return [
      {
        name: `${role} agent contract`,
        ok: false,
        detail:
          'Agent shape is incomplete or unsupported; inspect privately in the provider dashboard.',
      },
    ];
  const a = parsed.data,
    t = a.tasks[0],
    api = t.tools_config.api_tools;
  const names =
    role === 'phone'
      ? ['get_mission_brief', 'report_observation', 'submit_offer', 'request_clarification']
      : [
          'propose_mission',
          'get_mission_brief',
          'request_approval',
          'update_mission_constraints',
          'initiate_approved_work',
        ];
  const origin = env.CHORUS_CALLBACK_ORIGIN || env.APP_ORIGIN;
  const tools =
    names.every((name) => {
      const p = api.tools_params[name];
      let param: Record<string, unknown>;
      try {
        param = typeof p?.param === 'string' ? JSON.parse(p.param) : p?.param;
      } catch {
        return false;
      }
      return (
        api.tools.some((tool) => tool.name === name) &&
        p?.url === `${origin}/api/tools/${name}` &&
        p.method === 'POST' &&
        !!env.BOLNA_TOOL_SECRET &&
        p.headers['x-chorus-tool-secret'] === env.BOLNA_TOOL_SECRET &&
        param?.token === '%(chorus_token)s' &&
        param?.payload_json === '%(payload_json)s'
      );
    }) &&
    api.tools.length === names.length &&
    Object.keys(api.tools_params).length === names.length;
  return [
    {
      name: `${role} duration and retries`,
      ok:
        t.task_config.call_terminate > 0 &&
        t.task_config.call_terminate <= Number(env.MAX_CALL_SECONDS) &&
        !t.task_config.auto_reschedule,
      detail:
        'Provider duration must fit MAX_CALL_SECONDS and automatic rescheduling must be disabled.',
    },
    {
      name: `${role} tool bindings`,
      ok: tools,
      detail:
        'Tool names, POST endpoints, shared-secret headers and runtime token templates must exactly match the current private configuration.',
    },
    {
      name: `${role} webhook binding`,
      ok:
        !!env.BOLNA_WEBHOOK_SECRET &&
        a.webhook_url === `${origin}/api/bolna/webhook` &&
        a.webhook_headers?.['x-chorus-webhook-secret'] === env.BOLNA_WEBHOOK_SECRET,
      detail: 'Webhook URL and independent webhook secret must match the current callback origin.',
    },
  ];
}
