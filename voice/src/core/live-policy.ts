type Env = Record<string, string | undefined>;
const integer = (value: string | undefined) =>
  !!value && Number.isSafeInteger(Number(value)) && Number(value) > 0;

// A dated rehearsal authorization expires automatically. Daily calling hours still apply.
export function livePolicy(env: Env, now = Date.now()) {
  const start = Date.parse(env.LIVE_TEST_START_AT || ''),
    end = Date.parse(env.LIVE_TEST_END_AT || '');
  const dated = (value?: string) => !!value && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const valid =
    /^[a-zA-Z0-9_-]{8,80}$/.test(env.LIVE_TEST_ID || '') &&
    dated(env.LIVE_TEST_START_AT) &&
    dated(env.LIVE_TEST_END_AT) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    end - start <= 24 * 60 * 60 * 1000 &&
    [
      'LIVE_TEST_BUDGET_MINOR',
      'CALL_COST_RESERVE_MINOR',
      'BROWSER_COST_RESERVE_MINOR',
      'MAX_CALL_SECONDS',
    ].every((key) => integer(env[key])) &&
    Number(env.MAX_CALL_SECONDS) <= 180 &&
    Number(env.LIVE_TEST_BUDGET_MINOR) <= 100_000_000 &&
    Number(env.CALL_COST_RESERVE_MINOR) <= Number(env.LIVE_TEST_BUDGET_MINOR) &&
    Number(env.BROWSER_COST_RESERVE_MINOR) <= Number(env.LIVE_TEST_BUDGET_MINOR);
  const state = !valid
    ? 'unconfigured'
    : now < start
      ? 'scheduled'
      : now >= end
        ? 'expired'
        : 'active';
  return {
    valid,
    state,
    id: env.LIVE_TEST_ID || '',
    startAt: valid ? new Date(start).toISOString() : null,
    endAt: valid ? new Date(end).toISOString() : null,
    budgetMinor: valid ? Number(env.LIVE_TEST_BUDGET_MINOR) : 0,
    phoneReserveMinor: valid ? Number(env.CALL_COST_RESERVE_MINOR) : 0,
    browserReserveMinor: valid ? Number(env.BROWSER_COST_RESERVE_MINOR) : 0,
    maxSeconds: valid ? Number(env.MAX_CALL_SECONDS) : 0,
  };
}

export function assertLivePolicy(env: Env, now = Date.now()) {
  const policy = livePolicy(env, now);
  if (!policy.valid)
    throw new Error('Configure a dated live-test authorization and total spending limit first.');
  if (policy.state !== 'active')
    throw new Error(`Live-test authorization is ${policy.state}. No paid session can start.`);
  // Browser credentials can remain usable for 120 seconds before the call starts.
  if (now + (policy.maxSeconds + 120) * 1000 > Date.parse(policy.endAt!))
    throw new Error('Too little time remains in the authorized test window for another session.');
  return policy;
}
