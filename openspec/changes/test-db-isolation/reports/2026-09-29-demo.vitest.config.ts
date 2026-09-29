// Vitest config for the show-spec-working driver of test-db-isolation only (see 2026-09-29-demo.ts).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['openspec/changes/test-db-isolation/reports/2026-09-29-demo.ts'],
  },
});
