import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * The options of the end-to-end suite (spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md;
 * design D3, D10). The root `playwright.config.ts` passes them to `defineConfig` unchanged. They live in
 * their own module, with a type-only import, so a Vitest test can load them without loading Playwright's
 * runtime (both define `Symbol.for('$$jest-matchers-object')`).
 */
export const e2eConfigOptions: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  // The specs share one API and one seeded database, and the ask and impact flows write `query_log` rows.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // The fields of `devices['Desktop Chrome']` the suite needs, written out (design D3).
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [
    {
      // The `dev` command of packages/api without `--watch`, so a file saved during a run does not restart it.
      command: 'node --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts',
      cwd: 'packages/api',
      url: 'http://127.0.0.1:3000/health',
      // Empty `LLM_*` win over `.env` (evaluation mode); the rest keeps `.env` from moving the API off the
      // address the web proxies to or from rate-limiting the suite (design D3).
      env: { LLM_BASE_URL: '', LLM_API_KEY: '', PORT: '3000', HOST: '127.0.0.1', RATE_LIMIT_MAX: '1000' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // `--strictPort`: a taken 5173 fails instead of moving to 5174, where the specs would not look.
      command: 'npm -w packages/web run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
};
