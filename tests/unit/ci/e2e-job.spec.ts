import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Spec: openspec/changes/e2e-playwright-suite/specs/e2e-suite/spec.md → "The end-to-end suite runs in a
// CI job of its own" (design D9, D10). The workflow is parsed as YAML, never matched as text (as
// `verify-job.spec.ts`).

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'continue-on-error'?: unknown;
}

interface Job {
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  services?: Record<string, { image: string; env?: Record<string, string> }>;
  steps?: Step[];
  'continue-on-error'?: unknown;
}

const E2E_URL = 'postgres://postgres:postgres@localhost:5432/e2e';

function jobs(): Record<string, Job> {
  return (parse(readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> }).jobs;
}

/** The index of the first step whose command is exactly `command`, or -1. */
function stepIndex(steps: Step[], command: string): number {
  return steps.findIndex((step) => step.run?.trim() === command);
}

describe('CI workflow', () => {
  it('The CI workflow runs the end-to-end suite in a job of its own', () => {
    // Arrange
    const all = jobs();
    const e2e = all.e2e;

    // Assert: the job, its condition and its own database
    expect(e2e).toBeDefined();
    expect([e2e.needs].flat()).toContain('scope');
    expect(e2e.if).toBe(all.quality.if);
    const services = Object.values(e2e.services ?? {});
    expect(services).toHaveLength(1);
    expect(services[0].image).toBe('pgvector/pgvector:pg16');
    expect(services[0].env?.POSTGRES_DB).toBe('e2e');

    // Assert: the steps, in order, with the e2e database where they need one
    const steps = e2e.steps ?? [];
    const commands = [
      'npm ci',
      'npx playwright install --with-deps chromium',
      'npm run db:migrate',
      'npm run db:seed',
      'npm run test:e2e',
    ];
    const order = commands.map((command) => stepIndex(steps, command));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const index of order.slice(2)) expect(steps[index].env?.DATABASE_URL ?? e2e.env?.DATABASE_URL).toBe(E2E_URL);

    // Assert: no model variable, no continue-on-error
    const variables = [e2e.env ?? {}, ...steps.map((step) => step.env ?? {})].flatMap((env) => Object.keys(env));
    expect(variables.filter((name) => name.startsWith('LLM_'))).toEqual([]);
    expect(e2e['continue-on-error']).toBeUndefined();
    expect(steps.filter((step) => step['continue-on-error'] !== undefined)).toEqual([]);

    // Assert: after the suite, a failure uploads the report and the results
    const upload = steps.slice(order[4] + 1).find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.if).toBe('failure()');
    const paths = String(upload?.with?.path ?? '').split(/\s+/);
    expect(paths).toContain('playwright-report/');
    expect(paths).toContain('test-results/');

    // Assert: no other job on the e2e database
    for (const [name, job] of Object.entries(all)) {
      if (name === 'e2e') continue;
      const databases = Object.values(job.services ?? {}).map((service) => service.env?.POSTGRES_DB);
      expect(databases).not.toContain('e2e');
    }

    // Assert: scope looks at e2e's previous result with the other three
    const decide = (all.scope.steps ?? []).map((step) => step.run ?? '').join('\n');
    const list = /for job in ([a-z0-9 ]+); do/.exec(decide)?.[1].split(' ') ?? [];
    expect(list).toEqual(expect.arrayContaining(['quality', 'mutation', 'verify', 'e2e']));
  });
});
