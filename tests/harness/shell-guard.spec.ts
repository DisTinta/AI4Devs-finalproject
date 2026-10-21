// agent-harness → "The shell guard reads commands, not text" (openspec change autonomous-run-switch).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

describe('The shell guard reads commands, not text', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  const guard = async (p: Project, command: string, extra: Record<string, unknown> = {}) =>
    runHook(p, 'block-dangerous-bash', bashInput(command, extra));

  it('Searching for a dangerous string is not a dangerous command', async () => {
    project = createProject();
    expect((await guard(project, 'grep -rn "rm -rf packages" docs')).decision).toBe('none');
  });

  it('A commit message is not a command', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    for (const command of [
      'git commit -m "touch .claude/x and git push --force"',
      'git commit -am"wip: rm -rf build"',
      "git commit -m \"$(cat <<'EOF'\nfix: avoid git push --force and rm -rf build\nEOF\n)\"",
      "git commit -m \"$(cat <<'EOF'\nfix: it's not rm -rf build\n\n1) avoid git push --force\nEOF\n)\"",
    ]) {
      expect((await guard(project, command)).decision, command).toBe('none');
    }
  });

  it('Executed text is still matched', async () => {
    project = createProject();
    for (const command of [
      'bash -c "rm -rf build"',
      'bash -lc "rm -rf build"',
      "sh <<'EOF'\nrm -rf build\nEOF",
      'git commit -m "$(rm -rf packages)"',
      'cat <<EOF > x\n$(rm -rf packages)\nEOF',
    ]) {
      expect((await guard(project, command)).decision, command).toBe('deny');
    }
  });

  it('Text piped into a shell is executed', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    for (const command of ['echo "rm -rf packages" | bash', 'bash <<< "rm -rf packages"']) {
      expect((await guard(project, command)).decision, command).toBe('deny');
    }
  });

  it('A pipe into a shell is denied in unattended mode', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const result = await guard(project, 'echo "npm test" | sh');
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('write the commands directly');
  });

  it('Wrapped, grouped and looped commands are found', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    for (const command of [
      'sudo rm -rf x',
      'find . -name dist -exec rm -rf {} +',
      'for d in a b; do rm -rf "$d"; done',
      '(cd x && rm -rf build)',
      '/bin/rm -rf x',
    ]) {
      expect((await guard(project, command)).decision, command).toBe('deny');
    }
  });

  it('A continued line is one command', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' }, git: {} });
    const result = await guard(project, 'git add \\\n.claude/settings.json');
    expect(result.decision).toBe('deny');
  });

  it('A quoted flag is still a flag', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect((await guard(project, 'git push "--force"')).decision).toBe('deny');
  });

  it('Reading the kit contract with a redirection is allowed', async () => {
    project = createProject();
    for (const command of [
      'grep KIT_ .claude/sdd-harness.env 2>/dev/null',
      'git show HEAD:.claude/sdd-harness.env > /tmp/x',
    ]) {
      expect((await guard(project, command)).decision, command).toBe('none');
    }
  });

  it('Writing the kit contract is denied', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    for (const command of [
      `echo 'KIT_PROTECT_SPECS="0"' >> .claude/sdd-harness.env`,
      "sed -i 's/1/0/' .claude/sdd-harness.env",
      `sed -i 's/1/0/' ".claude/sdd-harness.env"`,
      'printf x > ".claude/sdd-harness.env"',
      "perl -i -pe 's/1/0/' .claude/sdd-harness.env",
      'printf x | tee .claude/sdd-harness.env',
      'cp /tmp/x .claude/sdd-harness.env',
      'mv /tmp/x .claude/sdd-harness.env',
      'truncate -s 0 .claude/sdd-harness.env',
      'dd if=/tmp/x of=.claude/sdd-harness.env',
    ]) {
      expect((await guard(project, command)).decision, command).toBe('deny');
    }
  });

  it('A relative write is resolved against the working directory', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const result = await guard(project, 'echo x >> sdd-harness.env', { cwd: `${project.dir}/.claude` });
    expect(result.decision).toBe('deny');
  });

  it('An unparsable line is matched as before outside unattended mode', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect((await guard(project, 'echo "unbalanced && rm -rf packages')).decision).toBe('deny');
  });

  it('An unparsable line is denied in unattended mode', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    for (const command of ['cat <(ls)', "echo 'unbalanced"]) {
      const result = await guard(project, command);
      expect(result.decision, command).toBe('deny');
      expect(result.reason).toContain('plain simple commands');
    }
  });
});
