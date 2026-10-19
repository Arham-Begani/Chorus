import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { bolnaTools } from '../providers/bolna-tools';
import { phoneEndpointing, phoneTaskSettings, phoneWelcome } from '../providers/phone-profile';
import type { SetupCheck } from './setup-checks';
const agentSchema = z.object({
  agent_welcome_message: z.string().optional(),
  webhook_url: z.string().optional(),
  webhook_headers: z.record(z.string(), z.unknown()).nullish(),
  tasks: z.array(
    z.object({
      task_config: z
        .object({ call_terminate: z.number(), auto_reschedule: z.boolean() })
        .passthrough(),
      tools_config: z.object({
        transcriber: z.object({ endpointing: z.number().optional() }).passthrough().optional(),
        api_tools: z.object({
          tools: z.array(z.object({ name: z.string() }).passthrough()),
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
  const origin = env.CHORUS_CALLBACK_ORIGIN || env.APP_ORIGIN;
  const expected = bolnaTools(role, origin || '', env.BOLNA_TOOL_SECRET || '');
  const names = expected.map((tool) => tool.name);
  const tools =
    names.every((name) => {
      const p = api.tools_params[name];
      return (
        api.tools.some((tool) => tool.name === name) &&
        p?.url === `${origin}/api/tools/${name}` &&
        p.method === 'POST' &&
        !!env.BOLNA_TOOL_SECRET &&
        p.headers['x-chorus-tool-secret'] === env.BOLNA_TOOL_SECRET &&
        typeof p.param === 'object' &&
        !Array.isArray(p.param) &&
        isDeepStrictEqual(p.param, expected.find((tool) => tool.name === name)!.value.param)
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
        'Tool names, POST endpoints, independent headers and structured JSON variable mappings must exactly match the current private configuration. Serialized marker strings are not supported.',
    },
    {
      name: `${role} conversation contract`,
      ok:
        (role !== 'phone' || a.agent_welcome_message === phoneWelcome) &&
        expected.every((definition) => {
          const tool = api.tools.find((tool) => tool.name === definition.name);
          const filler = tool?.pre_call_message;
          return (
            tool?.description === definition.description &&
            isDeepStrictEqual(tool.parameters, definition.parameters) &&
            filler === ''
          );
        }),
      detail:
        'Tool descriptions and argument schemas must match the source; repeated spoken pre-tool filler is disabled.',
    },
    ...(role === 'phone'
      ? [
          {
            name: 'phone speech pacing',
            ok:
              t.tools_config.transcriber?.endpointing === phoneEndpointing &&
              Object.entries(phoneTaskSettings).every(([key, value]) =>
                isDeepStrictEqual(t.task_config[key], value),
              ),
            detail:
              'Use the exact phone profile: one unmute check before the silence timeout, no LLM silence re-prompts, bounded duration, interruptions and explicit completion criteria.',
          },
        ]
      : []),
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
