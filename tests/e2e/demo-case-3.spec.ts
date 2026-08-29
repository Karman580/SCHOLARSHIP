import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis, runDemoCase } from './helpers';

test('case 3 keeps the runner-up visible and resolves with the name corrected', async ({ page }) => {
  await runDemoCase(page, 3);
  await answerUntilDiagnosis(page, ['Shows returned', 'Not used for over a year']);

  await expect(page.getByText('Possible')).toBeVisible();
  // At MEDIUM the runner-up is rendered expanded, not guessed away.
  await expect(page.getByText('What would prove this wrong:').first()).toBeVisible();

  await page.getByRole('link', { name: 'See what to do' }).click();
  await expect(page.getByText(/This one visit answers both possibilities/i)).toBeVisible();

  await page.getByRole('button', { name: 'Mark as done' }).first().click();
  await page.getByRole('link', { name: /check my case/i }).click();
  await page.getByRole('button', { name: 'Account reactivated, and the name is different' }).click();
  await expect(page.getByRole('heading', { name: /demo records now show the credit/i })).toBeVisible({ timeout: 30_000 });
});

test('case 3 also resolves on the branch where the name matches', async ({ page }) => {
  await runDemoCase(page, 3);
  await answerUntilDiagnosis(page, ['Shows returned', 'Not used for over a year']);
  await page.getByRole('link', { name: 'See what to do' }).click();
  await page.getByRole('button', { name: 'Mark as done' }).first().click();
  await page.getByRole('link', { name: /check my case/i }).click();
  await page.getByRole('button', { name: 'Account reactivated, name is the same' }).click();
  await expect(page.getByRole('heading', { name: /demo records now show the credit/i })).toBeVisible({ timeout: 30_000 });
});
