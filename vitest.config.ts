import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests run against the workspace sources, never a stale `dist/` (DIS-23 design D6). The adapters
    // and the PHP analyzer are listed too since the CLI imports them by name (DIS-86 design D10).
    // `vitest.stryker.config.ts` inherits this alias through `mergeConfig`.
    alias: {
      '@codemind/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@codemind/adapter-git': fileURLToPath(new URL('./packages/adapters/git/src/index.ts', import.meta.url)),
      '@codemind/adapter-store-postgres': fileURLToPath(
        new URL('./packages/adapters/store-postgres/src/index.ts', import.meta.url),
      ),
      '@codemind/analyzer-php': fileURLToPath(new URL('./packages/analyzers/php/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // `.stryker-tmp/` holds Stryker sandboxes; an aborted run leaves one behind with a full copy of the suite.
    exclude: ['fixtures/**', 'node_modules/**', '.stryker-tmp/**'],
    passWithNoTests: true,
    // A worker thread ignores `process.env.TZ` assignments (only the main thread resets its time-zone
    // cache), so the seed build's time-zone scenario runs in a forked process (DIS-91 design D9).
    poolMatchGlobs: [['**/tests/integration/cli/seed-build.spec.ts', 'forks']],
  },
});
