import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis, runDemoCase } from './helpers';

/**
 * testing.md §3: with no model key, all three demo cases still complete and the
 * offline banner is on every screen. The suite's own server is started with both
 * provider keys empty (playwright.config.ts), so this is the state under test.
 */
const BANNER = 'Running in offline rules mode — answers are based on our built-in rules only.';

test('the offline banner is on every screen', async ({ page }) => {
  await page.goto('/api/health');
  expect(await page.locator('body').textContent()).toContain('"aiMode":"fallback"');

  for (const path of ['/', '/start', '/demo', '/about']) {
    await page.goto(path);
    await expect(page.getByText(BANNER), path).toBeVisible();
  }

  await runDemoCase(page, 1);
  const base = page.url();
  for (const tab of ['', '/questions', '/diagnosis', '/actions', '/verify', '/timeline']) {
    await page.goto(`${base}${tab}`);
    await expect(page.getByText(BANNER), tab || 'case root').toBeVisible();
  }
});

for (const caseNo of [1, 2, 3] as const) {
  test(`case ${caseNo} completes with no model available`, async ({ page }) => {
    await runDemoCase(page, caseNo);
    await answerUntilDiagnosis(page, ['Shows returned', 'No record found', 'Linked but not for benefits', 'Different']);

    // A verdict, a confidence band and the mandatory unknowns block, all from the rules.
    await expect(page.locator('h1').first()).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: /What we don.t know/ })).toBeVisible();
    await expect(page.getByText(/Fairly confident|Fairly sure|Not enough information yet|Most likely/).first()).toBeVisible();

    await page.getByRole('link', { name: 'See what to do' }).click();
    await expect(page.getByRole('heading', { name: 'What to do' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark as done' }).first()).toBeVisible();
  });
}
