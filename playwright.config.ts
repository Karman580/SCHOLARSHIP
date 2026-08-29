import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel5', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // Serves the production build, not the dev server: a recompile mid-run turns into a
    // "Failed to fetch" that has nothing to do with the code under test.
    // Run `npm run build` first — `npm test:e2e` does not rebuild.
    command: 'npm run start',
    url: 'http://localhost:3000',
    // A stale dev server started with different settings would silently invalidate the
    // whole run, so the suite always brings up its own.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      // A whole suite runs from one address; the per-minute budgets are not what is
      // under test here. Both limits are configurable for exactly this reason.
      RATE_LIMIT_PER_MIN: '100000',
      MODEL_RATE_LIMIT_PER_MIN: '100000',
      // The suite runs offline on purpose. The model only rewords what the engine
      // decided, so with a key present these assertions would be checking a model's
      // phrasing instead of the engine's ranking. Blanking the key variables does not
      // work — Next refills an empty value from .env.local — so this is an explicit flag.
      AI_OFFLINE: 'true',
    },
  },
});
