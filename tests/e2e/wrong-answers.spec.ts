import { expect, test } from '@playwright/test';
import { runDemoCase } from './helpers';

test('correcting a fact invalidates later answers and recomputes the ranking', async ({ page }) => {
  await runDemoCase(page, 1);
  await page.getByRole('link', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Shows returned' }).click();
  await page.waitForTimeout(600);

  const base = page.url().replace(/\/(questions|diagnosis)$/, '');
  await page.goto(base);

  const row = page.locator('[data-fact-row]').filter({ hasText: 'Aadhaar linked to the account' });
  await row.getByRole('button', { name: 'Correct this' }).click();
  await row.getByLabel('Correct Aadhaar linked to the account').selectOption('NO');

  // The correction wins over our reading, and the row now says the user is the source.
  await expect(row.getByRole('button', { name: 'Correct this' })).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('No');
  await expect(row).toContainText('You told us');

  // Editing a fact returns the case to questioning: no stale diagnosis is shown.
  await page.goto(`${base}/timeline`);
  await expect(page.getByText(/you corrected aadhaar linked to the account to no/i)).toBeVisible();
  await expect(page.getByText(/current state:/i)).toContainText('questioning');
});

test('opening a correction and changing nothing leaves the fact alone', async ({ page }) => {
  await runDemoCase(page, 1);
  const row = page.locator('[data-fact-row]').filter({ hasText: 'Aadhaar linked to the account' });
  await row.getByRole('button', { name: 'Correct this' }).click();
  await row.getByRole('button', { name: 'Cancel' }).click();
  await expect(row.getByRole('button', { name: 'Correct this' })).toBeVisible();
  await expect(row).toContainText('Yes');
});
