import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis, runDemoCase } from './helpers';

const DESK_PHRASES = [/your file is (at|with) [A-Z]/, /we (have )?(checked|verified|confirmed)/i, /will be credited on/i];

test('case 2 ends in an honest escalation and never claims to know which office holds the file', async ({ page }) => {
  await runDemoCase(page, 2);
  await answerUntilDiagnosis(page, ['No record found']);

  const verdict = (await page.locator('h1').first().textContent()) ?? '';
  for (const p of DESK_PHRASES) expect(verdict).not.toMatch(p);

  await page.getByRole('link', { name: 'See what to do' }).click();
  await page.getByRole('button', { name: 'Generate letter' }).first().click();
  await page.waitForURL(/\/artifact\//, { timeout: 30_000 });
  const body = (await page.locator('.card').first().textContent()) ?? '';
  for (const p of DESK_PHRASES) expect(body).not.toMatch(p);

  await page.goBack();
  await page.getByRole('button', { name: 'Mark as done' }).first().click();
  await page.getByRole('link', { name: /check my case/i }).click();
  await page.getByRole('button', { name: 'They replied but could not give a payment reference' }).click();

  await expect(page.getByRole('heading', { name: /nothing moved yet/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Take it up a level' })).toBeVisible();
  await page.getByRole('button', { name: /Escalate and write the next letter/i }).click();
  await page.waitForURL(/\/artifact\//, { timeout: 30_000 });

  await page.goto(page.url().replace(/\/artifact\/.*$/, '/timeline'));
  await expect(page.getByText(/escalated/i).first()).toBeVisible();
});
