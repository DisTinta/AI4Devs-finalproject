import { defineConfig } from '@playwright/test';
import { e2eConfigOptions } from './tests/e2e/support/config-options';

/**
 * Playwright configuration of the end-to-end suite (spec: openspec/changes/e2e-playwright-suite, capability
 * `e2e-suite`; design D3, D10). It only applies `defineConfig` to the options module, which
 * `tests/unit/ci/e2e-config.spec.ts` checks; the options themselves live in
 * `tests/e2e/support/config-options.ts`.
 */
export default defineConfig(e2eConfigOptions);
