import 'dotenv/config';
export const config = {
  get supabaseKey() {
    return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  },
  get databaseUrl() {
    return process.env.DATABASE_URL || 'postgres://chorus:chorus_local_only@127.0.0.1:55432/chorus';
  },
  get secret() {
    const v = process.env.SESSION_SECRET;
    if (!v || v.length < 32)
      throw new Error('Set SESSION_SECRET (32+ random bytes); run npm run setup');
    return v;
  },
  get local() {
    return process.env.AUTH_MODE === 'local' && process.env.SIMULATION_ONLY === 'true';
  },
  get realEnabled() {
    return (
      process.env.ENABLE_REAL_CALLS === 'true' &&
      process.env.SIMULATION_ONLY === 'false' &&
      process.env.AUTH_MODE === 'supabase'
    );
  },
  get origin() {
    return process.env.APP_ORIGIN || 'http://localhost:3000';
  },
  get maxOutbound() {
    const outbound = Number(process.env.OUTBOUND_CONCURRENCY || 3),
      account = Number(process.env.ACCOUNT_CONCURRENCY || 1);
    if (![outbound, account].every((n) => Number.isSafeInteger(n) && n > 0)) return 0;
    return Math.min(3, outbound, Math.max(0, account - 1));
  },
  get reserveMinor() {
    return Math.max(1, Number(process.env.CALL_COST_RESERVE_MINOR || 5000));
  },
  get maxCalls() {
    return Math.max(1, Number(process.env.MAX_CALLS_PER_MISSION || 6));
  },
  get allowlist() {
    return (process.env.CALL_ALLOWLIST || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  },
};
export function readiness() {
  return {
    realEnabled: config.realEnabled,
    authMode: config.local ? 'local simulation' : 'Supabase',
    outboundConcurrency: config.maxOutbound,
    missing: [
      'BOLNA_API_KEY',
      'BOLNA_CONDUCTOR_AGENT_ID',
      'BOLNA_PHONE_AGENT_ID',
      'BOLNA_WEBHOOK_SECRET',
      'BOLNA_TOOL_SECRET',
      'SUPABASE_URL',
    ]
      .filter((k) => !process.env[k])
      .concat(config.supabaseKey ? [] : ['SUPABASE_PUBLISHABLE_KEY']),
    hasAllowlist: config.allowlist.length > 0,
  };
}
export function inCallingWindow(now = new Date()) {
  const zone = process.env.CALLING_TIMEZONE || 'Asia/Kolkata';
  const start = process.env.CALLING_WINDOW_START || '09:00',
    end = process.env.CALLING_WINDOW_END || '20:00';
  if (![start, end].every((t) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))) return false;
  try {
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    return start <= end ? time >= start && time <= end : time >= start || time <= end;
  } catch {
    return false;
  }
}
