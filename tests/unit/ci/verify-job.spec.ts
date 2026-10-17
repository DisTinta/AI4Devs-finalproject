import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Spec: openspec/changes/verify-smoke/specs/verify-smoke/spec.md → "Verify runs in a CI job of its
// own". The workflow is parsed as YAML (amendment A5), never matched as text.

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
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

const VERIFY_URL = 'postgres://postgres:postgres@localhost:5432/verify';

function workflow(): { jobs: Record<string, Job> } {
  return parse(readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> };
}

/** The index of the first step whose command is exactly `command`, or -1. */
function stepIndex(steps: Step[], command: string): number {
  return steps.findIndex((step) => step.run?.trim() === command);
}

describe('CI workflow', () => {
  it('The CI workflow runs verify in a job of its own', () => {
    // Arrange
    const { jobs } = workflow();
    const verify = jobs.verify;

    // Assert: the job, its condition and its own database
    expect(verify).toBeDefined();
    expect([verify.needs].flat()).toContain('scope');
    expect(verify.if).toBe(jobs.quality.if);
    const services = Object.values(verify.services ?? {});
    expect(services).toHaveLength(1);
    expect(services[0].image).toBe('pgvector/pgvector:pg16');
    expect(services[0].env?.POSTGRES_DB).toBe('verify');

    // Assert: the steps, in order, with the verify database where they need one
    const steps = verify.steps ?? [];
    const order = ['npm ci', 'npm run db:migrate', 'npm run db:seed', 'npm run verify'].map((command) => stepIndex(steps, command));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const index of order.slice(1)) expect(steps[index].env?.DATABASE_URL ?? verify.env?.DATABASE_URL).toBe(VERIFY_URL);

    // Assert: no model variable, no continue-on-error
    const variables = [verify.env ?? {}, ...steps.map((step) => step.env ?? {})].flatMap((env) => Object.keys(env));
    expect(variables.filter((name) => name.startsWith('LLM_'))).toEqual([]);
    expect(verify['continue-on-error']).toBeUndefined();
    expect(steps.filter((step) => step['continue-on-error'] !== undefined)).toEqual([]);

    // Assert: no other job on the verify database; quality keeps its unseeded test database
    for (const [name, job] of Object.entries(jobs)) {
      if (name === 'verify') continue;
      const databases = Object.values(job.services ?? {}).map((service) => service.env?.POSTGRES_DB);
      expect(databases).not.toContain('verify');
    }
    expect(Object.values(jobs.quality.services ?? {}).map((service) => service.env?.POSTGRES_DB)).toEqual(['test']);
    expect((jobs.quality.steps ?? []).filter((step) => step.run?.includes('db:seed'))).toEqual([]);

    // Assert: scope looks at verify's previous result as it does at quality's and mutation's
    const decide = (jobs.scope.steps ?? []).map((step) => step.run ?? '').join('\n');
    expect(decide).toMatch(/for job in quality mutation verify; do/);
  });

  it('gives verify no LLM_* variable from the workflow level either', () => {
    // Arrange
    const parsed = parse(readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')) as { env?: Record<string, string> };

    // Assert: a workflow-level env would reach every job, verify included
    expect(Object.keys(parsed.env ?? {}).filter((name) => name.startsWith('LLM_'))).toEqual([]);
  });
});
