export type SetupCheck = { name: string; ok: boolean; detail: string };
export function setupChecks(env: Record<string, string | undefined>): SetupCheck[] {
  const checks: SetupCheck[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const validUrl = (value: string | undefined, https = false) => {
    try {
      const u = new URL(value || '');
      return (
        (!https || u.protocol === 'https:') &&
        ['http:', 'https:'].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        u.pathname === '/' &&
        !u.search &&
        !u.hash
      );
    } catch {
      return false;
    }
  };
  check('app origin', validUrl(env.APP_ORIGIN), 'APP_ORIGIN must be an exact HTTP(S) origin.');
  check(
    'session signing',
    (env.SESSION_SECRET?.length || 0) >= 32 && !env.SESSION_SECRET?.startsWith('replace-'),
    'SESSION_SECRET needs 32+ random characters.',
  );
  check('Supabase URL', validUrl(env.SUPABASE_URL, true), 'Copy the project URL from Connect.');
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
  let publicKey = key.startsWith('sb_publishable_') && key.length > 20;
  if (key.startsWith('eyJ')) {
    try {
      publicKey =
        JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
    } catch {
      /* invalid key */
    }
  }
  check(
    'Supabase low-privilege key',
    publicKey,
    'Use SUPABASE_PUBLISHABLE_KEY (or legacy anon); never service_role or sb_secret.',
  );
  check(
    'Supabase authentication',
    env.AUTH_MODE === 'supabase',
    'Set AUTH_MODE=supabase for live testing; simulation can use it too.',
  );
  let database = false;
  try {
    const db = new URL(env.DATABASE_URL || '');
    database = ['postgres:', 'postgresql:'].includes(db.protocol) && !!db.hostname && !!db.username;
    if (
      database &&
      (db.hostname.endsWith('.supabase.com') || db.hostname.endsWith('.supabase.co'))
    )
      database =
        (db.port || '5432') === '5432' &&
        ['verify-full', 'verify-ca'].includes(db.searchParams.get('sslmode') || '');
  } catch {
    /* invalid URL */
  }
  check(
    'database connection',
    database,
    'Use direct/session mode. Supabase: port 5432 with sslmode=verify-full (and project CA if needed), never transaction port 6543.',
  );
  check(
    'Bolna API key',
    !!env.BOLNA_API_KEY && !env.BOLNA_API_KEY.startsWith('replace-'),
    'Set BOLNA_API_KEY privately.',
  );
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  check(
    'Bolna agent IDs',
    uuid.test(env.BOLNA_CONDUCTOR_AGENT_ID || '') &&
      uuid.test(env.BOLNA_PHONE_AGENT_ID || '') &&
      env.BOLNA_CONDUCTOR_AGENT_ID !== env.BOLNA_PHONE_AGENT_ID,
    'Set two distinct agent IDs for conductor and phone.',
  );
  check(
    'callback secrets',
    (env.BOLNA_TOOL_SECRET?.length || 0) >= 32 &&
      (env.BOLNA_WEBHOOK_SECRET?.length || 0) >= 32 &&
      env.BOLNA_TOOL_SECRET !== env.BOLNA_WEBHOOK_SECRET,
    'Generate independent tool/webhook secrets with npm run setup -- --live-secrets.',
  );
  check(
    'HTTPS callbacks',
    validUrl(env.CHORUS_CALLBACK_ORIGIN || env.APP_ORIGIN, true),
    'Set CHORUS_CALLBACK_ORIGIN to your HTTPS callback origin.',
  );
  const numbers = (env.CALL_ALLOWLIST || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  check(
    'authorized participants',
    numbers.length > 0 && numbers.every((x) => /^\+[1-9]\d{7,14}$/.test(x)),
    'Only explicitly authorized E.164 test numbers belong in CALL_ALLOWLIST.',
  );
  const positiveInt = (key: string) =>
    Number.isSafeInteger(Number(env[key])) && Number(env[key]) > 0;
  check(
    'concurrency',
    positiveInt('ACCOUNT_CONCURRENCY') &&
      Number(env.ACCOUNT_CONCURRENCY) >= 2 &&
      positiveInt('OUTBOUND_CONCURRENCY') &&
      Number(env.OUTBOUND_CONCURRENCY) <= 3,
    'Verify account capacity including conductor; first test uses OUTBOUND_CONCURRENCY=1.',
  );
  check(
    'call limits and reserve',
    ['MAX_CALLS_PER_MISSION', 'MAX_CALL_SECONDS', 'CALL_COST_RESERVE_MINOR'].every(positiveInt),
    'Set bounded attempts, seconds and conservative per-attempt reserve in paise. Approval-card call budget is separate.',
  );
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  let zone = false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: env.CALLING_TIMEZONE || '' }).format();
    zone = true;
  } catch {
    /* invalid zone */
  }
  check(
    'calling window',
    clock.test(env.CALLING_WINDOW_START || '') && clock.test(env.CALLING_WINDOW_END || '') && zone,
    'Choose an authorized HH:mm start/end and IANA timezone.',
  );
  check(
    'provider limits reviewed',
    env.LIVE_AGENT_LIMITS_VERIFIED === 'true',
    'Manually verify duration cap, disabled retries and worst-case pricing before setting true.',
  );
  return checks;
}
