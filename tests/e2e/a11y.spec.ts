import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerUntilDiagnosis, runDemoCase } from './helpers';

/** testing.md §3: zero serious or critical violations on every screen a student sees. */
async function scan(page: Page, label: string) {
  // The rail fades in over 400ms. Scanning mid-fade reports every element inside it as
  // low contrast, because at that instant it genuinely is. Let the motion settle first.
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'), null, { timeout: 5_000 })
    .catch(() => {});

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id} (${v.impact}) — ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`),
    label,
  ).toEqual([]);
}

test('the public screens have no serious or critical violations', async ({ page }) => {
  for (const path of ['/', '/start', '/demo', '/about']) {
    await page.goto(path);
    await scan(page, path);
  }
});

test('every screen of a live case has no serious or critical violations', async ({ page }) => {
  await runDemoCase(page, 1);
  const base = page.url();
  await scan(page, 'case root');

  await page.goto(`${base}/questions`);
  await scan(page, 'questions');

  // Answer through to a diagnosis so the later screens have real content to scan.
  for (let i = 0; i < 6; i++) {
    if (!(await page.getByText(/^Question \d+ —/).count())) break;
    await page.getByRole('button', { name: 'Shows returned' }).or(page.getByRole('button', { name: /I don.t know/ })).first().click();
    await page.waitForTimeout(500);
  }

  for (const tab of ['/diagnosis', '/actions', '/verify', '/timeline']) {
    await page.goto(`${base}${tab}`);
    await scan(page, tab);
  }
});

test('case 1 is reachable with the keyboard alone', async ({ page }) => {
  await runDemoCase(page, 1);

  // Tab to the Continue link and follow it without ever touching the mouse.
  const link = page.getByRole('link', { name: 'Continue' });
  await expect(link).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await link.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(link).toBeFocused();
  // A visible focus ring is the whole point of keyboard reach.
  expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/questions$/);

  // Answer the question from the keyboard too.
  const answer = page.locator('button[data-answer]').first();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await answer.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(answer).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Question \d+ —/).or(page.getByRole('heading', { name: /What we think|narrow this down/i })).first())
    .toBeVisible({ timeout: 30_000 });
});
