import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis, runDemoCase } from './helpers';

test('the print stylesheet keeps the body and the disclaimer and hides navigation', async ({ page }) => {
  await runDemoCase(page, 1);
  await answerUntilDiagnosis(page, ['Shows returned', 'Linked but not for benefits']);
  await page.getByRole('link', { name: 'See what to do' }).click();
  await page.getByRole('button', { name: 'Generate letter' }).first().click();
  await page.waitForURL(/\/artifact\//, { timeout: 30_000 });

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Prepared with Scholarship Saathi, an independent prototype.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy text' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Case sections' })).toBeHidden();
});
