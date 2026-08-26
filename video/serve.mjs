/**
 * A ~40 line static file server for the director page.
 *
 * The director is an ES module, so it cannot be opened over `file://` — the
 * browser blocks module imports from that scheme. Rather than add a dependency
 * for this, serve the directory over HTTP on an ephemeral port.
 */

import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
  '.json': 'application/json',
};

export const serveVideoDir = async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '') || 'director.html';
    const target = path.resolve(here, rel);

    // Never serve outside the video directory.
    if (!target.startsWith(here)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.readFile(target)
      .then((body) => {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(404).end('not found');
      });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/director.html`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
