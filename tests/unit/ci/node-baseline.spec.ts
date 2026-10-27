import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Spec: openspec/changes/dis-105-npm-audit-debt/specs/local-startup/spec.md → "CI runs on the supported
// Node baseline". Both workflows are parsed as YAML, never matched as text (as `verify-job.spec.ts`).

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}

interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/frontend.yml'];

function setupNodeSteps(file: string): { job: string; step: Step }[] {
  const { jobs } = parse(readFileSync(resolve(file), 'utf8')) as Workflow;
  return Object.entries(jobs).flatMap(([job, { steps = [] }]) =>
    steps.filter((step) => step.uses?.startsWith('actions/setup-node@')).map((step) => ({ job, step })),
  );
}

describe('CI Node baseline', () => {
  it('Every CI job installs Node 22', () => {
    // Arrange
    const steps = WORKFLOWS.flatMap((file) => setupNodeSteps(file).map((found) => ({ file, ...found })));
    const engines = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { engines: { node: string } })
      .engines.node;

    // Assert: the four jobs that install Node (quality, verify, mutation, Frontend) all ask for 22
    expect(steps.map(({ file, job }) => `${file}:${job}`).sort()).toEqual([
      '.github/workflows/ci.yml:mutation',
      '.github/workflows/ci.yml:quality',
      '.github/workflows/ci.yml:verify',
      '.github/workflows/frontend.yml:frontend',
    ]);
    for (const { file, job, step } of steps) expect(step.with?.['node-version'], `${file}:${job}`).toBe('22');
    // Assert: the major of the lower bound of engines.node is the one CI installs
    expect(/^>=(\d+)\./.exec(engines)?.[1]).toBe('22');
  });
});
