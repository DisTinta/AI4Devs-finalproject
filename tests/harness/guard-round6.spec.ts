// agent-harness → shell guard cases from the author's decisions of 2026-10-22 (openspec change
// autonomous-run-switch): a git subcommand that is not one of git's own commands is an alias (or an
// external `git-<name>`) and is denied in an autonomous run, as is a shell write to a git
// configuration file; the configuration sources are read per tool (gh or git); a cd into a glob that
// cannot match kit configuration keeps today's decision; and removing the kit contract gives the
// kit-contract reason. Every assertion holds on Linux (CI) and on Windows.
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect } from '../../.claude/hooks/shell-words.mjs';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };
const ALIAS_REASON = /an alias can hide a merge from the merge gate/;

interface Result {
  ok: boolean;
  commands: Array<{ name: string; cwd: string | null }>;
  facts: Record<string, unknown>;
}
const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
const parse = (line: string): Result => inspect(line, ctx);
const alias = (line: string) => parse(line).facts.aliasDefinition as string[];

// The commands of a normal SDD cycle: none of them is an alias.
const SDD_GIT = [
  'git status', 'git add src/app.ts', 'git commit -m "feat: x"', 'git push -u origin feature/DIS-9-foo-bar',
  'git diff', 'git log --oneline -5', 'git show HEAD', 'git checkout -b feature/DIS-9-x', 'git switch feature/DIS-9-x',
  'git branch --show-current', 'git fetch origin', 'git pull --ff-only', 'git rebase origin/final-project-CRN',
  'git merge --ff-only origin/feature/DIS-9-x', 'git restore src/app.ts', 'git stash push -- src/app.ts',
  'git rev-parse --abbrev-ref HEAD', 'git ls-files', 'git config --get user.name', 'git worktree list',
  'git remote -v', 'git tag --list', 'git --no-pager log -1', 'git -C packages status', 'git --version', 'git help commit',
  'git --config-env core.editor=EDITOR_VAR status',
];

