import { afterEach, expect, it, vi } from 'vitest';
import { BolnaAdapter, DispatchError } from '../../src/providers/bolna';
import { sign, verify } from '../../src/server/auth';
import { config, inCallingWindow, readiness } from '../../src/server/config';
afterEach(() => vi.unstubAllEnvs());
it('fails closed for invalid concurrency, hours and timezones', () => {
  vi.stubEnv('ACCOUNT_CONCURRENCY', 'NaN');
  expect(config.maxOutbound).toBe(0);
  vi.stubEnv('CALLING_TIMEZONE', 'Invalid/Zone');
  expect(inCallingWindow()).toBe(false);
  vi.stubEnv('CALLING_TIMEZONE', 'Asia/Kolkata');
  vi.stubEnv('CALLING_WINDOW_START', 'tomorrow');
  expect(inCallingWindow()).toBe(false);
});
it('prefers Supabase publishable keys and preserves legacy anon-key configuration', () => {
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_only');
  vi.stubEnv('SUPABASE_ANON_KEY', 'legacy-unit-only');
  expect(config.supabaseKey).toBe('sb_publishable_unit_only');
  expect(readiness().missing).not.toContain('SUPABASE_PUBLISHABLE_KEY');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');
  expect(config.supabaseKey).toBe('legacy-unit-only');
  vi.stubEnv('SUPABASE_ANON_KEY', '');
  expect(readiness().missing).toContain('SUPABASE_PUBLISHABLE_KEY');
});
it('uses documented execution endpoint with a server-side Bearer key', async () => {
  vi.stubEnv('BOLNA_API_KEY', 'unit-test-key');
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const request = vi.fn().mockResolvedValue(Response.json({ id, status: 'completed' }));
  await new BolnaAdapter(request).execution(id);
  expect(request).toHaveBeenCalledWith(
    `https://api.bolna.ai/executions/${id}`,
    expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer unit-test-key' }),
    }),
  );
});
it('network timeout is uncertain and not safe to retry', async () => {
  vi.stubEnv('BOLNA_API_KEY', 'unit-test-key');
  const request = vi.fn().mockRejectedValue(new Error('timeout'));
  try {
    await new BolnaAdapter(request).api('/call', {});
    throw new Error('expected failure');
  } catch (e) {
    expect(e).toBeInstanceOf(DispatchError);
    expect((e as DispatchError).uncertain).toBe(true);
  }
  expect(request).toHaveBeenCalledTimes(1);
});
it('provider server error is uncertain; client rejection is definitive', async () => {
  vi.stubEnv('BOLNA_API_KEY', 'unit-test-key');
  await expect(
    new BolnaAdapter(vi.fn().mockResolvedValue(new Response('', { status: 503 }))).api('/call', {}),
  ).rejects.toMatchObject({ uncertain: true });
  await expect(
    new BolnaAdapter(vi.fn().mockResolvedValue(new Response('', { status: 400 }))).api('/call', {}),
  ).rejects.toMatchObject({ uncertain: false });
});
it('signed capabilities reject modification', () => {
  vi.stubEnv('SESSION_SECRET', 'x'.repeat(64));
  const token = sign({ role: 'phone', expires: Date.now() + 10000 });
  expect(verify<{ role: string }>(token).role).toBe('phone');
  expect(() => verify(token.replace('phone', 'conductor') + 'x')).toThrow();
});
it('explains a provider verification rejection without disclosing its response or destination', async () => {
  vi.stubEnv('BOLNA_API_KEY', 'unit-test-key');
  const provider = new BolnaAdapter(
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { message: 'Trial number +19999999999 must be verified; private request details' },
          { status: 400 },
        ),
      ),
  );
  await expect(provider.api('/call', {})).rejects.toMatchObject({
    uncertain: false,
    message: 'Bolna returned HTTP 400. Verify the test destination in Bolna before trying again.',
  });
});
