// Self-test of the hook harness (openspec change autonomous-run-switch, task 1.2).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

describe('hook harness', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('runs the real shell guard through invoke.cjs', async () => {
    project = createProject();
    const result = await runHook(project, 'block-dangerous-bash', bashInput('rm -rf packages'));
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('Destructive command');
  });
});
