// Vitest config used only by Stryker (`stryker.config.json` → `vitest.configFile`).
// Stryker mutates packages/core only, so it must not load the DB integration specs:
// tests/integration/helpers/db.ts (the DATABASE_URL gate, re-exported by store/support.ts) throws on
// import when CI is set without DATABASE_URL (DIS-11 design D5, moved there in DIS-22).
// The timed linear-time cases are excluded too: instrumented code is too slow for a wall-clock
// budget (DIS-84 design D14). They run in `npx vitest run` and in the CI Vitest step.
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

export default mergeConfig(
  base,
  defineConfig({ test: { exclude: ['tests/integration/**', 'tests/unit/index/secret-scanner.linear.spec.ts'] } }),
);
