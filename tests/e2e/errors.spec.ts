import { expect, test } from '@playwright/test';

test('an unknown case token shows a recovery action, never a stack trace', async ({ page }) => {
  const res = await page.goto('/case/zzzzzzzzzzzzzzzz');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /cannot find this page/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start a new case' })).toBeVisible();
  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).not.toMatch(/at .*\(.*:\d+:\d+\)/);
});

test('the API refuses an unknown token without leaking whether it ever existed', async ({ request }) => {
  const res = await request.get('/api/cases/zzzzzzzzzzzzzzzz');
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error.code).toBe('CASE_NOT_FOUND');
  expect(JSON.stringify(body)).not.toMatch(/expired|deleted|existed/i);
});

test('the API rejects unknown keys and bad answers', async ({ request }) => {
  const bad = await request.post('/api/cases', { data: { language: 'en', surprise: true } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe('VALIDATION_ERROR');
});

test('health reports the store and the mode', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.seeded).toBe(true);
  expect(['model', 'fallback']).toContain(body.aiMode);
});

test('every mock government route flags itself as simulated', async ({ request }) => {
  const routes = [
    '/api/gov/nsp/application?applicationId=NSP-DEMO-1001',
    '/api/gov/pfms/payment?applicationId=NSP-DEMO-1001',
    '/api/gov/npci/mapper?aliasKey=ALIAS-DEMO-A',
    '/api/gov/bank/account?bankRefId=BANK-DEMO-A',
  ];
  for (const route of routes) {
    const res = await request.get(route);
    expect(res.status(), route).toBe(200);
    expect(res.headers()['x-saathi-simulated']).toBe('true');
    const body = await res.json();
    expect(body.simulated, route).toBe(true);
    expect(body.disclaimer, route).toContain('Not a government record');
  }
  const missing = await request.get('/api/gov/nsp/application?applicationId=NSP-NOPE');
  expect(missing.status()).toBe(200);
  expect((await missing.json()).found).toBe(false);
});
