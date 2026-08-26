/**
 * Drive the real UI and photograph it.
 *
 * This is the step that makes the video a demo rather than an illustration:
 * Playwright types into the actual app, which runs the actual compiled
 * circuits, and the screenshots are of whatever really happened. Nothing here
 * fabricates a state — if the register says count is 2, the screenshot says 2.
 *
 * It also records, for each shot, the real on-page position of the element the
 * video wants to point at, normalised to fractions of the image. The director
 * reads those to place its callouts. Hand-tuned callout coordinates were the
 * previous approach and they drifted the moment any panel changed height —
 * measuring beats guessing.
 *
 * Run the agent and the UI first:
 *   ~/chorus/run-local-agent.sh     (or run-agent.sh for testnet)
 *   ~/chorus/run-ui.sh
 *   node video/capture.mjs
 */

import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'capture');

const UI_URL = process.env.CHORUS_UI_URL ?? 'http://localhost:5173';

/** A handle unique to this recording, so the run starts from a clean count. */
const HANDLE = process.env.CHORUS_DEMO_HANDLE ?? `scammer-${Date.now().toString(36)}@upi`;

const reportPanel = 'section.panel:has(h2:text("Report"))';
const checkPanel = 'section.panel:has(h2:text("Check"))';

/** Collected per shot: where the interesting element actually is. */
const boxes = {};

/**
 * The real derivation, scraped off the page.
 *
 * The animated diagram in the video shows a handle turning into a commitment
 * and a nullifier. Those two values are read from the running app rather than
 * written into the timeline by hand, so the diagram cannot drift into showing
 * hashes that no longer correspond to anything — and cannot show invented ones.
 */
const readDerivation = async (page) => {
  const rows = await page
    .locator(`${reportPanel} .derivation .row`)
    .evaluateAll((els) =>
      els.map((el) => ({
        key: el.querySelector('.key')?.textContent?.trim() ?? '',
        val: el.querySelector('.val')?.textContent?.trim() ?? '',
      })),
    )
    .catch(() => []);

  const find = (key) => rows.find((r) => r.key.toLowerCase() === key)?.val;
  return {
    normalised: (find('normalised') ?? '').replace(/^'|'$/g, ''),
    commitment: find('commitment') ?? '',
    nullifier: find('nullifier') ?? '',
  };
};

/**
 * Screenshot the full page, and record the normalised position of `target`.
 *
 * Full page rather than viewport: the ledger panel sits below the fold, and
 * the video needs to pan down to it. Fractions rather than pixels: the
 * director scales the image to its frame, so only proportions survive.
 */
const shot = async (page, name, target) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });

  if (target !== undefined) {
    const rect = await page
      .locator(target)
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const doc = document.documentElement;
        const width = doc.scrollWidth;
        const height = doc.scrollHeight;
        return {
          x: (r.left + window.scrollX) / width,
          y: (r.top + window.scrollY) / height,
          w: r.width / width,
          h: r.height / height,
        };
      })
      .catch(() => null);

    if (rect) {
      boxes[name] = rect;
    }
  }

  console.log(`  captured ${name}.png${boxes[name] ? ' (+box)' : ''}`);
};

/** Type like a person, so the footage does not look like a paste. */
const typeHandle = async (page, selector, text) => {
  await page.fill(selector, '');
  await page.type(selector, text, { delay: 55 });
};

const selectReporter = async (page, id) => {
  await page.click(`${reportPanel} button.reporter:text("Reporter ${id}")`);
};

const submitAndSettle = async (page) => {
  await page.click(`${reportPanel} button.submit`);
  // Real work happens here: on testnet this is a proof and a transaction.
  await page.waitForSelector(
    `${reportPanel} .status.ok, ${reportPanel} .status.matched, ${reportPanel} .status.rejected, ${reportPanel} .status.failed`,
    { timeout: 300_000 },
  );
};

const run = async () => {
  await fs.mkdir(outDir, { recursive: true });
  console.log(`Capturing against ${UI_URL}`);
  console.log(`Demo handle: ${HANDLE}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto(UI_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector(reportPanel, { timeout: 120_000 });
    await shot(page, 'app-idle');

    // ---- Reporter A -----------------------------------------------------
    await selectReporter(page, 'A');
    await typeHandle(page, `${reportPanel} input`, HANDLE);
    await page.waitForSelector(`${reportPanel} .derivation .val.hash`, { timeout: 30_000 });
    await page.waitForTimeout(900);
    await shot(page, 'report-a-derived', `${reportPanel} .derivation`);
    const derived = await readDerivation(page);
    console.log(`  derived  commitment ${derived.commitment}`);
    console.log(`           nullifier  ${derived.nullifier}`);

    await submitAndSettle(page);
    await shot(page, 'report-a-submitted', `${reportPanel} .status`);
    await page.waitForTimeout(3_500); // let the ledger panel poll catch up
    await shot(page, 'ledger-after-a', 'section.panel.ledger');

    // ---- Reporter B -----------------------------------------------------
    await selectReporter(page, 'B');
    await typeHandle(page, `${reportPanel} input`, HANDLE);
    await page.waitForTimeout(900);
    await submitAndSettle(page);
    await shot(page, 'report-b-submitted', `${reportPanel} .status`);

    // ---- Reporter C: the threshold -------------------------------------
    await selectReporter(page, 'C');
    await typeHandle(page, `${reportPanel} input`, HANDLE);
    await page.waitForTimeout(900);
    await submitAndSettle(page);
    await page.waitForTimeout(3_500);
    await shot(page, 'report-c-matched', `${reportPanel} .status.matched`);

    // ---- Reporter C again: rejected by the contract ---------------------
    await typeHandle(page, `${reportPanel} input`, HANDLE);
    await page.waitForTimeout(900);
    await submitAndSettle(page);
    await shot(page, 'report-c-rejected', `${reportPanel} .status.rejected`);

    // ---- Check: the free half ------------------------------------------
    await typeHandle(page, `${checkPanel} input`, HANDLE);
    await page.waitForSelector(`${checkPanel} .status.matched`, { timeout: 60_000 });
    await page.waitForTimeout(600);
    await shot(page, 'check-matched', `${checkPanel} .status.matched`);

    await typeHandle(page, `${checkPanel} input`, 'someone-elses-shop@upi');
    await page.waitForSelector(`${checkPanel} .status.ok`, { timeout: 60_000 });
    await page.waitForTimeout(600);
    await shot(page, 'check-clean', `${checkPanel} .status.ok`);

    await fs.writeFile(
      path.join(outDir, 'capture.json'),
      `${JSON.stringify(
        { handle: HANDLE, capturedAt: new Date().toISOString(), url: UI_URL, derived, boxes },
        null,
        2,
      )}\n`,
    );

    console.log(`\nDone. ${Object.keys(boxes).length} annotated shots in ${outDir}`);
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
