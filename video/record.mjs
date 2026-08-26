/**
 * SUPERSEDED by render.mjs. Kept only as a record of what did not work.
 *
 * This plays the timeline in real time and lets Chromium's built-in recorder
 * capture it. It produces a watchable file, and the file judders.
 *
 * The recorder screencasts at whatever rate the page actually paints. A
 * 1920x1080 stage with a 90px-blur aurora does not paint at a steady 60Hz on
 * any machine, and when a frame is late the recorder repeats the previous one.
 * So frame timing comes out of the compositor's back pressure rather than out
 * of the timeline — which is the definition of judder, and no amount of
 * flag-tuning below fixes it, because the flags cannot make the page paint
 * faster than it paints.
 *
 * The failure is also invisible to any check that asks "is there a picture":
 * the file claims a constant frame rate and every frame has content in it. It
 * is only visible in motion, or by counting repeated frames — which is what
 * verify.mjs now does.
 *
 * render.mjs inverts the relationship: it asks for each frame by number and
 * waits as long as that takes. Use that instead.
 *
 *   node video/render.mjs
 */

import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVideoDir } from './serve.mjs';
import { totalDuration, WIDTH, HEIGHT } from './timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'out');

const run = async () => {
  await fs.mkdir(outDir, { recursive: true });

  const server = await serveVideoDir();
  console.log(`Director served at ${server.url}`);

  const duration = totalDuration();
  console.log(`Timeline is ${duration.toFixed(1)}s`);
  if (duration > 120) {
    console.warn(`WARNING: over the two-minute limit by ${(duration - 120).toFixed(1)}s`);
  }

  const browser = await chromium.launch({
    // Headless: a headed window can be closed, resized or occluded mid-take,
    // and it crashed outright on this machine. Video recording works either way.
    headless: true,
    args: [
      // Steadier frame pacing while recording: without these Chromium throttles
      // and drops frames during long animations.
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: outDir, size: { width: WIDTH, height: HEIGHT } },
  });

  const page = await context.newPage();

  try {
    await page.goto(server.url, { waitUntil: 'load' });

    // Wait for capture images and webfonts, or the opening frames record a
    // half-drawn page.
    await page.waitForFunction(() => typeof window.__play === 'function');
    await page.evaluate(() => window.__ready);
    await page.waitForTimeout(600);

    console.log('Recording...');
    await page.evaluate(() => window.__play());
    await page.waitForTimeout(500);
    console.log('Playback complete.');
  } finally {
    const video = page.video();

    // Order matters: closing the context finalizes the video file, but closing
    // the BROWSER first invalidates the handle and saveAs fails with "target
    // has been closed". Save in between.
    await context.close();

    if (video) {
      const target = path.join(outDir, 'chorus-demo.webm');
      await fs.rm(target, { force: true });
      await video.saveAs(target);
      await video.delete();
      const { size } = await fs.stat(target);
      console.log(`\nWrote ${target} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    }

    await browser.close();
    await server.close();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
