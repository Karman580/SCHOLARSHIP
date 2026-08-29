import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis, expectProvenanceEverywhere, runDemoCase } from './helpers';

test('case 1 runs to a resolved case with the seeded-versus-enabled distinction intact', async ({ page }) => {
  await runDemoCase(page, 1);

  // The extractor must not read "aadhaar link hai" as DBT being enabled.
  await expect(page.getByText('Aadhaar linked to the account')).toBeVisible();
  // "aadhaar link hai" must not be read as DBT being enabled: it stays an open question,
  // listed under what we could not find rather than asserted as a fact.
  await expect(page.locator('[data-fact-row]').filter({ hasText: 'Account enabled for benefit payments' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'We could not find' })).toBeVisible();
  await expectProvenanceEverywhere(page);

  await answerUntilDiagnosis(page, ['Shows returned', 'Linked but not for benefits']);

  await expect(page.getByText('Fairly confident')).toBeVisible();
  await expect(page.locator('[data-stage-status="BLOCKED"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /What we don.t know/ })).toBeVisible();
  await expectProvenanceEverywhere(page);

  await page.getByRole('link', { name: 'See what to do' }).click();
  await expect(page.getByRole('heading', { name: 'What to do' })).toBeVisible();

  await page.getByRole('button', { name: 'Generate letter' }).first().click();
  await page.waitForURL(/\/artifact\//, { timeout: 30_000 });
  await expect(page.getByText('Draft for you to send. Not submitted.')).toBeVisible();
  await expect(page.getByText('Prepared with Scholarship Saathi, an independent prototype.')).toBeVisible();

  await page.goBack();
  await page.getByRole('button', { name: 'Mark as done' }).first().click();
  await page.getByRole('link', { name: /check my case/i }).click();

  await page.getByRole('button', { name: 'Bank filled the form and enabled it' }).click();
  await expect(page.getByRole('heading', { name: /demo records now show the credit/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Demo record').first()).toBeVisible();
  await expect(page.getByText(/No real payment happened/i)).toBeVisible();
});
