// Vitest config used only by Stryker (`stryker.config.json` → `vitest.configFile`).
// Stryker mutates packages/core only, so it must not load the DB integration specs:
// tests/integration/store/support.ts throws on import when CI is set without DATABASE_URL (design D5).
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

export default mergeConfig(base, defineConfig({ test: { exclude: ['tests/integration/**'] } }));
