import { bolnaTools, type BolnaRole } from '../providers/bolna-tools';
import { phoneEndpointing, phoneTaskSettings, phoneWelcome } from '../providers/phone-profile';

// PUT rewrites tasks, so start from the latest GET and preserve providers/voices,
// guardrails and unrelated configuration rather than replaying an old export.
export function agentUpdate(
  current: Record<string, any>,
  role: BolnaRole,
  prompt: string,
  env: Record<string, string | undefined>,
) {
  if (!Array.isArray(current.tasks) || current.tasks.length !== 1)
    throw new Error('Expected the configured single-task CHORUS agent; nothing was changed.');
  if (current.composition_by_language && Object.keys(current.composition_by_language).length)
    throw new Error(
      'Rich-text composition needs a separate reviewed conversion; existing prompts preserved.',
    );
  const origin = new URL(env.CHORUS_CALLBACK_ORIGIN || '');
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error('Set a protected HTTPS callback origin.');
  if (
    !env.BOLNA_TOOL_SECRET ||
    env.BOLNA_TOOL_SECRET.length < 32 ||
    !env.BOLNA_WEBHOOK_SECRET ||
    env.BOLNA_WEBHOOK_SECRET.length < 32
  )
    throw new Error('Existing independent tool/webhook secrets are required.');
  const readonly = new Set([
    'id',
    'agent_status',
    'created_at',
    'updated_at',
    'agent_prompts',
    'gpt_assistants',
    'custom_analytics',
    'restricted',
    'creation_source',
    'parent_agent_id',
    'source_agent_id',
    'created_by',
    'single_prompt_ui',
    'composition_by_language',
  ]);
  const agent_config = structuredClone(
    Object.fromEntries(Object.entries(current).filter(([key]) => !readonly.has(key))),
  );
  const task = agent_config.tasks[0];
  const definitions = bolnaTools(role, origin.origin, env.BOLNA_TOOL_SECRET);
  task.tools_config.api_tools = {
    tools: definitions.map(({ value, ...tool }) => tool),
    tools_params: Object.fromEntries(
      definitions.map(({ name, value }) => [
        name,
        { ...value, param: JSON.stringify(value.param) },
      ]),
    ),
  };
  const maximum = Number(env.MAX_CALL_SECONDS || 180);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 180)
    throw new Error('Keep the reviewed 180-second maximum.');
  task.task_config.call_terminate = Math.min(task.task_config.call_terminate || maximum, maximum);
  task.task_config.auto_reschedule = false;
  if (role === 'phone') {
    Object.assign(task.task_config, phoneTaskSettings);
    if (
      task.tools_config.transcriber.provider !== 'deepgram' ||
      task.tools_config.transcriber.model !== 'nova-3'
    )
      throw new Error(
        'Phone pacing was reviewed for the existing Nova-3 transcriber; no provider change was made.',
      );
    task.tools_config.transcriber.endpointing = phoneEndpointing;
    agent_config.agent_welcome_message = phoneWelcome;
  }
  agent_config.webhook_url = `${origin.origin}/api/bolna/webhook`;
  agent_config.webhook_headers = {
    ...current.webhook_headers,
    'x-chorus-webhook-secret': env.BOLNA_WEBHOOK_SECRET,
  };
  return {
    agent_config,
    agent_prompts: {
      ...structuredClone(current.agent_prompts),
      task_1: { ...current.agent_prompts?.task_1, system_prompt: prompt },
    },
  };
}
