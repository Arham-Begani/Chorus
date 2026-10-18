import { mkdirSync, writeFileSync } from 'node:fs';
const privateExport = process.argv.includes('--private');
const output = privateExport ? '.data/bolna' : 'integrations/generated';
let origin = 'https://YOUR-HTTPS-HOST';
let secret = 'REPLACE_WITH_BOLNA_TOOL_SECRET';
if (privateExport) {
  const url = new URL(process.env.CHORUS_CALLBACK_ORIGIN || process.env.APP_ORIGIN || '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Set CHORUS_CALLBACK_ORIGIN to a public HTTPS origin');
  if (!process.env.BOLNA_TOOL_SECRET || process.env.BOLNA_TOOL_SECRET.length < 32)
    throw new Error('Set BOLNA_TOOL_SECRET to at least 32 random characters');
  origin = url.origin;
  secret = process.env.BOLNA_TOOL_SECRET;
}
const instructions: Record<string, string> = {
  propose_mission:
    'Draft the current mission from the owner’s spoken goal. JSON fields: key,title,goal,constraints with budgetMinor,currency INR,quantity,eventStart ISO with offset,timezone.',
  get_mission_brief:
    'Refresh the current brief and shared evidence before every material question or proposal. JSON object: {}.',
  report_observation: 'Record a sourced fact from this assigned phone call. JSON fields: key,text.',
  submit_offer:
    'Submit explicitly reported or confirmed business terms after refreshing the brief. JSON fields: key,revision,terms with priceMinor integer paise,currency INR,description,confirmation reported or confirmed,optional capacity integer,readyAt ISO with offset,setupMinutes integer.',
  request_clarification: 'Ask the mission owner about an unresolved fact. JSON fields: key,text.',
  request_approval:
    'Ask the owner to use an authenticated approval card. JSON fields: key,kind research or plan. This does not approve anything.',
  update_mission_constraints:
    'Revise constraints only at the authenticated browser owner’s request. JSON fields: key,reason,constraints with all five fields budgetMinor,currency INR,quantity,eventStart ISO,timezone.',
  initiate_approved_work:
    'Queue research only after the owner already approved the current revision. JSON fields: key. Never makes a purchase or reservation.',
};
const schema = (name: string) => ({
  name,
  description: instructions[name],
  pre_call_message: 'Let me check the shared mission brief.',
  parameters: {
    type: 'object',
    properties: {
      payload_json: {
        type: 'string',
        description: instructions[name] + ' Encode the object as JSON; do not include a token.',
      },
    },
    required: ['payload_json'],
  },
  key: 'custom_task',
  value: {
    method: 'POST',
    url: `${origin}/api/tools/${name}`,
    api_token: '',
    headers: { 'x-chorus-tool-secret': secret },
    param: { token: '%(chorus_token)s', payload_json: '%(payload_json)s' },
  },
});
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const [role, names] of Object.entries({
  conductor: [
    'propose_mission',
    'get_mission_brief',
    'request_approval',
    'update_mission_constraints',
    'initiate_approved_work',
  ],
  phone: ['get_mission_brief', 'report_observation', 'submit_offer', 'request_clarification'],
})) {
  writeFileSync(`${output}/${role}-tools.json`, JSON.stringify(names.map(schema), null, 2) + '\n', {
    mode: 0o600,
  });
}
console.log(
  privateExport
    ? 'Wrote private tool definitions under ignored .data/bolna/. These contain a secret; import privately into Bolna only.'
    : 'Wrote placeholder tool definitions. Replace host and secret in the Bolna dashboard, never in committed source.',
);
