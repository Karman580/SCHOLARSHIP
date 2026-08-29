import { expect, test } from '@playwright/test';
import { runDemoCase } from './helpers';

test('no horizontal scroll at 320px on the core screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ['/', '/start', '/demo', '/about']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test('answer buttons are at least 56px tall and the primary action is reachable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await runDemoCase(page, 1);
  await page.getByRole('link', { name: 'Continue' }).click();

  // ui-ux.md §119: answer buttons 56px. Marked with data-answer so this measures the
  // answers and not whichever button happens to render first on the page.
  const answers = page.locator('button[data-answer]');
  await expect(answers.first()).toBeVisible();
  for (const b of await answers.all()) {
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  }

  // ui-ux.md §164: every other target still clears 44px.
  for (const b of await page.getByRole('button').all()) {
    const box = await b.boundingBox();
    if (box) expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
  }
});
