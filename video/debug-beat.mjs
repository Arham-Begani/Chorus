/** Dump the director's computed geometry for one beat. */
import { chromium } from 'playwright';
import { serveVideoDir } from './serve.mjs';
import { withOffsets, WIDTH, HEIGHT } from './timeline.mjs';

const id = process.argv[2] ?? 'report-c';
const beat = withOffsets().find((b) => b.id === id);

const server = await serveVideoDir();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

await page.goto(server.url, { waitUntil: 'load' });
await page.evaluate(() => window.__ready);
await page.evaluate((t) => window.__seek(t), beat.start + beat.duration * 0.55);
await page.waitForTimeout(200);

console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const img = document.querySelector('.browser img');
      const vp = document.querySelector('.viewport');
      const co = document.querySelector('.callout');
      return {
        img: img ? { offsetH: img.offsetHeight, offsetW: img.offsetWidth, natural: img.naturalHeight, transform: img.style.transform } : null,
        viewport: vp ? { h: vp.clientHeight, w: vp.clientWidth } : null,
        callout: co ? { box: co.dataset.box, top: co.style.top, left: co.style.left, h: co.style.height, w: co.style.width } : null,
      };
    }),
    null,
    2,
  ),
);

await browser.close();
await server.close();
