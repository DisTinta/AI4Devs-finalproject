import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests run against the workspace sources, never a stale `dist/` (DIS-23 design D6).
    // `vitest.stryker.config.ts` inherits this alias through `mergeConfig`.
    alias: {
      '@codemind/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // `.stryker-tmp/` holds Stryker sandboxes; an aborted run leaves one behind with a full copy of the suite.
    exclude: ['fixtures/**', 'node_modules/**', '.stryker-tmp/**'],
    passWithNoTests: true,
  },
});
