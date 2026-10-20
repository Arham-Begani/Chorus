import { expect, it } from 'vitest';
import {
  callbackEnvironment,
  requireSimulationConfiguration,
  sessionMinutes,
  tunnelOrigin,
} from '../../src/server/callback-session';
it('bounds callback lifetimes and requires the local app with calling off', () => {
  expect(sessionMinutes('45')).toBe(45);
  for (const value of ['0', '61', '1.5', 'Infinity', '-1'])
    expect(() => sessionMinutes(value)).toThrow();
  const env = {
    APP_ORIGIN: 'http://localhost:3000',
    SIMULATION_ONLY: 'true',
    ENABLE_REAL_CALLS: 'false',
  };
  expect(() => requireSimulationConfiguration(env)).not.toThrow();
  expect(() => requireSimulationConfiguration({ ...env, ENABLE_REAL_CALLS: 'true' })).toThrow();
  expect(() =>
    requireSimulationConfiguration({ ...env, APP_ORIGIN: 'https://public.example' }),
  ).toThrow();
});
it('replaces only the callback origin and rejects deceptive origins and duplicate settings', () => {
  const original =
    'SIMULATION_ONLY=true\r\nCHORUS_CALLBACK_ORIGIN=https://old.example\r\nENABLE_REAL_CALLS=false\r\n';
  expect(callbackEnvironment(original, 'https://test-safe.trycloudflare.com')).toBe(
    original.replace('https://old.example', 'https://test-safe.trycloudflare.com'),
  );
  for (const origin of [
    'http://test.trycloudflare.com',
    'https://test.trycloudflare.com.evil.test',
    'https://test.trycloudflare.com/path',
    'https://user@test.trycloudflare.com',
    'https://test.trycloudflare.com:444',
  ])
    expect(() => callbackEnvironment(original, origin)).toThrow();
  expect(() =>
    callbackEnvironment(original + 'CHORUS_CALLBACK_ORIGIN=x\n', 'https://test.trycloudflare.com'),
  ).toThrow();
  expect(() =>
    callbackEnvironment(
      original + ' export CHORUS_CALLBACK_ORIGIN =x\n',
      'https://test.trycloudflare.com',
    ),
  ).toThrow();
  expect(tunnelOrigin('https://test-safe.trycloudflare.com connected')).toBe(
    'https://test-safe.trycloudflare.com',
  );
});
