import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import root from '../../../vitest.config';

// Spec: openspec/changes/informative-coverage/specs/test-quality-gates/spec.md → "Coverage informs and
// never blocks" and "Mutation score is the only hard gate" (design D2, D3, D5, D7). The workflows are
// parsed as YAML, never matched as text (as `e2e-job.spec.ts`).

const COVERAGE_COMMAND =
  'vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"';

const TIMED_SPECS = [
  'tests/unit/index/secret-scanner.linear.spec.ts',
  'tests/unit/index/secret-scanner.scaling.spec.ts',
  'tests/unit/explain/sanitize.linear.spec.ts',
  'tests/unit/explain/sanitize.scaling.spec.ts',
] as const;

interface Step {
  name?: string;
  run?: string;
  if?: string;
  'continue-on-error'?: unknown;
}

interface Job {
  steps?: Step[];
  'continue-on-error'?: unknown;
}

interface CoverageConfig {
  provider?: string;
  enabled?: unknown;
  thresholds?: unknown;
  reporter?: string[];
  reportsDirectory?: string;
  reportOnFailure?: unknown;
}

function jobsOf(file: string): Record<string, Job> {
  return (parse(readFileSync(resolve(file), 'utf8')) as { jobs: Record<string, Job> }).jobs;
}

function stepsOf(file: string, job: string): Step[] {
  return jobsOf(file)[job]?.steps ?? [];
}

describe('Coverage informs and never blocks', () => {
  it('Coverage is off by default and has no thresholds', () => {
    // Arrange
    const coverage = (root.test?.coverage ?? {}) as CoverageConfig;
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> };

    // Assert
    expect(coverage.provider).toBe('v8');
    expect(coverage.enabled).not.toBe(true);
    expect(coverage).not.toHaveProperty('thresholds');
    expect(coverage.reporter).toContain('json-summary');
    expect(coverage.reportsDirectory).toBe('coverage');
    expect(coverage.reportOnFailure).toBe(true);
    expect(pkg.scripts['test:coverage']).toBe(COVERAGE_COMMAND);
  });

  it('The wall-clock specs are excluded from every project when coverage is requested', async () => {
    // Arrange: the CLI `--exclude` does not reach the projects' own lists (design D7), so the config does
    const original = process.argv;
    const excludes = async (argv: string[]): Promise<string[][]> => {
      process.argv = argv;
      vi.resetModules();
      const config = (await import('../../../vitest.config')).default;
      const projects = (config.test?.projects ?? []) as { test?: { exclude?: string[] } }[];
      return [config.test?.exclude ?? [], ...projects.map((project) => project.test?.exclude ?? [])];
    };

    // The plain case must not inherit a `--coverage` of the process running this spec (CI runs it under coverage)
    const plain = original.filter((arg) => arg !== '--coverage' && !arg.startsWith('--coverage.'));

    try {
      // Act
      const withCoverage = await excludes([...plain, '--coverage']);
      const withoutCoverage = await excludes(plain);

      // Assert: the root and every project with its own `exclude` (the others inherit the root's) drop them
      // under coverage; plain runs keep them
      expect(withCoverage[0]).toEqual(expect.arrayContaining(['**/*.linear.spec.ts', '**/*.scaling.spec.ts']));
      expect(withCoverage.at(-1)).toEqual(expect.arrayContaining(['**/*.linear.spec.ts', '**/*.scaling.spec.ts']));
      for (const list of withCoverage.filter((own) => own.length > 0)) {
        expect(list).toEqual(expect.arrayContaining(['**/*.linear.spec.ts', '**/*.scaling.spec.ts']));
      }
      for (const list of withoutCoverage) {
        expect(list).not.toContain('**/*.linear.spec.ts');
        expect(list).not.toContain('**/*.scaling.spec.ts');
      }
    } finally {
      process.argv = original;
      vi.resetModules();
    }
  });

  it('The CI publishes coverage without blocking', () => {
    // Arrange
    const steps = stepsOf('.github/workflows/ci.yml', 'quality');
    const at = steps.findIndex((step) => step.run?.trim().replace(/^npx /, '') === COVERAGE_COMMAND);
    const summary = steps[at + 1];
    const timing = steps[at + 2];

    // Assert: the suite runs once with coverage, then the informative summary, then the timing budgets
    expect(at, 'the Tests step runs with coverage').toBeGreaterThanOrEqual(0);
    expect(steps[at]?.run?.trim()).toBe(`npx ${COVERAGE_COMMAND}`);
    expect(summary?.name).toBe('Coverage summary (informative)');
    expect(summary?.run).toContain('node scripts/coverage-summary.mjs coverage/coverage-summary.json');
    expect(summary?.run).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(summary?.['continue-on-error']).toBe(true);
    expect(summary?.if).toContain('!cancelled()');
    expect(summary?.if).toContain("steps.gate.outputs.run == 'true'");
    expect(timing?.name).toBe('Timing budgets');
    expect(timing?.if).toBe("steps.gate.outputs.run == 'true'");
    expect(timing?.run).not.toContain('--coverage');
    for (const file of TIMED_SPECS) expect(timing?.run, file).toContain(file);

    // Assert: no other step of either workflow passes `--coverage`
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/frontend.yml']) {
      for (const [job, { steps: jobSteps = [] }] of Object.entries(jobsOf(file))) {
        for (const step of jobSteps) {
          if (file.endsWith('ci.yml') && job === 'quality' && step.run === steps[at]?.run) continue;
          expect(step.run ?? '', `${file} ${job} ${step.name ?? ''}`).not.toContain('--coverage');
        }
      }
    }
  });
});

describe('Mutation score is the only hard gate', () => {
  it('The mutation gate stays hard', () => {
    // Arrange
    const stryker = JSON.parse(readFileSync(resolve('stryker.config.json'), 'utf8')) as {
      thresholds: { break: unknown };
      mutate: string[];
    };
    const mutation = jobsOf('.github/workflows/ci.yml').mutation;
    const strykerStep = (mutation?.steps ?? []).find((step) => step.run?.includes('npm run test:mutation'));

    // Assert
    expect(typeof stryker.thresholds.break).toBe('number');
    expect(stryker.thresholds.break as number).toBeGreaterThanOrEqual(70);
    expect(stryker.mutate).toContain('packages/core/src/**/*.ts');
    expect(mutation, 'the mutation job exists').toBeDefined();
    expect(mutation).not.toHaveProperty('continue-on-error');
    expect(strykerStep, 'the step that runs Stryker exists').toBeDefined();
    expect(strykerStep).not.toHaveProperty('continue-on-error');
  });
});
