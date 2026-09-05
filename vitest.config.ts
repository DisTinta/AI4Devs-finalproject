import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['fixtures/**', 'node_modules/**'],
    passWithNoTests: true,
  },
});
