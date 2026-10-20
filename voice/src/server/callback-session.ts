export function sessionMinutes(value: string) {
  if (!/^\d+$/.test(value)) throw new Error('Use a whole number of minutes.');
  const minutes = Number(value);
  if (minutes < 1 || minutes > 60) throw new Error('Callback sessions last 1–60 minutes.');
  return minutes;
}

export function requireSimulationConfiguration(env: Record<string, string | undefined>) {
  if (env.SIMULATION_ONLY !== 'true' || env.ENABLE_REAL_CALLS !== 'false')
    throw new Error('Keep ordinary calling disabled before preparing callbacks.');
  if (!['http://localhost:3000', 'http://127.0.0.1:3000'].includes(env.APP_ORIGIN || ''))
    throw new Error('This callback session supports the local app on port 3000 only.');
}

export function tunnelOrigin(text: string) {
  return text.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/)?.[0];
}

export function callbackEnvironment(text: string, origin: string) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Expected the exact temporary HTTPS tunnel origin.');
  const matches = text.match(/^[ \t]*(?:export[ \t]+)?CHORUS_CALLBACK_ORIGIN[ \t]*=.*$/gm) || [];
  if (matches.length > 1)
    throw new Error('Duplicate callback origin settings; review .env privately.');
  const line = `CHORUS_CALLBACK_ORIGIN=${url.origin}`;
  return matches.length
    ? text.replace(/^[ \t]*(?:export[ \t]+)?CHORUS_CALLBACK_ORIGIN[ \t]*=[^\r\n]*/m, line)
    : text.trimEnd() + (text.includes('\r\n') ? '\r\n' : '\n') + line + '\n';
}
