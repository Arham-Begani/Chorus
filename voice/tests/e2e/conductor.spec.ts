import { test, expect } from '@playwright/test';
async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Open mission control' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
}
test('number-free typed conductor creates, revises, pauses and restores a persisted mission', async ({
  page,
}, info) => {
  await login(page);
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Browser conductor' });
  await expect(dialog).toBeVisible();
  await page
    .getByLabel('Message your conductor')
    .fill(
      'Rent sound equipment and arrange delivery for 40 people tomorrow at 7 pm under 8000 rupees',
    );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(dialog.getByRole('log')).toContainText('I drafted a simulation');
  await page.getByLabel('Message your conductor').fill('Lower the budget to seven thousand rupees');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(dialog.getByRole('log')).toContainText('Updated budget in revision 2');
  await page.getByLabel('Message your conductor').fill('Pause');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(dialog.getByRole('log')).toContainText('Mission paused.');
  await expect(dialog.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-conductor.png` });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  const url = page.url();
  await page.reload();
  expect(page.url()).toBe(url);
  await expect(page.getByText('REVISION 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  await expect(dialog.getByRole('log')).toContainText('You · typed');
  await page.getByLabel('Message your conductor').fill('Resume');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(dialog.getByRole('log')).toContainText('Mission resumed.');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Authorize simulated research' }).click();
  await expect(page.getByRole('button', { name: 'Approve proposed plan' })).toBeVisible({
    timeout: 60000,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('speech-recognition results use the actual conductor API; denied microphones retain typed control', async ({
  page,
}) => {
  // This is a recognition protocol test double, never a claim of a live microphone recording.
  await page.addInitScript(() => {
    class Recognition {
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      start() {
        this.onstart?.();
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [
              {
                isFinal: true,
                0: {
                  transcript:
                    'Rent sound equipment and arrange delivery for 40 people tomorrow at 6 pm under 8000 rupees',
                },
              },
            ],
          });
          this.onend?.();
        }, 30);
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: Recognition });
  });
  await login(page);
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('You · microphone');
  await expect(page.getByRole('log')).toContainText('I drafted a simulation');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.addInitScript(() => {
    class Denied {
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onerror?.({ error: 'not-allowed' });
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: Denied });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Talk to conductor', exact: true }).click();
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Browser conductor' }).getByRole('alert'),
  ).toContainText('Microphone access was denied');
  await page.getByLabel('Message your conductor').fill('What is the status?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('log')).toContainText('INR 8,000 maximum');
  await page.getByRole('button', { name: 'Close dialog' }).click();
});
