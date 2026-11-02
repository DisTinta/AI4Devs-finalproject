import { readdirSync, readFileSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaywrightTestConfig } from '@playwright/test';
import stryker from '../../../vitest.stryker.config';
import root from '../../../vitest.config';

// Spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md → "Vitest never runs the
// end-to-end specs" and "The suite starts its own API and web on the seed in evaluation mode" (design
// D6, D7, D10). The Playwright options module is imported here, never `playwright.config.ts`:
// `@playwright/test` and Vitest both define `Symbol.for('$$jest-matchers-object')`.

const SPEC = 'tests/e2e/ask-flow.spec.ts';

interface ProjectConfig {
  test?: { name?: string; include?: string[]; exclude?: string[] };
}

function project(name: string): NonNullable<ProjectConfig['test']> {
  const projects = (root.test?.projects ?? []) as ProjectConfig[];
  const found = projects.find((candidate) => candidate.test?.name === name);
  if (!found?.test) throw new Error(`Vitest project ${name} not found`);
  return found.test;
}

const matchesAny = (globs: string[] | undefined, file: string): boolean =>
  (globs ?? []).some((glob) => matchesGlob(file, glob));

/** The files of the program TypeScript resolves from a tsconfig, as repository-relative paths. */
function programFiles(tsconfig: string): string[] {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    resolve(tsconfig),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  if (!parsed) throw new Error(`${tsconfig} could not be resolved`);
  const base = resolve('.').replace(/\\/g, '/') + '/';
  return parsed.fileNames.map((name) => name.replace(/\\/g, '/').replace(base, ''));
}

describe('Vitest and type-check isolation of the end-to-end suite', () => {
  it('The Vitest configuration excludes tests/e2e', () => {
    // Arrange
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const specsOnDisk = readdirSync(resolve('tests/e2e')).filter((name) => name.endsWith('.spec.ts'));

    // Act
    const e2eFiles = programFiles('tests/e2e/tsconfig.json');
    const testsFiles = programFiles('tests/tsconfig.json');

    // Assert: the root and the node project exclude the specs; the other projects never include them
    expect(matchesAny(root.test?.exclude, SPEC)).toBe(true);
    expect(matchesAny(project('node').exclude, SPEC)).toBe(true);
    expect(project('node').include).toBeUndefined();
    for (const name of ['dom', 'seed-build', 'harness']) expect(matchesAny(project(name).include, SPEC), name).toBe(false);
    expect(matchesAny(stryker.test?.exclude, SPEC)).toBe(true);

    // Assert: the script and the type-check of the e2e tsconfig
    expect(packageJson.scripts['test:e2e']).toBe('playwright test');
    expect(packageJson.scripts.typecheck).toContain('tests/e2e/tsconfig.json');

    // Assert: the resolved programs, not the declared JSON
    expect(e2eFiles).toContain('playwright.config.ts');
    expect(e2eFiles).toContain('tests/e2e/support/config-options.ts');
    for (const spec of specsOnDisk) expect(e2eFiles).toContain(`tests/e2e/${spec}`);
    expect(testsFiles.filter((file) => /^tests\/e2e\/[^/]+\.spec\.ts$/.test(file))).toEqual([]);
  });
});

/** Loads the options module afresh with `CI` set to `ci`, so each `retries` branch is evaluated. */
async function loadOptions(ci: string): Promise<PlaywrightTestConfig> {
  vi.stubEnv('CI', ci);
  vi.resetModules();
  const module = (await import('../../e2e/support/config-options')) as { e2eConfigOptions: PlaywrightTestConfig };
  return module.e2eConfigOptions;
}

describe('Playwright configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('The Playwright configuration starts both servers in evaluation mode', async () => {
    // Arrange
    const withCi = await loadOptions('true');
    const options = await loadOptions('');
    const servers = [options.webServer ?? []].flat();
    const api = servers.find((server) => server.url?.includes(':3000'));
    const web = servers.find((server) => server.url?.includes(':5173'));
    const source = readFileSync(resolve('playwright.config.ts'), 'utf8');

    // Act: the statements of the root configuration, comments stripped
    const statements = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .split(';')
      .map((statement) => statement.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    // Assert: the root file only passes the options module to defineConfig, unchanged
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^import \{ defineConfig \} from '@playwright\/test'$/);
    expect(statements[1]).toMatch(/^import \{ e2eConfigOptions \} from '\.\/tests\/e2e\/support\/config-options'$/);
    expect(statements[2]).toBe('export default defineConfig(e2eConfigOptions)');

    // Assert: test directory, one Chromium project, base URL
    expect(options.testDir).toBe('tests/e2e');
    expect(options.projects).toHaveLength(1);
    expect(options.projects?.[0].use?.browserName).toBe('chromium');
    expect(options.use?.baseURL).toBe('http://127.0.0.1:5173');

    // Assert: exactly two web servers, the API in evaluation mode and the web with a strict port
    expect(servers).toHaveLength(2);
    // packages/api/src/server.ts: the command runs `src/server.ts` from `cwd` packages/api
    expect(api?.command).toMatch(/ src\/server\.ts$/);
    expect(api?.command).not.toContain('--watch');
    expect(api?.url).toBe('http://127.0.0.1:3000/health');
    expect(api?.cwd).toBe('packages/api');
    expect(api?.env).toEqual({
      LLM_BASE_URL: '',
      LLM_API_KEY: '',
      PORT: '3000',
      HOST: '127.0.0.1',
      RATE_LIMIT_MAX: '1000',
    });
    expect(web?.command).toContain('packages/web');
    expect(web?.command).toContain('--strictPort');
    expect(web?.url).toBe('http://127.0.0.1:5173');
    expect(api?.reuseExistingServer).toBe(false);
    expect(web?.reuseExistingServer).toBe(false);

    // Assert: retries in both branches, trace, screenshot and the reporter that never opens
    expect(withCi.retries).toBe(1);
    expect(options.retries).toBe(0);
    expect(options.use?.trace).toBe('retain-on-failure');
    expect(options.use?.screenshot).toBe('only-on-failure');
    expect(options.reporter).toContainEqual(['html', { open: 'never' }]);
  });
});
