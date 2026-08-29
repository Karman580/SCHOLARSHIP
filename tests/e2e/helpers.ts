import { expect, type Page } from '@playwright/test';

export async function runDemoCase(page: Page, caseNo: 1 | 2 | 3) {
  await page.goto('/demo');
  const run = page.getByRole('button', { name: 'Run this case' }).nth(caseNo - 1);
  // The click only does anything once the button has hydrated, so give it a second go.
  for (let attempt = 0; attempt < 3; attempt++) {
    await run.click();
    try {
      await page.waitForURL(/\/case\/[a-z0-9]{16}$/, { timeout: 20_000 });
      break;
    } catch {
      if (attempt === 2) throw new Error('Run this case never navigated to a case.');
    }
  }
  await expect(page.getByRole('heading', { name: 'What we understood' })).toBeVisible({ timeout: 20_000 });
}

export function caseBase(page: Page): string {
  return page.url().replace(/\/(questions|diagnosis|actions|verify|timeline).*$/, '');
}

/**
 * Answers whatever question is on screen, preferring a listed label and falling back to
 * "I don't know" — which is exactly what a student who cannot answer would do.
 */
export async function answerUntilDiagnosis(page: Page, preferred: string[]) {
  await page.getByRole('link', { name: 'Continue' }).click();
  await page.waitForURL(/\/questions$/, { timeout: 20_000 });

  for (let i = 0; i < 6; i++) {
    if (/\/diagnosis$/.test(page.url())) break;
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    const before = await heading.textContent();

    let clicked = false;
    for (const label of preferred) {
      const btn = page.getByRole('button', { name: label, exact: true });
      if (await btn.count()) {
        await btn.first().click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.getByRole('button', { name: /I don.t know/ }).click();

    // Wait for the server to hand back either the next question or the diagnosis.
    await expect
      .poll(async () => (/\/diagnosis$/.test(page.url()) ? 'done' : await heading.textContent()), { timeout: 20_000 })
      .not.toBe(before);
  }

  if (!/\/diagnosis$/.test(page.url())) await page.goto(`${caseBase(page)}/diagnosis`);
  await expect(page.getByRole('heading', { name: 'Where it is stuck' })).toBeVisible({ timeout: 20_000 });
}

/** Every rendered fact row must be accompanied by a provenance badge. */
export async function expectProvenanceEverywhere(page: Page) {
  const rows = await page.locator('[data-fact-row]').count();
  const badges = await page.locator('[data-provenance]').count();
  expect(badges, `${rows} fact rows but ${badges} provenance badges`).toBeGreaterThanOrEqual(rows);
}
