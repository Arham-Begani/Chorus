import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env already exists; preserved.');
} else {
  writeFileSync(
    '.env',
    readFileSync('.env.example', 'utf8')
      .replace('replace-with-at-least-32-random-bytes', randomBytes(48).toString('hex'))
      .replace('replace-with-a-local-login-password', randomBytes(18).toString('base64url')),
  );
  console.log(
    'Created .env with random local credentials. Use DEMO_PASSWORD from .env to sign in.',
  );
}
if (process.argv.includes('--live-secrets')) {
  let text = readFileSync('.env', 'utf8');
  let count = 0;
  for (const key of ['BOLNA_TOOL_SECRET', 'BOLNA_WEBHOOK_SECRET']) {
    const line = new RegExp(`^${key}=(.*)$`, 'm');
    const previous = text.match(line)?.[1].trim();
    if (previous) continue;
    const value = `${key}=${randomBytes(48).toString('hex')}`;
    text = line.test(text) ? text.replace(line, value) : text.trimEnd() + '\n' + value + '\n';
    count++;
  }
  writeFileSync('.env', text, { mode: 0o600 });
  console.log(
    `Generated ${count} missing callback/tool secrets privately. Existing values and live-call switches preserved.`,
  );
}
