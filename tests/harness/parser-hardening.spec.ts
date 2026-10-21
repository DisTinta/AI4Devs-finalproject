// Hardening of the shell guard's parser and decisions (openspec change autonomous-run-switch,
// verify-against-spec report 2026-10-21: V1, V2, V4-V9, V22, U2, U4). Not named scenarios: they pin
// the cases the scenarios of "The shell guard reads commands, not text", "Dependency installs are
// vetted…" and "The kit configuration and the local switch stay untouched…" rely on.
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect } from '../../.claude/hooks/shell-words.mjs';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

interface Result {
  ok: boolean;
  commands: Array<{ name: string; cwd: string | null; inInterp: boolean; assigns: string[] }>;
  rawInterpreterText: string[];
  pipeIntoShell: boolean;
  facts: Record<string, unknown>;
}
const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
const run = (line: string): Result => inspect(line, ctx);
type Install = { manager: string; packages: string[]; registry: boolean; npmConfig: boolean };
const installs = (line: string) => run(line).facts.installs as Install[];

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };

describe('shell-words: hardening (parser facts)', () => {
  it('records assignments after an env wrapper like prefix assignments (V1)', () => {
    expect(installs('env npm_config_registry=http://x npm i left-pad@1.3.0')[0].npmConfig).toBe(true);
    expect(installs('env -i npm_config_registry=http://x npm i left-pad@1.3.0')[0].npmConfig).toBe(true);
    expect(installs('env -u HOME NPM_CONFIG_USERCONFIG=/tmp/rc npm i left-pad@1.3.0')[0].npmConfig).toBe(true);
    expect(installs('npm i left-pad@1.3.0')[0].npmConfig).toBe(false);
    const merges = run('env GH_REPO=x/y gh pr merge 61 --merge').facts.merges as Array<{ ghAssign: boolean }>;
    expect(merges[0].ghAssign).toBe(true);
    const plain = run('gh pr merge 61 --merge').facts.merges as Array<{ ghAssign: boolean }>;
    expect(plain[0].ghAssign).toBe(false);
  });

  it('counts any abbreviation of --registry or --userconfig as a registry flag (V2)', () => {
    for (const line of [
      'npm i left-pad@1.3.0 --reg=http://x',
      'npm i left-pad@1.3.0 --re http://x',
      'npm i left-pad@1.3.0 --regis=http://x',
      'npm i left-pad@1.3.0 --us /tmp/rc',
      'npm i left-pad@1.3.0 --userc=/tmp/rc',
      'npm i left-pad@1.3.0 --registry http://x',
    ]) {
      expect(installs(line)[0].registry, line).toBe(true);
    }
    expect(installs('npm i --reg http://x left-pad@1.3.0')[0].packages).toEqual(['left-pad@1.3.0']);
    expect(installs('npm i left-pad@1.3.0 --save-exact')[0].registry).toBe(false);
    expect(installs('npm i left-pad@1.3.0 --r=x')[0].registry).toBe(false);
  });

  it('skips pip value flags only for pip and npm value flags only for npm-family managers (U2)', () => {
    expect(installs('npm install -r left-pad@1.3.0')[0].packages).toEqual(['left-pad@1.3.0']);
    expect(installs('npm install -c left-pad@1.3.0')[0].packages).toEqual(['left-pad@1.3.0']);
    expect(installs('pip install -r requirements.txt')).toEqual([]);
    expect(installs('pip install -c constraints.txt requests')[0].packages).toEqual(['requests']);
    expect(installs('pip install --tag x requests')[0].packages).toEqual(['x', 'requests']);
    expect(installs('npm install --tag latest left-pad')[0].packages).toEqual(['left-pad']);
  });

  it('gives a git checkout of a kit path without -- the kit-configuration fact (V4)', () => {
    for (const line of ['git checkout .cursor/hooks.json', 'git checkout HEAD .claude/settings.json']) {
      expect((run(line).facts.kitConfig as string[]).length, line).toBeGreaterThan(0);
    }
    expect(run("git checkout '*.env'").facts.pathlessRevert).toEqual(['git checkout']);
    expect(run('git checkout feature/x').facts.kitConfig).toEqual([]);
  });

  it('strips message options only for git commit and git tag (V5)', () => {
    expect((run('git checkout -m -- .claude/settings.json').facts.kitConfig as string[]).length).toBeGreaterThan(0);
    expect(run('git commit -m "x" -- src/a.ts').facts.kitConfig).toEqual([]);
    expect(run('git tag -m ".claude/x" v1').facts.kitConfig).toEqual([]);
  });

  it('parses shell text inside interpreter text recursively (V6)', () => {
    const r = run(`bash -c "bash -c 'rm -rf build'"`);
    expect(r.facts.rmRecursive).toBe(true);
    expect(r.commands.some((c) => c.name === 'rm' && c.inInterp)).toBe(true);
    expect(run(`sh -c "echo ls | bash"`).pipeIntoShell).toBe(true);
    expect(run(`sh -c "sh -c 'echo ls | sh'"`).pipeIntoShell).toBe(true);
  });

  it('makes the directory unknown after a cd inside interpreter text or a substitution (V7)', () => {
    const interp = run(`bash -c "cd sub && touch a"`).commands.find((c) => c.name === 'touch');
    expect(interp?.cwd).toBeNull();
    const subst = run('echo "$(cd sub && touch a)"').commands.find((c) => c.name === 'touch');
    expect(subst?.cwd).toBeNull();
    // A cd inside the text does not leak to the commands of the line.
    const after = run(`bash -c "cd sub"; touch b`).commands.find((c) => c.name === 'touch');
    expect(after?.cwd).toBe('C:/repo');
    // Before a cd the text starts in the interpreter's directory.
    const first = run(`bash -c "touch a; cd sub"`).commands.find((c) => c.name === 'touch');
    expect(first?.cwd).toBe('C:/repo');
  });

  it('joins positional words of powershell, pwsh and cmd as interpreter text (V9)', () => {
    expect(run('powershell "rm -rf build"').rawInterpreterText).toEqual(['rm -rf build']);
    expect(run('pwsh -NoProfile Remove-Item -Recurse x').rawInterpreterText).toEqual(['-NoProfile Remove-Item -Recurse x']);
    expect(run('cmd "rd /s /q build"').rawInterpreterText).toEqual(['rd /s /q build']);
    expect(run('pwsh -c Remove-Item x').rawInterpreterText).toEqual(['Remove-Item x']);
  });

  it('does not lex a quoted heredoc body inside a substitution (V22)', () => {
    const r = run("git commit -m \"$(cat <<'EOF'\nfix: it's done (see 1) and 2))\n\n1) first\nEOF\n)\"");
    expect(r.ok).toBe(true);
    expect(r.commands.map((c) => c.name)).toEqual(['git', 'cat']);
    expect(run('echo "$(cat <<EOF\nit\'s $(ls)\nEOF\n)"').commands.map((c) => c.name)).toEqual(['echo', 'cat', 'ls']);
  });

  it('ignores message options in the bypass-flag check (U4)', () => {
    expect(run('git commit -m "--dangerously-skip-permissions"').facts.bypassFlags).toBe(false);
    expect(run('gh pr create -b "--dangerously-skip-permissions"').facts.bypassFlags).toBe(false);
    expect(run('claude --dangerously-skip-permissions').facts.bypassFlags).toBe(true);
  });
});

