import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "Which commands
// load .env", "One command starts the system", "Stopping the system and the Makefile" and
// "Configurable Postgres port" (DIS-102 design D2, D4–D7). Each test is one scenario, named after it.
// The files are read as JSON, YAML or source text; nothing is run.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The scripts of the `package.json` at `path` (relative to the repository root). */
function packageJson(path: string): { scripts: Record<string, string>; engines?: { node?: string } } {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as {
    scripts: Record<string, string>;
    engines?: { node?: string };
  };
}

/** The text of the file at `path` (relative to the repository root). */
function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/** The module specifiers a source text imports: static and dynamic imports, re-exports and `require`. */
function importSpecifiers(text: string): string[] {
  const patterns = [
    /\bimport\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"`;]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1]));
}

/** Every file under `directory` (absolute), recursively. */
function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** The `src` directories of the workspace packages (`packages/<name>/src` and `packages/<group>/<name>/src`). */
function packageSourceDirectories(): string[] {
  const packages = resolve(ROOT, 'packages');
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const directory = join(packages, entry.name);
      const nested = readdirSync(directory, { withFileTypes: true })
        .filter((child) => child.isDirectory() && child.name !== 'src' && child.name !== 'node_modules')
        .map((child) => join(directory, child.name, 'src'));
      return [join(directory, 'src'), ...nested];
    })
    .filter((directory) => existsSync(directory));
}

/** The `.mjs` files of `scripts/`, relative to the repository root. */
function scriptFiles(): string[] {
  return readdirSync(resolve(ROOT, 'scripts'))
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => `scripts/${name}`);
}

const PRELOADED = {
  cli: 'tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts',
  verify: 'tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts',
  'db:migrate': 'tsx packages/adapters/store-postgres/src/migrate.ts up',
  'db:rollback': 'tsx packages/adapters/store-postgres/src/migrate.ts down',
  'db:seed': 'tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts',
  'cache:build': 'tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/cache-build.ts',
  'seed:build': 'tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-build.ts',
} as const;

const QUALITY = [
  'test',
  'test:a11y',
  'test:mutation',
  'test:mutation:full',
  'lint',
  'lint:architecture',
  'typecheck',
  'docs:coverage',
] as const;

describe('Which commands load .env', () => {
  it("The guide's scripts load .env and the quality scripts do not", () => {
    // Arrange
    const root = packageJson('package.json');
    const api = packageJson('packages/api/package.json');

    // Assert: the guide's scripts preload .env and keep their program and arguments
    for (const [name, today] of Object.entries(PRELOADED)) {
      expect(root.scripts[name], name).toBe(today.replace(/^tsx /, 'tsx --import ./scripts/load-env.mjs '));
    }
    expect(api.scripts.dev).toBe(
      'node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts',
    );
    expect(root.scripts.up).toBe('node scripts/up.mjs');
    expect(root.scripts['demo:ask']).toBe('node scripts/demo-ask.mjs');
    expect(root.scripts['demo:excerpt']).toBe('node scripts/demo-excerpt.mjs');

    // Assert: the quality scripts and the tsx register never load it
    for (const name of QUALITY) expect(root.scripts[name], name).not.toContain('load-env');
    expect(source('packages/api/dev-register.mjs')).not.toContain('load-env');

    // Assert: engines unchanged, no Node .env API that the supported versions lack
    expect(root.engines?.node).toBe('>=20.11');
    for (const file of scriptFiles()) {
      const text = source(file);
      expect(text, file).not.toContain('process.loadEnvFile');
      expect(text, file).not.toContain('--env-file');
      expect(text, file).not.toMatch(/\bparseEnv\b[^;]*from\s+['"](node:)?util['"]/);
    }

    // Assert: up loads the root's .env itself, with the path passed by its entry guard (A15, A23)
    for (const [file, run] of [['scripts/up.mjs', 'runUp']] as const) {
      const text = source(file);
      const specifiers = importSpecifiers(text);
      expect(text, file).toMatch(/import\s*\{[^}]*\bDOTENV_PATH\b[^}]*\}\s*from\s*'\.\/env\.mjs'/);
      expect(specifiers, file).not.toContain('./load-env.mjs');
      const guard = new RegExp(`if \\(process\\.argv\\[1\\][^\\n]*\\{[\\s\\S]*?${run}\\(\\{[\\s\\S]*?dotenvPath: DOTENV_PATH`);
      expect(text, file).toMatch(guard);
    }

    // Assert: product code reads its configuration from the process environment only
    const offending = packageSourceDirectories()
      .flatMap(filesUnder)
      .filter((file) => /\.(c|m)?[jt]sx?$/.test(file))
      .flatMap((file) =>
        importSpecifiers(readFileSync(file, 'utf8'))
          .filter((specifier) => /scripts\/|load-env|\.env/.test(specifier))
          .map((specifier) => `${relative(ROOT, file)}: ${specifier}`),
      );
    expect(offending).toEqual([]);
  });
});

describe('One command starts the system', () => {
  it('The startup scripts need no installed dependency', () => {
    // Arrange
    const files = scriptFiles();

    // Act
    const specifiers = files.flatMap((file) =>
      importSpecifiers(source(file)).map((specifier) => ({ file, specifier })),
    );

    // Assert: a Node built-in, or a file of scripts/
    expect(files.length).toBeGreaterThan(0);
    const external = specifiers.filter(
      ({ specifier }) => !specifier.startsWith('node:') && !/^\.\/[^/]+\.mjs$/.test(specifier),
    );
    expect(external).toEqual([]);
    for (const { specifier } of specifiers.filter(({ specifier }) => specifier.startsWith('./'))) {
      expect(existsSync(resolve(ROOT, 'scripts', specifier)), specifier).toBe(true);
    }
  });
});
