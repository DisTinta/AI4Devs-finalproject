import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * On Windows the kit's hook tests run after every other project with two workers (DIS-111). On Linux
 * (CI) they keep the default and run alongside the rest: there they never timed out, and running them
 * last made the CI `quality` job exceed its 10-minute limit.
 */
const HARNESS_POOL = process.platform === 'win32' ? { maxWorkers: 2, sequence: { groupOrder: 1 } } : {};

/**
 * Before any file of the projects that run database tests, refuses a test database holding committed
 * projects; does nothing without `DATABASE_URL` (DIS-110, integration-test-races design D9).
 */
const DATABASE_START_UP_CHECK = ['tests/integration/helpers/global-setup.ts'];

export default defineConfig({
  // The root config has no React plugin: compile the `.tsx` tests with the React 17+ JSX runtime
  // whatever tsconfig the transformer finds (DIS-58 design D23). Vite 8 transforms with Oxc, which
  // ignores the `esbuild` option when its own is set (DIS-105 design D8).
  oxc: { jsx: { runtime: 'automatic' } },
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
      '@codemind/analyzer-typescript': fileURLToPath(new URL('./packages/analyzers/typescript/src/index.ts', import.meta.url)),
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
    // The per-file pool and environment live in `test.projects` since Vitest 4 removed `poolMatchGlobs`
    // and `environmentMatchGlobs` (DIS-105 design D8). Each project extends this root config, so it keeps
    // the alias, `setupFiles`, `env`, timeouts and `exclude`; no file belongs to two projects.
    projects: [
      {
        // Only the web's component tests and the accessibility gate need a DOM (DIS-58 design D17).
        extends: true,
        test: {
          name: 'dom',
          include: ['packages/web/**/*.test.tsx', 'tests/a11y/**/*.{spec,test}.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        // A worker thread ignores `process.env.TZ` assignments (only the main thread resets its time-zone
        // cache), so the seed build's time-zone scenario runs in a forked process (DIS-91 design D9).
        extends: true,
        test: {
          name: 'seed-build',
          include: ['tests/integration/cli/seed-build.spec.ts'],
          environment: 'node',
          pool: 'forks',
          globalSetup: DATABASE_START_UP_CHECK,
        },
      },
      {
        // The kit's hook tests spawn bash scripts many times per test; on Windows, with the whole suite
        // in parallel, a few went past their timeouts (they pass alone and on CI). Two workers keep that
        // load bounded without running the 31 files one by one, about 48 min (DIS-111, DIS-9 E28).
        // Vitest runs projects with a different `maxWorkers` in different groups, so on Windows this one
        // runs after the others have finished (`HARNESS_POOL`).
        extends: true,
        test: {
          name: 'harness',
          include: ['tests/harness/**/*.{spec,test}.{ts,tsx}'],
          environment: 'node',
          ...HARNESS_POOL,
        },
      },
      {
        // Every other test, the web's `.test.ts` files included, keeps running in Node (DIS-58 design D17).
        // The root globs are restated, and the two sets above excluded, so the effective `exclude` is the
        // same whether Vitest concatenates or replaces the arrays.
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          globalSetup: DATABASE_START_UP_CHECK,
          exclude: [
            'fixtures/**',
            'node_modules/**',
            '.stryker-tmp/**',
            'packages/web/**/*.test.tsx',
            'tests/a11y/**/*.{spec,test}.{ts,tsx}',
            'tests/integration/cli/seed-build.spec.ts',
            'tests/harness/**',
          ],
        },
      },
    ],
    // DOM cleanup after each jsdom test and React Router's `Request` workaround (DIS-58 design D18, D26).
    setupFiles: ['tests/support/jsdom-setup.ts'],
    // The suite never reads the `.env` of whoever runs it: the processes the tests start (for example
    // `npm run db:rollback` in the migration specs) inherit this switch, so the `.env` preload leaves
    // their environment as the test set it (DIS-102 design D12). `vitest.stryker.config.ts` inherits it.
    env: { CODEMIND_SKIP_DOTENV: '1' },
  },
});
