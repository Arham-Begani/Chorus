import 'dotenv/config';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const standalone = resolve('.next/standalone');
if (!existsSync(`${standalone}/server.js`)) {
  throw new Error('Production build missing. Run npm run build first.');
}
// Next's standalone output deliberately excludes static assets; local npm start supplies them.
cpSync(resolve('.next/static'), `${standalone}/.next/static`, { recursive: true });
process.env.HOSTNAME = process.env.CHORUS_HOST || '127.0.0.1';
await import(pathToFileURL(`${standalone}/server.js`).href);
