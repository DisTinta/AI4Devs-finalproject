import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'fixtures/**',
      'seeds/**',
      '.stryker-tmp/**',
      'reports/**',
      // TypeDoc HTML output (gitignored); keep lint green after `docs:coverage`.
      'docs/api/**',
      // Tooling / agent-kit config, not application source.
      '.claude/**',
      '.cursor/**',
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      // Ports are intentionally empty stubs until Ticket 3+ fills them in.
      // Keep the signal as a warning so CI does not fail on scaffolding.
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
);
