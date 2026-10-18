import { PgBoss } from 'pg-boss';
import { config } from '../src/server/config';
import { pool } from '../src/server/db';
import { coordinateTick } from '../src/server/coordinator';
const boss = new PgBoss({ connectionString: config.databaseUrl });
boss.on('error', (e) => console.error('Queue error:', e.message));
await boss.start();
await boss.createQueue('chorus-coordinate', { retryLimit: 3, retryDelay: 2, expireInSeconds: 120 });
await boss.work('chorus-coordinate', { pollingIntervalSeconds: 1 }, async () => {
  await coordinateTick();
});
const wake = () =>
  boss
    .send('chorus-coordinate', {}, { singletonKey: 'global', singletonSeconds: 1 })
    .catch((e) => console.error('Wakeup failed:', e.message));
await wake();
const timer = setInterval(wake, 1000);
console.log('CHORUS worker ready. Durable queue and PostgreSQL coordination active.');
async function stop() {
  clearInterval(timer);
  await boss.stop({ graceful: true, timeout: 20000 });
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
