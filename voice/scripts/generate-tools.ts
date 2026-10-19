import { mkdirSync, writeFileSync } from 'node:fs';
import { bolnaTools, type BolnaRole } from '../src/providers/bolna-tools';
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
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const role of ['conductor', 'phone'] as BolnaRole[]) {
  writeFileSync(
    `${output}/${role}-tools.json`,
    JSON.stringify(bolnaTools(role, origin, secret), null, 2) + '\n',
    {
      mode: 0o600,
    },
  );
}
console.log(
  privateExport
    ? 'Wrote private tool definitions under ignored .data/bolna/. These contain a secret; import privately into Bolna only.'
    : 'Wrote placeholder tool definitions. Replace host and secret in the Bolna dashboard, never in committed source.',
);
