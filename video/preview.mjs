/**
 * Smoke test for the director.
 *
 * Screenshots one frame per beat instead of recording the whole timeline, so a
 * layout or typo regression shows up in seconds rather than after a two-minute
 * render. Frames land in `out/preview/`.
 *
 *   node video/preview.mjs
 */

import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVideoDir } from './serve.mjs';
import { withOffsets, WIDTH, HEIGHT } from './timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'out', 'preview');

const run = async () => {
  await fs.mkdir(outDir, { recursive: true });
  const server = await serveVideoDir();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  // Missing capture/*.png is the normal state before `npm run capture` has
  // ever run, and the director has a visible fallback for it. Treating it as a
  // failure would mean the smoke test cries wolf every time, which is how a
  // real error ends up ignored.
  const errors = [];
  const missing = new Set();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404|Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  // Scenes are rebuilt per beat, so a shot that 404s early is gone from the DOM
  // by the time the last frame renders. Collect them from the network instead.
  page.on('response', (r) => {
    if (r.status() === 404) missing.add(new URL(r.url()).pathname.replace(/^\//, ''));
  });

  try {
    await page.goto(server.url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__seek === 'function', { timeout: 15_000 });
    await page.evaluate(() => window.__ready);

    for (const beat of withOffsets()) {
      // Mid-beat, past the entrance animation and before the exit fade.
      const t = beat.start + Math.min(beat.duration * 0.55, beat.duration - 0.6);
      await page.evaluate((time) => window.__seek(time), t);
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(outDir, `${String(beat.start).padStart(3, '0')}-${beat.id}.png`) });
      console.log(`  ${beat.id.padEnd(16)} t=${t.toFixed(1)}s`);
    }

    console.log(`\nWrote ${withOffsets().length} frames to ${outDir}`);

    if (missing.size > 0) {
      console.log(`\nNot yet captured (expected before 'npm run capture'):`);
      [...missing].sort().forEach((m) => console.log(`  ${m}`));
    }

    if (errors.length > 0) {
      console.error('\nPage errors:');
      errors.forEach((e) => console.error(`  ${e}`));
      process.exitCode = 1;
    } else {
      console.log('No page errors.');
    }
  } finally {
    await browser.close();
    await server.close();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
