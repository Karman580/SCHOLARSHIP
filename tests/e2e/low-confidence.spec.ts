import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis } from './helpers';

test('almost no information lands honestly in LOW, not in a confident wrong answer', async ({ page }) => {
  await page.goto('/demo');
  await page.getByLabel('Describe a situation in your own words').fill('something is wrong with my scholarship i think');
  await page.getByRole('button', { name: 'Try it with my words' }).click();
  await page.waitForURL(/\/case\/[a-z0-9]{16}$/, { timeout: 45_000 });

  // Answer nothing at all: every question gets "I don't know".
  await answerUntilDiagnosis(page, []);

  await expect(page.getByRole('heading', { name: /can't safely narrow this down yet/i })).toBeVisible();
  await expect(page.getByText('Not enough information yet')).toBeVisible();
  // At LOW no stage may be marked as the blocker.
  await expect(page.locator('[data-stage-status="BLOCKED"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /What we don.t know/ })).toBeVisible();

  await page.getByRole('link', { name: 'See what to do' }).click();
  await expect(page.getByText(/This single check is what decides it/i)).toBeVisible();
});
