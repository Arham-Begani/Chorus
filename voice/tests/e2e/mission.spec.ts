import { test, expect } from '@playwright/test';
test('mission lifecycle, revisions, evidence, refresh and approvals', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/app');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Open mission control' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
  // Mobile has a header action because the sidebar is collapsed.
  const newButton = page.getByRole('button', { name: 'New mission', exact: false });
  if (await newButton.isVisible()) await newButton.click();
  else await page.getByRole('button', { name: 'Create mission', exact: true }).click();
  await page.getByRole('button', { name: 'Propose mission' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bring the evening back together' }),
  ).toBeVisible();
  await expect(page.getByText('No phone calls are placed')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Talk to conductor', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Authorize simulated research' }).click();
  await expect(page.getByRole('button', { name: 'Approve proposed plan' })).toBeVisible({
    timeout: 60000,
  });
  const quotes = page.getByRole('table', { name: 'Current quote comparison' });
  await expect(quotes).toContainText('Confirmed');
  await expect(quotes.getByRole('row')).toHaveCount(4);
  await expect(quotes).toContainText('45 min');
  const checks = page.getByRole('region', { name: 'Plan checks', exact: true });
  await expect(checks).toContainText('4 of 4 checks pass');
  await expect(checks).toContainText('45 min setup');
  await expect(checks).toContainText('15 min before the start');
  await checks.screenshot({ path: `test-results/${info.project.name}-plan-checks.png` });
  await checks.getByRole('button', { name: 'Check sources', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Evidence drawer' }).getByRole('button', { name: /^Quotes/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
  await page.locator('#quotes').scrollIntoViewIfNeeded();
  await page
    .locator('#quotes')
    .screenshot({ path: `test-results/${info.project.name}-quotes.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const graph = page.locator('.graph');
  await expect(graph.locator('.flow-node')).toHaveCount(4);
  const visible = await graph.evaluate((e) => {
    const g = e.getBoundingClientRect();
    return [...e.querySelectorAll('.flow-node')].every((n) => {
      const r = n.getBoundingClientRect();
      return r.right > g.left && r.left < g.right && r.bottom > g.top && r.top < g.bottom;
    });
  });
  expect(visible).toBe(true);
  const missionUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Bring the evening back together' }),
  ).toBeVisible();
  expect(page.url()).toBe(missionUrl);
  await page.getByRole('button', { name: 'Edit budget and constraints' }).click();
  await page.getByLabel('Additional budget (INR)').fill('9000');
  await page
    .getByLabel('Reason for revision')
    .fill('User reduced the additional spending limit to INR 9,000');
  await page.getByRole('button', { name: 'Save new revision' }).click();
  await expect(page.getByText('REVISION 2', { exact: true })).toBeVisible();
  await expect(quotes).toContainText('Not received');
  await expect(quotes).not.toContainText('Confirmed');
  await expect(checks).toContainText('0 of 4 checks pass');
  await expect(checks).toContainText('the total is incomplete');
  await expect(checks).not.toContainText('Source attempts');
  await expect(page.getByRole('button', { name: 'Approve proposed plan' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Authorize simulated research' }).click();
  await expect(page.getByRole('button', { name: 'Approve proposed plan' })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Approve proposed plan' }).click();
  await expect(page.getByText('Plan approved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View evidence', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Evidence drawer' })).toBeVisible();
  await expect(page.getByText('Attempt ', { exact: false }).first()).toBeVisible();
  const evidence = page.getByRole('dialog', { name: 'Evidence drawer' });
  await evidence.getByRole('button', { name: /^Calls/ }).click();
  await expect(evidence).toContainText(
    'This mission runs in simulation. It places no phone calls.',
  );
  await evidence.getByRole('button', { name: /^Quotes/ }).click();
  await expect(evidence).toContainText('historical');
  await expect(evidence.getByRole('heading', { name: 'Event ledger' })).toHaveCount(0);
  await evidence.screenshot({ path: `test-results/${info.project.name}-evidence.png` });
  await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
  await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('.graph').scrollIntoViewIfNeeded();
  await page.locator('.graph').screenshot({ path: `test-results/${info.project.name}-graph.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${info.project.name}-mission.png`, fullPage: true });
  // Presentation-only malformed-length fixture: server evidence stays unchanged.
  await page.route(/\/api\/missions\/[a-f0-9-]+$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const value = await response.json();
    for (const contact of value.contacts) contact.name = 'Q'.repeat(80);
    for (const offer of value.offers) offer.description = 'R'.repeat(160);
    await route.fulfill({ response, json: value });
  });
  await page.reload();
  await page.getByRole('button', { name: 'View sources', exact: true }).click();
  const longEvidence = page.getByRole('dialog', { name: 'Evidence drawer' });
  await expect(longEvidence).toContainText('Q'.repeat(80));
  expect(await longEvidence.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
  expect(errors).toEqual([]);
});
test('unauthenticated requests cannot read missions or mint voice sessions', async ({
  request,
}) => {
  const r = await request.get('/api/missions');
  expect(r.status()).toBe(401);
  const s = await request.post('/api/missions/123e4567-e89b-42d3-a456-426614174000/voice', {
    data: {},
  });
  expect(s.status()).toBe(401);
});
