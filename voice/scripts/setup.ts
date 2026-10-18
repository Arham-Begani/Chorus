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
