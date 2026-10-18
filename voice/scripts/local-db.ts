import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
const pg = new EmbeddedPostgres({
  databaseDir: '.data/postgres',
  user: 'chorus',
  password: 'chorus_local_only',
  port: 55432,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
});
if (!existsSync('.data/postgres/PG_VERSION')) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('chorus');
} catch (e) {
  if (!String(e).includes('already exists')) throw e;
}
console.log('Local PostgreSQL listening on 127.0.0.1:55432. Keep this terminal open.');
process.on('SIGINT', async () => {
  await pg.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await pg.stop();
  process.exit(0);
});
setInterval(() => {}, 60000);
