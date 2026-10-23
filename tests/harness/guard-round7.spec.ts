// agent-harness → shell guard cases from the seventh review run (openspec change
// autonomous-run-switch): the gh counterpart of the git rule (a gh top-level command that is not
// one of gh's own commands, a gh extension installed or run, a shell write to a gh configuration
// file), git or gh run by xargs with the subcommand from its input, and the evidence that the set of
// git's own commands holds every subcommand of a normal SDD cycle. Every assertion holds on Linux
// (CI) and on Windows.
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect } from '../../.claude/hooks/shell-words.mjs';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };
const ALIAS_REASON = /an alias can hide a merge from the merge gate/;
const HOME = homedir().replace(/\\/g, '/');

const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
const alias = (line: string) => inspect(line, ctx).facts.aliasDefinition as string[];

// The gh commands of a normal SDD cycle: none of them is an alias.
const SDD_GH = [
  'gh pr create --base final-project-CRN --title "feat: x" --body "y"', 'gh pr view 12', 'gh pr view --json state',
  'gh pr checks 12', 'gh pr list --state open', 'gh pr comment 12 --body "ok"', 'gh pr merge 12 --squash',
  'gh run list --limit 5', 'gh run view 123 --log-failed', 'gh run watch 123', 'gh api repos/o/r/pulls/12',
  'gh auth status', 'gh repo view --json name', 'gh issue view 3', 'gh --version', 'gh help pr', 'gh -R o/r pr view 1',
  'gh workflow list', 'gh release list', 'gh label list', 'gh search prs x', 'gh status', 'gh extension list',
  'gh ext list', 'gh alias list', 'gh config get editor', 'gh cs list', 'gh at verify x',
];

// Every git subcommand a normal SDD cycle uses.
const SDD_GIT_SUBCOMMANDS = [
  'add', 'commit', 'push', 'status', 'diff', 'log', 'show', 'checkout', 'switch', 'branch', 'fetch', 'pull', 'rebase',
  'merge', 'restore', 'stash', 'rev-parse', 'ls-files', 'config', 'worktree', 'tag', 'remote', 'cherry-pick', 'revert',
  'am', 'reset', 'blame', 'describe', 'notes', 'submodule', 'help', 'version', 'mv', 'rm', 'clean', 'grep', 'init', 'clone',
];

describe('Shell guard: seventh review run', { timeout: 300_000 }, () => {
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

  const GH_ALIASES = [
    // A top-level command that is not one of gh's own: an alias or an extension.
    'gh m', 'gh co 12', 'gh -R o/r m 12', 'gh Pr view 1', 'gh $X', 'gh my-ext run', 'bash -c "gh m"',
    // Installing, upgrading, creating or running an extension.
    'gh extension install o/gh-m', 'gh extension upgrade m', 'gh extension exec m', 'gh extension create m',
    'gh ext install o/gh-m', 'gh extensions exec m', 'gh ext upgrade --all',
    // git or gh run by xargs with the subcommand from its input.
    'echo m | xargs git', 'xargs -n1 git < f', 'xargs -a f git', 'xargs git -C x', 'echo m | xargs gh', 'xargs -a f gh -R o/r',
  ];
  const GH_CONFIG_WRITES = [
    "echo 'aliases: {m: pr merge}' >> ~/.config/gh/config.yml",
    'tee -a ~/.config/gh/hosts.yml < /tmp/x',
    'sed -i s/a/b/ "$XDG_CONFIG_HOME/gh/config.yml"',
    'cp /tmp/c "$GH_CONFIG_DIR/config.yml"',
    'mv /tmp/c "${GH_CONFIG_DIR}/hosts.yml"',
    'echo x >> "%APPDATA%/GitHub CLI/config.yml"',
    `echo x >> "${HOME}/AppData/Roaming/GitHub CLI/config.yml"`,
    'echo x >> "C:/Users/u/AppData/Roaming/github cli/CONFIG.YML"',
    'ln -sf /tmp/c ~/.config/gh/config.yml',
    'install /tmp/c ~/.config/gh/config.yml',
    'dd if=/tmp/c of=/home/u/.config/gh/config.yml',
    'truncate -s 0 ~/.config/gh/hosts.yml',
    'cd ~/.config/gh && echo x >> config.yml',
  ];

  it('A gh or git alias is not defined in an autonomous run', async () => {
    for (const line of [...GH_ALIASES, ...GH_CONFIG_WRITES]) expect(alias(line), line).not.toEqual([]);
    for (const line of SDD_GH) expect(alias(line), line).toEqual([]);
    for (const line of [
      'cat ~/.config/gh/config.yml', 'echo x > config.yml', 'echo x > .github/workflows/ci.yml',
      'echo x >> docker/config.yml', 'xargs git add < files', 'xargs -n1 gh pr view < prs', 'git ls-files | xargs git blame',
    ]) expect(alias(line), line).toEqual([]);

    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'gh m', 'gh co 12', 'gh extension install o/gh-m', 'gh ext exec m', 'echo m | xargs git', 'xargs git -C x',
      'echo m | xargs gh', "echo 'aliases: {m: pr merge}' >> ~/.config/gh/config.yml", 'cp /tmp/c ~/.config/gh/hosts.yml',
      'echo x >> "%APPDATA%/GitHub CLI/config.yml"',
    ], 'deny', ALIAS_REASON);
    await expectDecision(project, [
      'gh pr view 12', 'gh pr checks 12', 'gh run list --limit 5', 'gh auth status', 'gh repo view', 'gh issue view 3',
      'gh api repos/o/r/pulls/12', 'gh extension list', 'xargs git add < files',
    ], 'none');
  });

  it('The set of git\'s own commands holds every subcommand of a normal SDD cycle', () => {
    for (const sub of SDD_GIT_SUBCOMMANDS) expect(alias(`git ${sub}`), sub).toEqual([]);
    // And every builtin the local git lists, when git can list them and is one of the versions the set
    // was built from (2.45–2.52): a newer git may add builtins, which the set then simply does not know
    // yet (a false deny in an autonomous run, never a false allow).
    const version = /git version 2\.(\d+)/.exec(spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout ?? '');
    if (!version || Number(version[1]) < 45 || Number(version[1]) > 52) return;
    const listed = spawnSync('git', ['--list-cmds=builtins'], { encoding: 'utf8' });
    if (listed.status !== 0 || !listed.stdout) return;
    const builtins = listed.stdout.split(/\s+/).filter(Boolean);
    expect(builtins.length).toBeGreaterThan(50);
    for (const sub of builtins) expect(alias(`git ${sub}`), sub).toEqual([]);
  });

  it('With the switch off the hooks keep their decisions', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' }, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'gh m', 'gh extension install o/gh-m', 'echo m | xargs git',
      "echo 'aliases: {m: pr merge}' >> ~/.config/gh/config.yml",
    ], 'none');
  });
});
