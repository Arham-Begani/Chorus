/**
 * Is the recording broken, or is the verifier broken?
 *
 * Records three seconds of a page that is unmistakably bright red, then reads
 * it back with exactly the same method verify.mjs uses. If this comes out
 * blank, the verifier is at fault. If it comes out red, recording works and
 * the real video should be inspected differently.
 */

import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'out', 'selftest');

const run = async () => {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // ---- record ----
  const b1 = await chromium.launch({ headless: true });
  const ctx = await b1.newContext({
    viewport: { width: 640, height: 360 },
    recordVideo: { dir: outDir, size: { width: 640, height: 360 } },
  });
  const p1 = await ctx.newPage();
  await p1.setContent('<body style="margin:0;background:#ff0000;width:640px;height:360px"></body>');
  await p1.waitForTimeout(3000);
  const vid = p1.video();
  await ctx.close();
  const target = path.join(outDir, 'red.webm');
  await vid.saveAs(target);
  await b1.close();

  const { size } = await fs.stat(target);
  console.log(`recorded red.webm: ${(size / 1024).toFixed(1)} KB`);

  // ---- read back ----
  const b2 = await chromium.launch({ headless: true });
  const p2 = await b2.newPage({ viewport: { width: 640, height: 360 } });
  await p2.goto(`file:///${target.replace(/\\/g, '/')}`);
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: path.join(outDir, 'direct-nav.png') });

  const px = await p2.evaluate(async () => {
    const v = document.querySelector('video');
    if (!v) return 'no video element';
    v.muted = true;
    await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 18;
    const ctx2 = c.getContext('2d');
    ctx2.drawImage(v, 0, 0, 32, 18);
    const d = ctx2.getImageData(0, 0, 32, 18).data;
    return `centre pixel rgba(${d[4 * (9 * 32 + 16)]}, ${d[4 * (9 * 32 + 16) + 1]}, ${d[4 * (9 * 32 + 16) + 2]}, ${d[4 * (9 * 32 + 16) + 3]})  videoW=${v.videoWidth} dur=${v.duration.toFixed(1)}`;
  });

  console.log(px);
  console.log(`screenshot: ${path.join(outDir, 'direct-nav.png')}`);
  await b2.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
