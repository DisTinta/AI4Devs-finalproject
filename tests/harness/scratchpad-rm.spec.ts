// agent-harness → "The shell guard leaves removals inside the session scratchpad undecided"
// (openspec change autonomous-run-switch).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

describe('The shell guard leaves removals inside the session scratchpad undecided', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const scratchpad = 'C:/Temp/claude/s1/scratchpad';

  it('A file in the scratchpad is removed', async () => {
    project = createProject();
    for (const command of [
      `rm -rf ${scratchpad}/clone`,
      `rm -f "${scratchpad}/a b.txt"`,
      'rmdir /c/Temp/claude/s1/scratchpad/empty',
    ]) {
      const result = await runHook(project, 'block-dangerous-bash', bashInput(command, { scratchpad_dir: scratchpad }));
      expect(result.decision, command).toBe('none');
    }
  });

  it('A removal outside the scratchpad is still denied', async () => {
    project = createProject();
    for (const command of [
      `rm -rf ${scratchpad}/../other`,
      'rm -rf packages',
      `rm -rf ${scratchpad}/*`,
      `rm -rf "$HOME/x"`,
      `rm -rf ${scratchpad}/a && rm -rf packages`,
    ]) {
      const result = await runHook(project, 'block-dangerous-bash', bashInput(command, { scratchpad_dir: scratchpad }));
      expect(result.decision, command).toBe('deny');
    }
  });

  it('Without a scratchpad in the input nothing changes', async () => {
    project = createProject();
    const result = await runHook(project, 'block-dangerous-bash', bashInput(`rm -rf ${scratchpad}/clone`));
    expect(result.decision).toBe('deny');
  });
});
