import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The root config has no React plugin: compile the `.tsx` tests with the React 17+ JSX runtime
  // whatever tsconfig esbuild finds (DIS-58 design D23).
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Tests run against the workspace sources, never a stale `dist/` (DIS-23 design D6). The adapters
    // and the PHP analyzer are listed too since the CLI imports them by name (DIS-86 design D10); the
    // LLM adapter because its tests do (DIS-17 design D8).
    // `vitest.stryker.config.ts` inherits this alias through `mergeConfig`.
    alias: {
      '@codemind/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@codemind/adapter-git': fileURLToPath(new URL('./packages/adapters/git/src/index.ts', import.meta.url)),
      '@codemind/adapter-llm': fileURLToPath(new URL('./packages/adapters/llm/src/index.ts', import.meta.url)),
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
    // The Git integration specs spawn `git` many times per test; under the full suite's load on Windows
    // a few of them took longer than the 5 s default (they pass alone). A slower machine is not a bug.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // A worker thread ignores `process.env.TZ` assignments (only the main thread resets its time-zone
    // cache), so the seed build's time-zone scenario runs in a forked process (DIS-91 design D9).
    poolMatchGlobs: [['**/tests/integration/cli/seed-build.spec.ts', 'forks']],
    // Only the web's component tests and the accessibility gate need a DOM; every other test, the web's
    // `.test.ts` files included, keeps running in Node (DIS-58 design D17).
    environmentMatchGlobs: [
      ['**/packages/web/**/*.test.tsx', 'jsdom'],
      ['**/tests/a11y/**', 'jsdom'],
    ],
    // DOM cleanup after each jsdom test and React Router's `Request` workaround (DIS-58 design D18, D26).
    setupFiles: ['tests/support/jsdom-setup.ts'],
    // The suite never reads the `.env` of whoever runs it: the processes the tests start (for example
    // `npm run db:rollback` in the migration specs) inherit this switch, so the `.env` preload leaves
    // their environment as the test set it (DIS-102 design D12). `vitest.stryker.config.ts` inherits it.
    env: { CODEMIND_SKIP_DOTENV: '1' },
  },
});
