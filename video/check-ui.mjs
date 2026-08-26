/**
 * Fast sanity check that the UI actually renders before a capture run.
 *
 * A blank page caused by a module error looks identical to a slow page from
 * the capture script's point of view — it just times out on a selector three
 * minutes later. This fails in seconds and prints the real reason.
 *
 *   node video/check-ui.mjs
 */

import { chromium } from 'playwright';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_URL = process.env.CHORUS_UI_URL ?? 'http://localhost:5173';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  try {
    await page.goto(UI_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    // Dependency pre-bundling on first load can take a while.
    await page.waitForSelector('section.panel', { timeout: 90_000 });

    const panels = await page.$$eval('section.panel h2', (els) => els.map((e) => e.textContent));
    const banner = await page.$eval('header .warn', (e) => e.textContent.trim()).catch(() => null);
    const agentUp = await page.evaluate(() =>
      fetch('http://127.0.0.1:3001/api/status')
        .then((r) => r.json())
        .catch((e) => ({ error: String(e) })),
    );

    console.log(`panels: ${JSON.stringify(panels)}`);
    console.log(`banner: ${banner ?? '(none)'}`);
    console.log(`agent:  ${JSON.stringify(agentUp)}`);

    await page.screenshot({ path: path.join(here, 'out', 'ui-check.png'), fullPage: true });
    console.log('screenshot: video/out/ui-check.png');

    if (errors.length > 0) {
      console.error('\nPage errors:');
      errors.forEach((e) => console.error(`  ${e}`));
      process.exitCode = 1;
    } else {
      console.log('No page errors.');
    }
  } finally {
    await browser.close();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