describe('Shell guard: author decisions of 2026-10-22', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  const guard = (p: Project, command: string) =>
    runHook(p, 'block-dangerous-bash', bashInput(command, { cwd: p.dir }), { timeoutMs: 45_000 });
  const expectDecision = async (p: Project, commands: string[], decision: string, reason?: RegExp) => {
    for (const c of commands) {
      const r = await guard(p, c);
      expect(r.decision, c).toBe(decision);
      if (reason) expect(r.reason, c).toMatch(reason);
    }
  };

  it('A gh or git alias is not defined in an autonomous run', async () => {
    // A subcommand that is not one of git's own commands: an alias (from any configuration file,
    // GIT_DIR, --git-dir, -C or an include) or an external git-<name>.
    for (const line of [
      'git m', 'git -C ../other m', 'git --git-dir=/tmp/x/.git m', 'GIT_DIR=/tmp/x/.git git m', 'git lfs pull',
      'git Status', 'git $X', 'git -c core.pager=less m', 'bash -c "git m"', 'find . -name x -exec git m \\;',
    ]) expect(alias(line), line).not.toEqual([]);
    for (const line of SDD_GIT) expect(alias(line), line).toEqual([]);
    // The directory where git looks for its script commands is a configuration source too.
    for (const line of ['GIT_EXEC_PATH=/tmp/x git mergetool', 'git --exec-path=/tmp/x mergetool']) {
      expect(alias(line), line).not.toEqual([]);
    }
    expect(alias('git --exec-path')).toEqual([]);
    // A shell write to a git configuration file defines an alias.
    for (const line of [
      "echo '[alias] m = merge' >> .git/config",
      'tee -a ~/.gitconfig < /tmp/x',
      'sed -i s/a/b/ .git/config',
      'cp /tmp/c .git/config',
      'mv /tmp/c ~/.config/git/config',
      'echo x >> "$XDG_CONFIG_HOME/git/config"',
      'echo x >> "$HOME/.gitconfig"',
      'cd .git && echo x >> config',
      'echo x >> .git/worktrees/w/config.worktree',
      'cd "$X" && echo x >> config',
    ]) expect(alias(line), line).not.toEqual([]);
    for (const line of ['cat .git/config', 'echo x > config.json', 'echo x >> src/settings.ts', 'git config --get user.name']) {
      expect(alias(line), line).toEqual([]);
    }
    // gh reads GH_CONFIG_DIR, HOME and XDG_CONFIG_HOME; git reads its own sources, not GH_CONFIG_DIR.
    for (const line of ['GH_CONFIG_DIR=/tmp/g gh pr view 1', 'HOME=/tmp/h gh pr view 1', 'XDG_CONFIG_HOME=/tmp/x gh pr view 1']) {
      expect(alias(line), line).not.toEqual([]);
    }
    for (const line of ['GH_CONFIG_DIR=/tmp/g git status', 'GIT_CONFIG_GLOBAL=/tmp/g gh pr view 1', 'GIT_CONFIG_NOSYSTEM=1 git status']) {
      expect(alias(line), line).toEqual([]);
    }

    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    // Any git directory: a write to <gitdir>/config.
    project.write('other/HEAD', 'ref: refs/heads/main\n');
    project.write('other/objects/.keep', '');
    expect(inspect('echo x >> other/config', { ...ctx, cwd: project.dir, project: project.dir }).facts.aliasDefinition).not.toEqual([]);
    expect(inspect('echo x >> src/config', { ...ctx, cwd: project.dir, project: project.dir }).facts.aliasDefinition).toEqual([]);
    await expectDecision(project, [
      'git m',
      'git -C ../other m',
      'GIT_DIR=/tmp/x/.git git m',
      'git lfs pull',
      'GIT_EXEC_PATH=/tmp/x git mergetool',
      "echo '[alias] m = merge' >> .git/config",
      'tee -a ~/.gitconfig < /tmp/x',
      'sed -i s/a/b/ .git/config',
      'cp /tmp/c .git/config',
      'echo x >> other/config',
      'GH_CONFIG_DIR=/tmp/g gh pr view 1',
    ], 'deny', ALIAS_REASON);
    await expectDecision(project, ['GIT_CONFIG_NOSYSTEM=1 git status', 'GH_CONFIG_DIR=/tmp/g git status', 'git config --get user.name'], 'none');
  });

  it('A path to kit configuration is recognised in any spelling', async () => {
    // A cd into a glob or a brace that cannot match kit configuration keeps a known directory.
    expect(parse('cd packages/* && npm test').commands[1].cwd).toBe('C:/repo/packages/*');
    expect(parse('cd sr* && npm test').commands[1].cwd).toBe('C:/repo/sr*');
    expect(parse('cd {a,b} && npm test').commands[1].cwd).toBe('C:/repo/a');
    // One that could still leaves it unknown.
    for (const line of ['cd .clau* && npm test', 'cd .{claude,x} && npm test', 'cd {.claude,src} && npm test', 'pushd .cl?ude && npm test', 'cd {src,.cursor/x} && npm test']) {
      expect(parse(line).commands[1].cwd, line).toBeNull();
    }
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, ['cd packages/* && npm test', 'cd sr* && npm test', 'cd {a,b} && npm test', 'cd packages/* && echo x > out.txt', 'cd src/* && git checkout main'], 'none');
    await expectDecision(project, ['cd .clau* && echo x > lib', 'cd {.claude,src} && echo x > lib'], 'deny', /literal paths/);
  });

  it('With the switch off the hooks keep their decisions', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' }, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'git m',
      'git lfs pull',
      'GIT_EXEC_PATH=/tmp/x git mergetool',
      "echo '[alias] m = merge' >> .git/config",
      'cp /tmp/c .git/config',
      'cd packages/* && echo x > out.txt',
      'cd .clau* && npm test',
    ], 'none');
  });

  it('Removing the kit contract is a write', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    for (const c of ['rm .claude/sdd-harness.env', 'rm -- ./.claude/sdd-harness.env']) {
      const r = await guard(project, c);
      expect(r.decision, c).toBe('deny');
      expect(r.reason, c).toMatch(/sdd-harness\.env is edited by hand, not from the agent's shell/);
    }
  });
});
