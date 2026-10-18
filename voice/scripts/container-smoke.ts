import assert from 'node:assert/strict';
import { createMission, defaultConstraints } from '../src/core/fixtures';
import { decide, requestApproval } from '../src/core/engine';
import { getMission, insert, pool } from '../src/server/db';

// Disposable CI fixture. Never enables provider calls or changes operator auth.
assert.equal(process.env.CHORUS_CI_SMOKE, 'true', 'Explicit disposable CI opt-in required');
assert.equal(process.env.SIMULATION_ONLY, 'true', 'Container smoke requires simulation');
assert.notEqual(process.env.ENABLE_REAL_CALLS, 'true', 'Container smoke cannot enable calls');
const owner = 'disposable-container-smoke';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  if (process.argv[2] === 'seed') {
    const mission = createMission(owner, 'equipment', 'simulation', defaultConstraints());
    decide(mission, requestApproval(mission, 'research').id, 1, true);
    await insert(mission);
    let started = await getMission(mission.id, owner);
    for (let i = 0; i < 150 && started.attempts.length !== 2; i++) {
      await delay(200);
      started = await getMission(mission.id, owner);
    }
    assert.equal(started.attempts.length, 2, 'The separate container worker must reserve research');
    console.log(
      JSON.stringify({ missionId: started.id, attemptIds: started.attempts.map((a) => a.id) }),
    );
  } else if (process.argv[2] === 'verify') {
    const snapshot = JSON.parse(process.argv[3] || '{}') as {
      missionId: string;
      attemptIds: string[];
    };
    assert.match(snapshot.missionId, /^[0-9a-f-]{36}$/i);
    assert.equal(snapshot.attemptIds.length, 2);
    let resumed = await getMission(snapshot.missionId, owner);
    for (let i = 0; i < 200; i++) {
      resumed = await getMission(snapshot.missionId, owner);
      if (resumed.plan.feasible && resumed.attempts.every((a) => a.status === 'completed')) break;
      await delay(200);
    }
    assert.equal(resumed.plan.feasible, true, 'Restarted worker must finish a feasible simulation');
    assert.deepEqual(
      resumed.attempts.map((a) => a.id),
      snapshot.attemptIds,
      'Restart must preserve attempt identities',
    );
    assert.ok(resumed.attempts.every((a) => a.mode === 'simulation' && a.status === 'completed'));
    assert.ok(resumed.offers.every((offer) => offer.mode === 'simulation'));
    const events = await pool.query(
      'SELECT count(*)::int AS count FROM chorus_events WHERE mission_id=$1',
      [resumed.id],
    );
    assert.equal(
      events.rows[0].count,
      resumed.events.length,
      'The event ledger must match persisted progress',
    );
    console.log(
      'PASS: built worker container resumed the same attempts after restart, completed simulation and preserved source events.',
    );
  } else throw new Error('Expected seed or verify mode');
} finally {
  await pool.end();
}