describe('shell guard: hardening (hook decisions)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const guard = (p: Project, command: string) => runHook(p, 'block-dangerous-bash', bashInput(command, { cwd: p.dir }));

  it('denies an npm_config_* assignment after env in unattended mode (V1)', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const r = await guard(project, 'env npm_config_registry=http://127.0.0.1:9 npm i left-pad@1.3.0');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('npm_config_*');
  });

  it('denies an abbreviated registry flag in unattended mode (V2)', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    for (const command of ['npm i left-pad@1.3.0 --reg=http://127.0.0.1:9', 'npm i left-pad@1.3.0 --us /tmp/rc']) {
      const r = await guard(project, command);
      expect(r.decision, command).toBe('deny');
      expect(r.reason, command).toContain('--registry / --userconfig');
    }
  });

  it('denies reverting kit configuration with git checkout in an autonomous run (V4, V5)', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    for (const command of ['git checkout .cursor/hooks.json', 'git checkout HEAD .claude/settings.json', 'git checkout -m -- .claude/settings.json']) {
      expect((await guard(project, command)).decision, command).toBe('deny');
    }
    expect((await guard(project, 'git checkout feature/DIS-9-foo-bar')).decision).toBe('none');
  });

  it('decides nested shell text like the command it runs (V6)', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect((await guard(project, `bash -c "bash -c 'rm -rf build'"`)).decision).toBe('deny');
    const unattended = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    try {
      const r = await guard(unattended, `bash -c "bash -c 'rm -rf build'"`);
      expect(r.decision).toBe('deny');
      expect(r.reason).not.toContain('editing tools');
      const pipe = await guard(unattended, `sh -c "echo ls | bash"`);
      expect(pipe.decision).toBe('deny');
      expect(pipe.reason).toContain('write the commands directly');
    } finally {
      unattended.cleanup();
    }
  });

  it('treats a write after a cd inside interpreter text as an unknown path in an autonomous run (V7)', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const r = await guard(project, `bash -c "cd .claude && echo x > settings.json"`);
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('literal paths');
  });

  it('matches interpreter text against the kit-contract pattern with the switch "0" (V8)', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const r = await guard(project, 'eval "echo x >> .claude/sdd-harness.env"');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('sdd-harness.env');
  });

  it('matches positional powershell and cmd text (V9)', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect((await guard(project, 'powershell "rm -rf build"')).decision).toBe('deny');
    expect((await guard(project, 'cmd "git push --force"')).decision).toBe('deny');
  });

  it('lets a commit whose heredoc message holds an apostrophe and 1) through unattended (V22)', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const r = await guard(project, "git commit -m \"$(cat <<'EOF'\nfix: it's done\n\n1) first\n2) second\nEOF\n)\"");
    expect(r.decision, r.reason).toBe('none');
  });

  it('does not read a commit message as a permission bypass (U4)', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    expect((await guard(project, 'git commit -m "--dangerously-skip-permissions"')).decision).toBe('none');
  });
});
