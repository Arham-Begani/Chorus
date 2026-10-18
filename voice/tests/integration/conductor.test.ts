import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { conduct } from '../../src/server/conductor';
import { getMission, mutate, pool } from '../../src/server/db';
import { decide, requestApproval, revise } from '../../src/core/engine';
import { coordinateTick } from '../../src/server/coordinator';
const owner = 'conductor-integration-' + randomUUID();
afterAll(async () => {
  await pool.query('DELETE FROM chorus_missions WHERE owner_id LIKE $1', [owner + '%']);
  await pool.end();
});
it('deduplicates concurrent mission creation without resetting existing progress or crossing owners', async () => {
  const input = {
    key: randomUUID(),
    text: 'Our venue cancelled. Find a venue for 40 people tomorrow at 6 pm under 12000 rupees',
    source: 'text',
  };
  const [a, b] = await Promise.all([conduct(owner, input), conduct(owner, input)]);
  expect(a.mission?.id).toBe(b.mission?.id);
  const id = a.mission!.id;
  await mutate(id, owner, (m) =>
    revise(m, { ...m.constraints, budgetMinor: 900000 }, 'Owner changed budget'),
  );
  expect((await conduct(owner, input)).mission?.revision).toBe(2);
  const another = await conduct(owner + '-other', input);
  expect(another.mission?.id).not.toBe(id);
  await expect(
    conduct(owner + '-other', {
      key: randomUUID(),
      text: 'Pause',
      source: 'voice',
      missionId: id,
      revision: 2,
    }),
  ).rejects.toThrow('Mission not found');
});
it('revises active coordinated simulations through the conductor and persists actual command provenance', async () => {
  const draft = await conduct(owner, {
    key: randomUUID(),
    text: 'Find a venue for 40 people tomorrow at 6 pm under 12000 rupees',
    source: 'voice',
  });
  const id = draft.mission!.id;
  await mutate(id, owner, (m) => decide(m, requestApproval(m, 'research').id, 1, true));
  await coordinateTick();
  const key = randomUUID();
  const command = {
    key,
    text: 'Lower the budget to nine thousand rupees',
    source: 'voice',
    missionId: id,
    revision: 1,
  };
  const next = await conduct(owner, command);
  expect(next.mission).toMatchObject({
    revision: 2,
    constraints: { budgetMinor: 900000 },
    mode: 'simulation',
  });
  expect(await conduct(owner, command)).toMatchObject({
    duplicate: true,
    mission: { revision: 2 },
  });
  await expect(conduct(owner, { ...command, key: randomUUID() })).rejects.toThrow(/changed/);
  const saved = await getMission(id, owner);
  expect(saved.events.filter((e) => e.type === 'conductor.voice')).toHaveLength(2);
  expect(saved.approvals.some((a) => a.status === 'stale')).toBe(true);
  expect(saved.attempts.every((a) => a.mode === 'simulation')).toBe(true);
  await conduct(owner, {
    key: randomUUID(),
    text: 'Pause',
    source: 'text',
    missionId: id,
    revision: 2,
  });
  await expect(
    conduct(owner, {
      key: randomUUID(),
      text: 'Start research',
      source: 'text',
      missionId: id,
      revision: 2,
    }),
  ).rejects.toThrow(/Resume/);
  await conduct(owner, {
    key: randomUUID(),
    text: 'Resume',
    source: 'text',
    missionId: id,
    revision: 2,
  });
  const approval = await conduct(owner, {
    key: randomUUID(),
    text: 'Approve and book the venue',
    source: 'text',
    missionId: id,
    revision: 2,
  });
  expect(approval.message).toContain('approval card');
  expect(
    (await getMission(id, owner)).approvals.some(
      (a) => a.revision === 2 && a.status === 'approved',
    ),
  ).toBe(false);
});
