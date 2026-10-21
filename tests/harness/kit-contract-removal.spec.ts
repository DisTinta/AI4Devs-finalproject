// agent-harness → "The shell guard reads commands, not text", scenario "Removing the kit contract is a
// write" (openspec change autonomous-run-switch, verify-against-spec finding U3).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

describe('The shell guard reads commands, not text', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  for (const autonomous of ['0', '1']) {
    it(`Removing the kit contract is a write (KIT_AUTONOMOUS_RUN="${autonomous}")`, async () => {
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: autonomous } });
      const r = await runHook(project, 'block-dangerous-bash', bashInput('rm .claude/sdd-harness.env'));
      expect(r.decision).toBe('deny');
      expect(r.reason).toContain('sdd-harness.env');
    });
  }
});
