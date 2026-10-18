import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import type { Scope } from '../core/types';
export function sign(data: object) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${createHmac('sha256', config.secret).update(payload).digest('base64url')}`;
}
export function verify<T>(token: string): T {
  const [p, s] = token.split('.');
  if (!p || !s) throw new Error('Invalid token');
  const expect = createHmac('sha256', config.secret).update(p).digest('base64url');
  if (!equal(s, expect)) throw new Error('Invalid token');
  const v = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (!v.expires || v.expires < Date.now()) throw new Error('Session expired');
  return v;
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function cookie(req: Request, name: string) {
  return (
    req.headers
      .get('cookie')
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
      ?.slice(name.length + 1) || ''
  );
}
export function assertOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== config.origin) throw new Error('Origin rejected');
}
export async function user(req: Request) {
  if (config.local) {
    const host = new URL(req.url).hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
      throw new Error('Local auth requires loopback');
    const session = verify<{ id: string; expires: number }>(cookie(req, 'chorus_session'));
    return session.id;
  }
  if (process.env.AUTH_MODE !== 'supabase') throw new Error('Authentication is not configured');
  const token = cookie(req, 'chorus_access');
  if (!token) throw new Error('Sign in required');
  const { data, error } = await supabase().auth.getUser(token);
  if (error || !data.user) throw new Error('Sign in required');
  return data.user.id;
}
export function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    throw new Error('Supabase credentials missing');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function toolScope(req: Request, token: string) {
  const secret = process.env.BOLNA_TOOL_SECRET;
  if (!secret || !equal(req.headers.get('x-chorus-tool-secret') || '', secret))
    throw new Error('Tool authentication rejected');
  return verify<Scope>(token);
}
export function capability(scope: Omit<Scope, 'expires'>) {
  return sign({
    ...scope,
    expires: Date.now() + Math.max(60, Number(process.env.MAX_CALL_SECONDS || 180)) * 1000 + 120000,
  });
}
