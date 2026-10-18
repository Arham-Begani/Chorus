import { expect, it } from 'vitest';
import { setupChecks } from '../../src/server/setup-checks';
const database = (url: string) =>
  setupChecks({ DATABASE_URL: url }).find((c) => c.name === 'database connection')!.ok;
it('rejects Supabase transaction pools and unverified remote database encryption', () => {
  expect(
    database(
      'postgres://user:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=verify-full',
    ),
  ).toBe(false);
  expect(database('postgres://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres')).toBe(
    false,
  );
  expect(
    database(
      'postgres://user:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',
    ),
  ).toBe(true);
  expect(database('postgres://user:pass@127.0.0.1:55432/chorus')).toBe(true);
});
it('does not accept a Supabase secret key as an operator login key', () => {
  for (const key of [
    'sb_secret_example',
    'eyJ.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.sig',
  ])
    expect(
      setupChecks({ SUPABASE_PUBLISHABLE_KEY: key }).find(
        (c) => c.name === 'Supabase low-privilege key',
      )!.ok,
    ).toBe(false);
});
