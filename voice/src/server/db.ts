import { Pool, type PoolClient } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { config } from './config';
import type { Mission } from '../core/types';
const globalDb = globalThis as unknown as { chorusPool?: Pool };
export const pool =
  globalDb.chorusPool ?? new Pool({ connectionString: config.databaseUrl, max: 10 });
globalDb.chorusPool = pool;
export async function save(c: PoolClient, m: Mission) {
  await c.query(
    'INSERT INTO chorus_missions(id,owner_id,mode,status,revision,state) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET status=$4,revision=$5,state=$6,updated_at=now()',
    [m.id, m.ownerId, m.mode, m.status, m.revision, JSON.stringify(m)],
  );
  const groups: Record<string, { id: string }[]> = {
    revision: m.revisions,
    task: m.tasks,
    contact: m.contacts,
    attempt: m.attempts,
    observation: m.observations,
    offer: m.offers,
    approval: m.approvals,
    conflict: m.conflicts,
    dependency: m.tasks.flatMap((t) =>
      t.dependsOn.map((parent) => ({ id: `${parent}:${t.id}`, from: parent, to: t.id })),
    ),
  };
  // Replace projections atomically; the aggregate row lock serializes all writers.
  await c.query('DELETE FROM chorus_entities WHERE mission_id=$1', [m.id]);
  const entries = Object.entries(groups).flatMap(([kind, items]) =>
    items.map((item) => ({ kind, id: item.id, payload: item })),
  );
  if (entries.length)
    await c.query(
      'INSERT INTO chorus_entities(mission_id,kind,id,payload) SELECT $1,x.kind,x.id,x.payload FROM jsonb_to_recordset($2::jsonb) AS x(kind text,id text,payload jsonb)',
      [m.id, JSON.stringify(entries)],
    );
  if (m.events.length)
    await c.query(
      'INSERT INTO chorus_events(id,mission_id,type,mode,revision,at,payload) SELECT x.id::uuid,$1,x.type,x.mode,x.revision,x.at::timestamptz,x.payload FROM jsonb_to_recordset($2::jsonb) AS x(id text,type text,mode text,revision int,at text,payload jsonb) ON CONFLICT(id) DO NOTHING',
      [m.id, JSON.stringify(m.events.map((e) => ({ ...e, payload: e })))],
    );
}
export async function insert(m: Mission) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const created = await c.query(
      'INSERT INTO chorus_missions(id,owner_id,mode,status,revision,state) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id',
      [m.id, m.ownerId, m.mode, m.status, m.revision, JSON.stringify(m)],
    );
    if (!created.rowCount) {
      const previous = await c.query(
        'SELECT state FROM chorus_missions WHERE id=$1 AND owner_id=$2',
        [m.id, m.ownerId],
      );
      if (!previous.rowCount) throw new Error('Mission not found');
      await c.query('COMMIT');
      return previous.rows[0].state as Mission;
    }
    await save(c, m);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  return m;
}
export async function mutate<T>(
  id: string,
  ownerId: string | undefined,
  fn: (m: Mission, client: PoolClient) => T | Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query('SELECT state FROM chorus_missions WHERE id=$1 FOR UPDATE', [id]);
    const m = r.rows[0]?.state as Mission | undefined;
    if (!m || (ownerId && m.ownerId !== ownerId)) throw new Error('Mission not found');
    const before = structuredClone(m);
    const result = await fn(m, c);
    // Reads, duplicate commands and idle worker ticks keep their row lock but do not
    // rewrite the aggregate, projections and timestamps when nothing changed.
    if (!isDeepStrictEqual(before, JSON.parse(JSON.stringify(m)))) await save(c, m);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function getMission(id: string, ownerId: string) {
  const r = await pool.query('SELECT state FROM chorus_missions WHERE id=$1 AND owner_id=$2', [
    id,
    ownerId,
  ]);
  if (!r.rows[0]) throw new Error('Mission not found');
  return r.rows[0].state as Mission;
}
export async function listMissions(ownerId: string) {
  const r = await pool.query(
    'SELECT state FROM chorus_missions WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 30',
    [ownerId],
  );
  return r.rows.map((r) => r.state as Mission);
}
export function publicMission(m: Mission) {
  const { processedKeys, ownerId, responses, ...safe } = m;
  void processedKeys;
  void ownerId;
  return { ...safe, responses: m.mode === 'simulation' ? responses : undefined };
}
