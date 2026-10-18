import pg from 'pg';

if (process.argv[2] === 'configuration') {
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(JSON.stringify({
      localDatabase: ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '55432' && url.pathname === '/chorus',
      safe: process.env.SIMULATION_ONLY === 'true' && process.env.ENABLE_REAL_CALLS !== 'true',
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'].includes(process.env.APP_ORIGIN),
    }));
  } catch {
    console.error('Invalid local runtime configuration. Connection details withheld.');
    process.exitCode = 1;
  }
} else if (process.argv[2] === 'database') {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch { process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
} else {
  console.error('Usage: node --env-file=.env scripts/local-runtime-check.mjs configuration|database');
  process.exitCode = 1;
}
