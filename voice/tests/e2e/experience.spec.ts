import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('/app');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Open mission control' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
}
test('landing example, FAQ and workspace entry are usable without an account', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Let the details');
  await page.getByRole('button', { name: 'Resolve timing' }).click();
  await expect(page.locator('.preview-result')).toContainText('5 pm');
  await page.getByRole('button', { name: 'Revise budget' }).click();
  await expect(page.locator('.preview-result')).toContainText('₹8,500');
  await page.getByRole('button', { name: 'Equipment & delivery', exact: true }).click();
  await expect(page.locator('.preview-agent')).toHaveCount(2);
  await page.getByText('Can I try it without making a phone call?', { exact: true }).click();
  await expect(page.locator('details[open]')).toContainText('without a phone number');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${info.project.name}-landing.png`, fullPage: true });
  await page.screenshot({ path: `test-results/${info.project.name}-landing-hero.png` });
  await page.getByRole('link', { name: 'Try a mission', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Open mission control' }).click();
  await expect(page.getByRole('dialog', { name: 'Browser conductor' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('lost conductor responses retry the same command without duplicating the committed mission', async ({
  page,
}) => {
  await login(page);
  const bodies: Record<string, unknown>[] = [];
  let committedId = '';
  await page.route('**/api/conductor', async (route) => {
    bodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (bodies.length === 1) {
      committedId = (await response.json()).mission.id;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Browser conductor' });
  const goal = 'Find a venue for 40 people tomorrow at 6 pm under 12000 rupees';
  await page.getByLabel('Message your conductor').fill(goal);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Connection interrupted');
  await expect(page.getByLabel('Message your conductor')).toHaveValue(goal);
  await page.getByRole('button', { name: 'Retry message', exact: true }).click();
  await expect(dialog.getByRole('log')).toContainText('already created a mission');
  await expect(page).toHaveURL(new RegExp(committedId));
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
});
test('stale revisions load the latest mission before the owner sends an edit again', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  await page
    .getByLabel('Message your conductor')
    .fill('Find a venue for 40 people tomorrow at 6 pm under 12000 rupees');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('I drafted');
  await page.route('**/api/conductor', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'The mission changed. Review the latest revision and send your command again.',
        code: 'REVISION_CONFLICT',
      }),
    });
  });
  await page.getByLabel('Message your conductor').fill('Lower the budget to 9000 rupees');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load latest mission' })).toBeVisible();
  await page.unroute('**/api/conductor');
  await page.getByRole('button', { name: 'Load latest mission' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Browser conductor' }).getByRole('alert'),
  ).toHaveCount(0);
  await expect(page.getByLabel('Message your conductor')).toHaveValue(
    'Lower the budget to 9000 rupees',
  );
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Updated budget in revision 2');
  const dialog = page.getByRole('dialog', { name: 'Browser conductor' });
  const close = dialog.getByRole('button', { name: 'Close dialog' }),
    send = dialog.getByRole('button', { name: 'Send message', exact: true });
  await expect(close).toBeInViewport();
  await expect(send).toBeInViewport();
  await close.click();
  await page.getByRole('button', { name: 'Review research', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Authorize simulated research' })).toBeInViewport();
});
test('saved mission URLs survive a truncated list and export a sourced brief', async ({ page }) => {
  await login(page);
  const response = await page.request.post('/api/missions', {
    data: { scenario: 'equipment', mode: 'simulation' },
  });
  expect(response.ok()).toBe(true);
  const m = await response.json();
  const edit = {
    revision: 1,
    constraints: { ...m.constraints, budgetMinor: 900000 },
    reason: 'Owner revised the limit',
  };
  expect((await page.request.post(`/api/missions/${m.id}/revise`, { data: edit })).status()).toBe(
    200,
  );
  expect(
    (
      await page.request.post(`/api/missions/${m.id}/revise`, {
        data: { ...edit, constraints: { ...m.constraints, budgetMinor: 1000000 } },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await (await page.request.get(`/api/missions/${m.id}`)).json()).constraints.budgetMinor,
  ).toBe(900000);
  await page.route('**/api/missions', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue(),
  );
  await page.goto('/?mission=' + m.id);
  await expect(page).toHaveURL('/app?mission=' + m.id);
  await expect(page.getByRole('heading', { name: m.title, exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export brief', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('revision-2.md');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const menu = page.getByLabel('Workspace menu');
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .locator('.workspace-menu')
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  }
});
test('a failed refresh retains the saved view and provides explicit reconnection', async ({
  page,
}) => {
  await login(page);
  await expect(page.locator('.mission-heading h1')).toBeVisible();
  const heading = await page.locator('.mission-heading h1').innerText();
  await page.route('**/api/missions', (route) => route.abort('failed'));
  await expect(page.getByText('Showing your last saved view.', { exact: true })).toBeVisible();
  await expect(page.locator('.mission-heading h1')).toHaveText(heading);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/missions');
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(page.locator('.sync-banner')).toHaveCount(0);
  await expect(page.locator('.mission-heading h1')).toHaveText(heading);
});
test('a stalled microphone times out and keeps the composer usable', async ({ page }) => {
  // Protocol test double: no hardware microphone or audio service is invoked.
  await page.addInitScript(() => {
    class Stalled {
      start() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: Stalled });
  });
  await login(page);
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  await page.clock.install();
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Starting microphone…', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(12001);
  const dialog = page.getByRole('dialog', { name: 'Browser conductor' });
  await expect(dialog.getByRole('alert')).toContainText('microphone did not start');
  await expect(dialog.getByRole('button', { name: 'Use microphone', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Message your conductor')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
});
test('successful login clears failed attempts while repeated wrong passwords remain limited', async ({
  request,
}, info) => {
  const headers = {
    'x-forwarded-for': info.project.name === 'desktop' ? '192.0.2.42' : '192.0.2.43',
  };
  const bad = () =>
    request.post('/api/auth', { headers, data: { password: 'incorrect-test-password' } });
  for (let i = 0; i < 7; i++) expect((await bad()).status()).toBe(401);
  expect(
    (
      await request.post('/api/auth', { headers, data: { password: process.env.DEMO_PASSWORD! } })
    ).status(),
  ).toBe(200);
  for (let i = 0; i < 8; i++) expect((await bad()).status()).toBe(401);
  expect((await bad()).status()).toBe(429);
});
