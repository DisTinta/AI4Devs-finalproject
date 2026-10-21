// agent-harness → "No hook leaves a confirmation pending in unattended mode"
// (openspec change autonomous-run-switch).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, editInput, pathWithoutJq, runHook, type Project } from './support/run-hook';

const MIGRATION = 'packages/adapters/store-postgres/migrations/0099_x.sql';

describe('No hook leaves a confirmation pending in unattended mode', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('A destructive git command is denied with its alternative', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    for (const command of ['git reset --hard HEAD~1', 'git clean -fd']) {
      const result = await runHook(project, 'block-dangerous-bash', bashInput(command));
      expect(result.decision, command).toBe('deny');
      expect(result.reason).toMatch(/git restore -- <paths>|git stash push -- <paths>/);
      expect(result.reason).not.toContain('editing tools');
    }
  });

  it('A match found only in interpreter text names the editing tools', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const heredocs = [
      "python - <<'EOF'\nprint('the author rejected git reset --hard')\nEOF",
      "python - <<'EOF'\nprint('never run rm -rf packages')\nEOF",
      "python - <<'EOF'\nprint('git push --force is forbidden')\nEOF",
    ];
    for (const command of heredocs) {
      const result = await runHook(project, 'block-dangerous-bash', bashInput(command));
      expect(result.decision, command).toBe('deny');
      expect(result.reason, command).toContain('editing tools');
      expect(result.reason, command).toContain('read only by pattern');
    }
    // A parsed destructive command does not get that sentence.
    for (const command of ['rm -rf packages', 'git push --force', 'mkfs /dev/sda1', 'dd if=/dev/zero of=/dev/sda']) {
      const result = await runHook(project, 'block-dangerous-bash', bashInput(command));
      expect(result.decision, command).toBe('deny');
      expect(result.reason, command).not.toContain('editing tools');
    }
  });

  it('The documentation gate denies and lists what is missing', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' }, git: {} });
    project.write(MIGRATION, 'select 1;\n');
    project.git('add', MIGRATION);
    const result = await runHook(project, 'docs-gate', bashInput('git commit -m "add migration"'));
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('The data schema changes and no documentation is updated');
    expect(result.reason).toContain('/update-docs');
  });

  it('The stack guard denies in unattended mode', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const result = await runHook(project, 'block-dangerous-bash', bashInput('psql -c "DROP TABLE x"'));
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('stop the ticket cleanly and leave it In Review');
  });

  it('The kit contract cannot be edited in unattended mode', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const result = await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/.claude/sdd-harness.env`));
    expect(result.decision).toBe('deny');
  });

  it('Without jq the hooks deny instead of passing', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const result = await runHook(project, 'block-dangerous-bash', bashInput('rm -rf packages'), {
      env: { PATH: pathWithoutJq() },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('jq');
  });
});
