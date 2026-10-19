import { expect, it } from 'vitest';
import { assertLivePolicy, livePolicy } from '../../src/core/live-policy';
const env = {
  LIVE_TEST_ID: 'test-authorization',
  LIVE_TEST_START_AT: '2026-10-20T10:00:00+05:30',
  LIVE_TEST_END_AT: '2026-10-20T11:00:00+05:30',
  LIVE_TEST_BUDGET_MINOR: '10000',
  CALL_COST_RESERVE_MINOR: '2000',
  BROWSER_COST_RESERVE_MINOR: '2000',
  MAX_CALL_SECONDS: '180',
};
it('requires a dated, bounded and explicitly funded test authorization', () => {
  expect(livePolicy({}).valid).toBe(false);
  expect(livePolicy(env, Date.parse('2026-10-20T10:05:00+05:30')).state).toBe('active');
  for (const patch of [
    { LIVE_TEST_BUDGET_MINOR: 'NaN' },
    { MAX_CALL_SECONDS: '181' },
    { LIVE_TEST_START_AT: '2026-10-20T10:00:00' },
    { LIVE_TEST_END_AT: '2026-10-22T10:00:00+05:30' },
    { BROWSER_COST_RESERVE_MINOR: '0' },
    { CALL_COST_RESERVE_MINOR: '10001' },
  ])
    expect(livePolicy({ ...env, ...patch }).valid).toBe(false);
});
it('expires at the exact authorized instant and rejects sessions that could overrun it', () => {
  expect(() => assertLivePolicy(env, Date.parse('2026-10-20T09:59:59+05:30'))).toThrow('scheduled');
  expect(() => assertLivePolicy(env, Date.parse('2026-10-20T11:00:00+05:30'))).toThrow('expired');
  expect(() => assertLivePolicy(env, Date.parse('2026-10-20T10:56:00+05:30'))).toThrow(
    'Too little time',
  );
  expect(() => assertLivePolicy(env, Date.parse('2026-10-20T10:54:00+05:30'))).not.toThrow();
});
