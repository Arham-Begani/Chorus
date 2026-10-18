import 'dotenv/config';
import { setupChecks } from '../src/server/setup-checks';
const checks = setupChecks(process.env);
for (const c of checks)
  console.log(`${c.ok ? 'PASS' : 'TODO'} ${c.name}${c.ok ? '' : ': ' + c.detail}`);
console.log(
  `Call switch: ${process.env.ENABLE_REAL_CALLS === 'true' && process.env.SIMULATION_ONLY === 'false' ? 'enabled' : 'disabled'}. This command never dials or changes configuration.`,
);
let failed = checks.some((c) => !c.ok);
if (process.argv.includes('--online')) {
  async function probe(name: string, url: string, headers: Record<string, string>) {
    try {
      const r = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      console.log(`${r.ok ? 'PASS' : 'TODO'} ${name}: HTTP ${r.status}`);
      failed ||= !r.ok;
      return r.ok ? await r.json() : undefined;
    } catch {
      failed = true;
      console.log(`TODO ${name}: connection failed (details withheld to protect credentials).`);
    }
  }
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (
    checks.find((c) => c.name === 'Supabase URL')?.ok &&
    checks.find((c) => c.name === 'Supabase low-privilege key')?.ok
  )
    await probe('Supabase Auth reachability', `${process.env.SUPABASE_URL}/auth/v1/settings`, {
      apikey: key!,
    });
  if (process.env.BOLNA_API_KEY) {
    const headers = { Authorization: `Bearer ${process.env.BOLNA_API_KEY}` };
    const account = await probe('Bolna account', 'https://api.bolna.ai/user/me', headers);
    if (Number.isSafeInteger(account?.concurrency?.max)) {
      console.log(
        `Bolna capacity: ${account.concurrency.max} total sessions (identity and wallet withheld).`,
      );
      if (Number(process.env.ACCOUNT_CONCURRENCY) > account.concurrency.max) {
        failed = true;
        console.log('TODO configured ACCOUNT_CONCURRENCY exceeds provider capacity.');
      }
    }
    for (const role of ['CONDUCTOR', 'PHONE']) {
      const id = process.env[`BOLNA_${role}_AGENT_ID`];
      if (id && /^[0-9a-f-]{36}$/i.test(id))
        await probe(
          `Bolna ${role.toLowerCase()} agent`,
          `https://api.bolna.ai/v2/agent/${id}`,
          headers,
        );
    }
  }
}
process.exitCode = failed ? 1 : 0;
