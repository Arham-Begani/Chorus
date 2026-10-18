import { createServer, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const toolNames = new Set([
  'propose_mission',
  'get_mission_brief',
  'report_observation',
  'submit_offer',
  'request_clarification',
  'request_approval',
  'update_mission_constraints',
  'initiate_approved_work',
]);
const maxBytes = 64000;
function respond(res: ServerResponse, status: number, error: string) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error }));
}

/** Exposes only authenticated provider callbacks. Never proxies dashboard, cookies or login. */
export function callbackGateway(options: {
  backend: string;
  toolSecret: string;
  webhookSecret: string;
}) {
  const backend = new URL(options.backend);
  if (
    !['http:', 'https:'].includes(backend.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname) ||
    backend.username ||
    backend.password ||
    backend.pathname !== '/' ||
    backend.search ||
    backend.hash
  )
    throw new Error('Callback backend must be a loopback HTTP origin');
  if (
    options.toolSecret.length < 32 ||
    options.webhookSecret.length < 32 ||
    options.toolSecret === options.webhookSecret
  )
    throw new Error('Set independent callback/tool secrets of at least 32 characters');
  const server = createServer(async (req, res) => {
    try {
      const path = req.url || '';
      const tool =
        path.startsWith('/api/tools/') && toolNames.has(path.slice('/api/tools/'.length));
      const webhook = path === '/api/bolna/webhook';
      if (!tool && !webhook) {
        req.resume();
        return respond(res, 404, 'Not found');
      }
      if (req.method !== 'POST') {
        req.resume();
        return respond(res, 405, 'POST required');
      }
      const header = tool ? 'x-chorus-tool-secret' : 'x-chorus-webhook-secret';
      const expected = Buffer.from(tool ? options.toolSecret : options.webhookSecret);
      const actual = Buffer.from(String(req.headers[header] || ''));
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        req.resume();
        return respond(res, 401, 'Callback authentication rejected');
      }
      if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) {
        req.resume();
        return respond(res, 415, 'JSON required');
      }
      if (Number(req.headers['content-length'] || 0) > maxBytes) {
        req.resume();
        return respond(res, 413, 'Request too large');
      }
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > maxBytes) {
          req.resume();
          return respond(res, 413, 'Request too large');
        }
        chunks.push(Buffer.from(chunk));
      }
      // Forward only the configured secret and JSON body, not incoming origin/cookie/proxy headers.
      const upstream = await fetch(new URL(path, backend), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [header]: expected.toString() },
        body: Buffer.concat(chunks),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const data = await upstream.text();
      res.writeHead(upstream.status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      if (!res.headersSent) respond(res, 502, 'Callback backend unavailable');
      else res.end();
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.maxConnections = 64;
  server.maxRequestsPerSocket = 100;
  return server;
}
