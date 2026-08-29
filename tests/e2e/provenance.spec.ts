import { expect, test } from '@playwright/test';
import { answerUntilDiagnosis, runDemoCase } from './helpers';

const DISCLOSURE = 'Independent prototype — not an official government service.';

test('every route carries the disclosure strip and a badge for every fact row', async ({ page }) => {
  const statics = ['/', '/start', '/demo', '/about'];
  for (const path of statics) {
    await page.goto(path);
    await expect(page.getByText(DISCLOSURE)).toBeVisible();
  }

  await runDemoCase(page, 1);
  await answerUntilDiagnosis(page, ['Shows returned', 'Linked but not for benefits']);

  const base = page.url().replace(/\/diagnosis$/, '');
  for (const path of ['', '/diagnosis', '/actions', '/verify', '/timeline']) {
    await page.goto(`${base}${path}`);
    await expect(page.getByText(DISCLOSURE)).toBeVisible();
    const rows = await page.locator('[data-fact-row]').count();
    const badges = await page.locator('[data-provenance]').count();
    expect(badges, `${path}: ${rows} fact rows, ${badges} badges`).toBeGreaterThanOrEqual(rows);
  }
});
