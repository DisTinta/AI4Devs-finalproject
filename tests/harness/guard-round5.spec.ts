// agent-harness → shell guard cases from the fourth adversarial review (2026-10-22, openspec change
// autonomous-run-switch): append and array assignments in command position, `declare -x` and its
// relatives like `export`, a cd into a glob, git configuration that could load an alias, the kit's
// PowerShell scripts, and the evidence for every variable that runs a program and for the
// command-position rule of assignments. Every assertion holds on Linux (CI) and on Windows.
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect } from '../../.claude/hooks/shell-words.mjs';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };

interface Result {
  ok: boolean;
  commands: Array<{ name: string; assigns: string[]; words: string[]; cwd: string | null }>;
  rawInterpreterText: string[];
  facts: Record<string, unknown>;
}
const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
const parse = (line: string): Result => inspect(line, ctx);
const merges = (line: string) => parse(line).facts.merges as Array<{ ghAssign: boolean }>;
const alias = (line: string) => parse(line).facts.aliasDefinition as string[];
const kitNamed = (line: string) => parse(line).facts.kitNamed as string[];
const kitConfig = (line: string) => parse(line).facts.kitConfig as string[];

describe('Shell guard: adversarial review round 5', { timeout: 300_000 }, () => {
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

  it('With the switch off the hooks keep their decisions', async () => {
    // An append (`NAME+=value`) or an array element (`NAME[i]=value`) in command position is an
    // assignment, whatever quoting its value has: the command is the next word.
    for (const line of ['X+=1 git reset --hard', 'X+="a b" git reset --hard', "X+='1' git reset --hard", 'X+=$Y git reset --hard', 'A[0]=x git reset --hard', 'A[0]+=x git reset --hard', 'A["k"]=x git reset --hard', 'A[$i]=x git reset --hard']) {
      const c = parse(line).commands[0];
      expect(c.name, line).toBe('git');
      expect(c.assigns.length, line).toBe(1);
    }
    // A quoted `+` or `=` is not an assignment: the shell runs the word as a command.
    expect(parse('X"+"=1 git m').commands[0].assigns).toEqual([]);
    expect(parse('X+\\=1 git m').commands[0].assigns).toEqual([]);
    // A subscript the parser cannot read as one word (bash keeps `A[a b]=x` together) is unparsable.
    expect(parse('A[a b]=x git reset --hard').ok).toBe(false);
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' }, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, ['X+=1 git reset --hard', 'X+="a b" git reset --hard', 'A[0]=x git reset --hard', 'A[a b]=x git reset --hard'], 'ask');
    await expectDecision(project, ['X+=1 git push --force origin main', "X+='1' git push --force origin main"], 'deny', /git push --force is forbidden/);
    // The round-5 rules are autonomous only: with the switch off these stay free.
    await expectDecision(project, [
      'cd .clau* && echo x > lib',
      'GIT_CONFIG_GLOBAL=/tmp/g git m',
      'git config include.path /tmp/x',
      'declare -x GIT_CONFIG_PARAMETERS="\'alias.m=x\'"; git m',
    ], 'none');
  });

  it('A gh or git alias is not defined in an autonomous run', async () => {
    // Append assignments are seen like plain ones.
    expect(merges('X+=1 gh pr merge 61 --merge')).toHaveLength(1);
    expect(merges('GH_REPO+=o/x gh pr merge 61 --merge')[0].ghAssign).toBe(true);
    expect(merges('env GH_REPO+=o/x gh pr merge 61 --merge')[0].ghAssign).toBe(true);
    expect(alias('GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0+=alias.m GIT_CONFIG_VALUE_0=x git status')).not.toEqual([]);
    // declare -x, typeset -x, local -x, readonly -x… set the environment like export.
    for (const line of [
      `declare -x GIT_CONFIG_PARAMETERS="'alias.m=x'"; git status`,
      `declare -gx GIT_CONFIG_PARAMETERS="'alias.m=x'"; git status`,
      `typeset -x GIT_CONFIG_PARAMETERS="'alias.m=x'"; git status`,
      `local -x GIT_CONFIG_KEY_0=alias.m; git status`,
      `readonly -x GIT_CONFIG_KEY_0=alias.m; git status`,
      `export GIT_CONFIG_KEY_0+=alias.m; git status`,
    ]) expect(alias(line), line).not.toEqual([]);
    // Configuration files and variables that could load an alias count as alias definitions.
    for (const line of [
      'GIT_CONFIG_GLOBAL=/tmp/g git status',
      'GIT_CONFIG_SYSTEM=/tmp/s git status',
      'GIT_CONFIG=/tmp/c git status',
      'HOME=/tmp/h git status',
      'XDG_CONFIG_HOME=/tmp/x git status',
      'env HOME=/tmp/h git status',
      'export HOME=/tmp/h; git status',
      'HOME=/tmp/h; git status',
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=include.path GIT_CONFIG_VALUE_0=/tmp/x git status',
      'git config include.path /tmp/x',
      'git config --global Include.Path /tmp/x',
      'git config --global includeIf.gitdir:/x/.path /tmp/y',
      'git -c include.path=/tmp/x status',
      'git -c includeIf.onbranch:x.path=/tmp/y status',
    ]) expect(alias(line), line).not.toEqual([]);
    // Free: reading the configuration, other keys, and HOME for a command that is not git.
    for (const line of ['git config --get include.path', 'git config user.name x', 'HOME=/tmp/h npm test', 'git status']) {
      expect(alias(line), line).toEqual([]);
    }
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'GIT_CONFIG_KEY_0+=alias.m GIT_CONFIG_COUNT=1 GIT_CONFIG_VALUE_0=x git status',
      `declare -x GIT_CONFIG_PARAMETERS="'alias.m=x'"; git status`,
      'GIT_CONFIG_GLOBAL=/tmp/g git status',
      'HOME=/tmp/h git status',
      'git config include.path /tmp/x',
      'GIT_CONFIG_SYSTEM=/tmp/s git status',
      'GIT_CONFIG=/tmp/c git status',
      'XDG_CONFIG_HOME=/tmp/x git status',
      `typeset -x GIT_CONFIG_PARAMETERS="'alias.m=x'"; git status`,
      'git config --global includeIf.gitdir:/x/.path /tmp/y',
      'git -c include.path=/tmp/x status',
      'git --config-env alias.m=MERGE_VAR status',
      'git --config-env=alias.m=MERGE_VAR status',
    ], 'deny', /an alias can hide a merge from the merge gate/);
    // An array element `NAME[i]=` is read as `NAME=`, in command position and after export/declare.
    for (const line of [
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0[0]=alias.m GIT_CONFIG_VALUE_0=x git status',
      'export GIT_CONFIG_KEY_0[0]=alias.m; git status',
      `declare -x GIT_CONFIG_PARAMETERS[0]="'alias.m=x'"; git status`,
      'env GIT_CONFIG_KEY_0[0]=alias.m git status',
    ]) expect(alias(line), line).not.toEqual([]);
    for (const line of ['PAGER[0]=x less .claude/x', 'export PAGER[0]=x; less .claude/x', 'declare -x PAGER[0]=x; less .claude/x']) {
      expect(kitNamed(line), line).not.toEqual([]);
    }
    await expectDecision(project, [
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0[0]=alias.m GIT_CONFIG_VALUE_0=x git status',
      'export GIT_CONFIG_KEY_0[0]=alias.m; git status',
    ], 'deny', /an alias can hide a merge from the merge gate/);
    await expectDecision(project, ['PAGER[0]=x less .claude/x', 'export PAGER[0]=x; less .claude/x'], 'deny', /\.claude\/, \.cursor\/ and the autonomous profile/);
  });

  it('The command form is restricted', () => {
    // An assignment is one only in command position: after the command name it is an argument.
    expect(merges('gh pr merge 61 --merge GH_REPO=o/x')[0].ghAssign).toBe(false);
    const make = parse('make CC=gcc').commands[0];
    expect(make.name).toBe('make');
    expect(make.words).toEqual(['make', 'CC=gcc']);
    expect(make.assigns).toEqual([]);
  });

  it('A git checkout in an unknown directory is denied in an autonomous run', async () => {
    // A cd or pushd into a glob or a brace that could match kit configuration leaves the directory
    // unknown; one that cannot keeps it (author's decision 2026-10-22).
    for (const line of ['cd .clau* && git checkout main', 'cd .{claude,x} && git checkout main', 'pushd .cl?ude && git checkout main']) {
      expect(parse(line).commands[1].cwd, line).toBeNull();
    }
    expect(parse('cd src/* && git checkout main').commands[1].cwd).toBe('C:/repo/src/*');
    expect(parse('cd src && git checkout main').commands[1].cwd).toBe('C:/repo/src');
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, ['cd .clau* && git checkout main'], 'deny', /Paths that cannot be resolved \(variables, unknown directory\) count too/);
  });

  it('An unknown command that names kit configuration is denied in an autonomous run', async () => {
    // A write after a cd into a glob that could reach kit configuration.
    for (const line of ['cd .clau* && echo > lib', 'cd .{claude,x} && echo > lib', 'cd .cl?ude/hooks && cp /tmp/x lib.sh']) {
      expect(kitConfig(line), line).not.toEqual([]);
    }
    // Every variable that runs a program or passes options removes the read-only exemption, as a
    // prefix, appended, exported or declared.
    for (const name of [
      'GIT_DIR', 'PAGER', 'LESS', 'LESSOPEN', 'LESSCLOSE', 'LESSKEY', 'LESSKEYIN', 'LESSKEY_SYSTEM', 'LESSEDIT', 'MORE',
      'VISUAL', 'EDITOR', 'RIPGREP_CONFIG_PATH', 'GREP_OPTIONS', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS',
      'NODE_OPTIONS', 'PERL5OPT', 'PYTHONSTARTUP', 'RUBYOPT',
    ]) {
      expect(kitNamed(`${name}=x cat .claude/settings.json`), name).not.toEqual([]);
      expect(kitNamed(`${name}+=x cat .claude/settings.json`), name).not.toEqual([]);
      expect(kitNamed(`export ${name}=x; cat .claude/settings.json`), name).not.toEqual([]);
      expect(kitNamed(`declare -x ${name}=x; cat .claude/settings.json`), name).not.toEqual([]);
    }
    expect(kitNamed('cat .claude/settings.json')).toEqual([]);
    expect(kitNamed('FOO=x cat .claude/settings.json')).toEqual([]);
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'cd .clau* && echo > lib',
      'cd .{claude,x} && echo > lib',
      'cd .cl?ude/hooks && cp /tmp/x lib.sh',
      'NODE_OPTIONS=--require=./x.js cat .claude/settings.json',
      'PAGER=./x.sh git log -- .claude',
    ], 'deny', /\.claude\/, \.cursor\/ and the autonomous profile|literal paths/);
  });

  it('Interpreter text that names kit configuration is denied in an autonomous run', async () => {
    // The kit's PowerShell scripts run like its bash scripts: exempt without options.
    expect(parse('pwsh .claude/doctor.ps1').rawInterpreterText).toEqual([]);
    expect(parse('powershell .claude/doctor.ps1').rawInterpreterText).toEqual([]);
    expect(parse('pwsh -NoProfile .claude/doctor.ps1').rawInterpreterText).not.toEqual([]);
    expect(parse("powershell .claude/doctor.ps1 '; Remove-Item .claude/x'").rawInterpreterText).not.toEqual([]);
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, ['pwsh .claude/doctor.ps1', 'powershell .claude/doctor.ps1', 'pwsh .claude/doctor.ps1 -Autonomous'], 'none');
    await expectDecision(project, [
      'pwsh -NoProfile .claude/doctor.ps1',
      'powershell -File .claude/doctor.ps1',
      'NODE_OPTIONS=x pwsh .claude/doctor.ps1',
      'pwsh .claude/settings.json',
    ], 'deny', /\.claude\/, \.cursor\/ and the autonomous profile|interpreter/);
  });
});
