import { expect, test } from '@playwright/test';

/**
 * testing.md §3: the screenshot path. The suite runs with no model key, so no image can
 * be read — which is exactly the branch the student must be told about rather than left
 * to assume their screenshot was understood.
 */

// A real 1x1 PNG. Written inline so there is no binary fixture to keep in the repo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const NOT_AN_IMAGE = Buffer.from('%PDF-1.7 this is not an image at all');

async function newCase(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/cases', { data: {} });
  return ((await res.json()) as { token: string }).token;
}

test('a valid screenshot is accepted and named back as unreadable offline', async ({ request }) => {
  const token = await newCase(request);
  const res = await request.post(`/api/cases/${token}/intake`, {
    multipart: {
      description: 'post matric sanctioned since December, nothing in the account',
      files: { name: 'portal.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  // Accepted, and honest about what it could do with it.
  expect(body.unreadableFiles).toEqual(['portal.png']);
  // The text still produced facts, so the upload never blocks the journey.
  expect(body.facts.length).toBeGreaterThan(0);
});

test('the image itself is never stored', async ({ request }) => {
  const token = await newCase(request);
  await request.post(`/api/cases/${token}/intake`, {
    multipart: {
      description: 'sanctioned in December, no money has arrived in my account',
      files: { name: 'shot.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  const stored = await (await request.get(`/api/cases/${token}`)).text();
  expect(stored).not.toContain('data:image');
  expect(stored).not.toContain(PNG.toString('base64').slice(0, 32));
});

test('a file that is not an image is refused with the right code', async ({ request }) => {
  const token = await newCase(request);
  const res = await request.post(`/api/cases/${token}/intake`, {
    multipart: {
      description: 'sanctioned in December, no money has arrived in my account',
      files: { name: 'notes.png', mimeType: 'image/png', buffer: NOT_AN_IMAGE },
    },
  });
  expect(res.status()).toBe(415);
  expect((await res.json()).error.code).toBe('UPLOAD_UNSUPPORTED');
});

test('an oversized image is refused with the right code', async ({ request }) => {
  const token = await newCase(request);
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const res = await request.post(`/api/cases/${token}/intake`, {
    multipart: {
      description: 'sanctioned in December, no money has arrived in my account',
      files: { name: 'huge.png', mimeType: 'image/png', buffer: big },
    },
  });
  expect(res.status()).toBe(413);
  expect((await res.json()).error.code).toBe('UPLOAD_TOO_LARGE');
});

test('an unreadable screenshot offers the paste fallback instead of pretending', async ({ page }) => {
  await page.goto('/start');
  await page.getByLabel('In your own words').fill('post matric sanctioned since December, nothing has come to my account yet');
  await page.getByLabel('Upload a screenshot (optional)').setInputFiles({ name: 'portal.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start my case' }).click();

  const notice = page.getByRole('alert').filter({ hasText: 'portal.png' });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText('Paste exactly what the portal shows');

  // The case is not lost: the way forward is on screen.
  await notice.getByRole('link', { name: 'Continue to my case anyway' }).click();
  await page.waitForURL(/\/case\/[a-z0-9]{16}$/);
  await expect(page.getByRole('heading', { name: 'What we understood' })).toBeVisible();
});
