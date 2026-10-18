import { readFileSync, readdirSync } from 'node:fs';
import { pool } from '../src/server/db';
const c = await pool.connect();
try {
  await c.query('BEGIN');
  await c.query(
    'CREATE TABLE IF NOT EXISTS chorus_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if ((await c.query('SELECT 1 FROM chorus_migrations WHERE version=$1', [file])).rowCount)
      continue;
    await c.query(readFileSync(`migrations/${file}`, 'utf8'));
    await c.query('INSERT INTO chorus_migrations(version) VALUES($1)', [file]);
    console.log(`Applied ${file}`);
  }
  await c.query('COMMIT');
} catch (e) {
  await c.query('ROLLBACK');
  throw e;
} finally {
  c.release();
  await pool.end();
}
