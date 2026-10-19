import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { agentChecks } from '../src/server/agent-checks';
import { agentUpdate } from '../src/server/agent-update';
const apply = process.argv.includes('--apply');
if (process.argv.some((arg) => arg.startsWith('--') && arg !== '--apply'))
  throw new Error('Use no flag for read-only checking, or --apply to update the existing agents.');
if (!process.env.BOLNA_API_KEY)
  throw new Error('Save BOLNA_API_KEY privately before checking configured agents.');
async function api(id: string, body?: object) {
  const r = await fetch(`https://api.bolna.ai/v2/agent/${z.uuid().parse(id)}`, {
    method: body ? 'PUT' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.BOLNA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  });
  if (!r.ok)
    throw new Error(
      `Agent ${body ? 'update' : 'read'} returned HTTP ${r.status}; details withheld. No call was started.`,
    );
  return r.json();
}
let failed = false;
for (const role of ['conductor', 'phone'] as const) {
  const id = process.env[`BOLNA_${role.toUpperCase()}_AGENT_ID`] || '';
  const prompt = readFileSync(`integrations/${role}-prompt.md`, 'utf8');
  const before = await api(id);
  let after = before;
  if (apply) {
    mkdirSync('.data/bolna', { recursive: true, mode: 0o700 });
    const checkpoint = `.data/bolna/${role}-sync-${Date.now()}`;
    writeFileSync(`${checkpoint}-before.private.json`, JSON.stringify(before, null, 2), {
      mode: 0o600,
    });
    await api(id, agentUpdate(before, role, prompt, process.env));
    after = await api(id);
    writeFileSync(`${checkpoint}-after.private.json`, JSON.stringify(after, null, 2), {
      mode: 0o600,
    });
    const preserved = ['llm_agent', 'synthesizer', 'input', 'output'].every((key) =>
      isDeepStrictEqual(before.tasks[0].tools_config[key], after.tasks[0].tools_config[key]),
    );
    if (!preserved)
      throw new Error(
        'Provider/voice readback changed unexpectedly. Keep real calling off and inspect the private checkpoint.',
      );
  }
  for (const check of agentChecks(after, role, process.env)) {
    console.log(`${check.ok ? 'PASS' : 'TODO'} ${check.name}`);
    failed ||= !check.ok;
  }
  const promptMatches = after.agent_prompts?.task_1?.system_prompt === prompt;
  console.log(`${promptMatches ? 'PASS' : 'TODO'} ${role} exact source prompt`);
  failed ||= !promptMatches;
}
console.log(
  apply
    ? 'Updated existing agents and read them back. No call, browser session, credential or calling-switch change.'
    : 'Read-only agent audit finished. Use --apply only to synchronize these existing agents; this command never dials.',
);
process.exitCode = failed ? 1 : 0;
