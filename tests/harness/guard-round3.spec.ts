// agent-harness → shell guard cases from the second verify-against-spec run (2026-10-22, openspec
// change autonomous-run-switch): R3-1 (interpreter text whatever the flag), R3-2 (read-only commands
// with an option that runs a command or writes a file), R3-7 (unreadable parser output) and the
// evidence for the cost caps at their limits.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };
const WIN = process.platform === 'win32';

describe('Shell guard: verify-against-spec round 3', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  const guard = (p: Project, command: string, env: Record<string, string> = {}) =>
    runHook(p, 'block-dangerous-bash', bashInput(command, { cwd: p.dir }), { env, timeoutMs: 45_000 });

  const expectDenied = async (p: Project, commands: string[], reason?: RegExp, env: Record<string, string> = {}) => {
    for (const c of commands) {
      const r = await guard(p, c, env);
      expect(r.decision, c).toBe('deny');
      if (reason) expect(r.reason, c).toMatch(reason);
    }
  };
  const expectFree = async (p: Project, commands: string[], env: Record<string, string> = {}) => {
    for (const c of commands) expect((await guard(p, c, env)).decision, c).toBe('none');
  };
  const KIT_REASON = /\.claude\/, \.cursor\/ and the autonomous profile|interpreter/;

  it('Interpreter text that names kit configuration is denied in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const profile = join(project.dir, 'profile').replace(/\\/g, '/');
    mkdirSync(profile, { recursive: true });
    const env = { CLAUDE_CONFIG_DIR: profile };
    const denied = [
      `node --eval "require('fs').writeFileSync('.claude/sdd-harness.env','')"`,
      `node -p "require('fs').rmSync('.claude/hooks',{recursive:true})"`,
      `node --print "require('fs').unlinkSync('.cursor/hooks.json')"`,
      `python3 -Ic "open('.claude/hooks/lib.sh','w')"`,
      `python3.12 -c "open('.claude/hooks/lib.sh','w')"`,
      `perl -E 'unlink ".claude/hooks/lib.sh"'`,
      `perl -wle 'unlink ".claude/hooks/lib.sh"'`,
      `ruby -we 'File.write(".claude/x", "")'`,
      `php -r 'unlink(".claude/hooks/lib.sh");'`,
      `deno eval "Deno.removeSync('.claude/hooks/lib.sh')"`,
      `bun -e "require('fs').rmSync('.claude/hooks/lib.sh')"`,
      `pwsh -c "Remove-Item .claude\\hooks\\lib.sh"`,
      `powershell -NoProfile -Command "Remove-Item .claude/hooks/lib.sh"`,
      `lua -e 'os.remove(".claude/hooks/lib.sh")'`,
      `awk 'BEGIN { print "" > ".claude/hooks/lib.sh" }'`,
      `node -e "require('fs').writeFileSync('${profile}/settings.json','{}')"`,
      `env -i node --eval "require('fs').writeFileSync('.claude/x','')"`,
      `node --eval ".claude/x;require('fs').rmSync('.claude/hooks',{recursive:true})"`,
      `bash -c 'node -p "require(\\"fs\\").rmSync(\\".claude/hooks\\")"'`,
    ];
    if (WIN) denied.push(`python3 -c "open('.CLAUDE/hooks/lib.sh','w')"`, `node -p "require('fs').rmSync('.Cursor\\\\hooks.json')"`);
    await expectDenied(project, denied, KIT_REASON, env);
    await expectFree(project, [
      `python3.12 -c "print('hello')"`,
      'node -p "1 + 1"',
      `perl -E 'say 1'`,
      'bash .claude/hooks/lib.sh',
      `bash -c 'cat .claude/settings.json'`,
    ], env);
    const off = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    try {
      await expectFree(off, [`node --eval "require('fs').writeFileSync('.claude/x','')"`, `python3.12 -c "open('.claude/x','w')"`]);
    } finally {
      off.cleanup();
    }
  });

  it('An unknown command that names kit configuration is denied in an autonomous run', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    await expectDenied(project, [
      // R3-1: any word, whatever flag introduced it.
      'tar -C.claude -xf evil.tar',
      'rsync -a evil/ .claude',
      'unzip -d .cursor evil.zip',
      'some-tool --into=x/.claude/hooks',
      'cpio --directory=.cursor -i',
      'FOO=.claude/hooks/lib.sh some-tool',
      // R3-2: a read-only command loses its exemption with an option that runs a command or writes.
      'rg --pre ./x.sh foo .claude',
      'rg --pre=./x.sh foo .claude/hooks',
      'git grep -Ovim foo -- .claude',
      'git grep -O vim foo -- .claude',
      'git grep --open-files-in-pager=vim foo -- .claude',
      'git grep --open-files foo -- .claude',
      'git -c diff.external=./x.sh diff -- .claude/settings.json',
      'git -c core.fsmonitor=./x.sh status .claude',
      'git --config-env=core.pager=X log -- .claude',
      'git --config-env core.pager=X log -- .claude',
      'git diff --output=.claude/x',
      'git diff --output .claude/x',
      'git log -p --ext-diff -- .claude',
      'git show --textconv HEAD:.claude/settings.json',
      'git cat-file --filters HEAD:.claude/settings.json',
      'GIT_EXTERNAL_DIFF=./x.sh git diff -- .claude',
      'file -C -m .claude/magic',
      'file --compile -m .claude/magic',
      'less -o .claude/x README',
      'less -O.claude/x README',
      'less --log-file=.claude/x README',
      'less "+!touch x" .claude/settings.json',
      'LESSOPEN="|./x.sh %s" less .claude/settings.json',
      'find .claude -ok rm {} ;',
      'find .claude -okdir rm {} ;',
      'find .claude -fprint out.txt',
      'find .claude -fprintf out.txt %p',
      'find .claude -fls out.txt',
      'find .claude -execdir touch {} +',
    ], /\.claude\/, \.cursor\/ and the autonomous profile/);
    await expectFree(project, [
      'rg -n foo .claude/hooks',
      "rg --pre-glob '*.gz' foo .claude",
      'git grep -n foo -- .claude',
      'git -C .claude status',
      'git diff --stat -- .claude',
      'git log --oneline -- .claude/settings.json',
      'file .claude/settings.json',
      'less .claude/settings.json',
      'find .claude -name "*.sh" -print',
      'rsync -a evil/ src',
      'node -p "1"',
    ]);
  });

  it('the shell guard denies unreadable parser output in unattended mode', async () => {
    // A parser that prints assignments the shell cannot evaluate (a syntax error before the end
    // marker), and one that never sets the sentinel the hook asked for.
    const broken = "process.stdout.write(\"COMMAND='ls'\\nP_OK=true\\n(\\nSW_DONE=1\\n\");\n";
    const noSentinel = "process.stdout.write(\"COMMAND='ls'\\nP_OK=true\\nSW_DONE=1\\n\");\n";
    for (const stub of [broken, noSentinel]) {
      project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
      project.write('.claude/hooks/shell-words.mjs', stub);
      const r = await guard(project, 'ls');
      expect(r.decision, stub).toBe('deny');
      expect(r.reason, stub).toContain('cannot be read reliably (parser output)');
      project.cleanup();
      // Switch "0": today's fallback, the raw rules on the whole line.
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
      project.write('.claude/hooks/shell-words.mjs', stub);
      expect((await guard(project, 'ls')).decision, stub).toBe('none');
      expect((await guard(project, 'rm -rf packages')).decision, stub).toBe('deny');
      project.cleanup();
    }
    project = undefined;
  });

  it('A line too costly to check is denied in unattended mode', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const p = project;
    const costly = async (command: string, cap: string | null, env: Record<string, string> = {}) => {
      const r = await guard(p, command, env);
      if (cap === null) {
        expect(r.decision, command.slice(0, 60)).toBe('none');
      } else {
        expect(r.decision, command.slice(0, 60)).toBe('deny');
        expect(r.reason).toContain('too costly to check');
        expect(r.reason).toContain(cap);
      }
    };
    // Interpreter texts: 20 pass, 21 are denied.
    await costly(`${'eval true; '.repeat(20)}ls`, null);
    await costly(`${'eval true; '.repeat(21)}ls`, '21 interpreter texts, more than 20');
    // Commands: 200 pass, 201 are denied.
    await costly(`${'true; '.repeat(199)}ls`, null);
    await costly(`${'true; '.repeat(200)}ls`, '201 commands, more than 200');
    // Characters of interpreter text: 65536 pass, 65537 are denied.
    await costly(`python - <<'EOF'\n${'x'.repeat(65535)}\nEOF`, null);
    await costly(`python - <<'EOF'\n${'x'.repeat(65536)}\nEOF`, '65537 characters of interpreter text, more than 65536');
    // git lookups (the branch of each local merge): 16 pass, 17 are denied.
    await costly(Array.from({ length: 16 }, (_, k) => `git merge feature/x${k}`).join('; '), null);
    await costly(Array.from({ length: 17 }, (_, k) => `git merge feature/x${k}`).join('; '), 'more than 16 git lookups');
    // The time budget, lowered for the test through the process environment: reaching it denies.
    await costly('ls', 'time budget of 0 s', { KIT_GUARD_TIME_BUDGET_S: '0' });
    // It can only be lowered: a larger value keeps the default budget.
    await costly('ls', null, { KIT_GUARD_TIME_BUDGET_S: '999' });
    // The contract file cannot set it.
    const viaContract = createProject({ env: { ...AUTONOMOUS, KIT_GUARD_TIME_BUDGET_S: '0' }, git: { branch: 'feature/DIS-9-foo-bar' } });
    try {
      expect((await guard(viaContract, 'ls')).decision).toBe('none');
    } finally {
      viaContract.cleanup();
    }
    // With the switch "0" none of the caps denies.
    const off = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    try {
      for (const c of [`${'eval true; '.repeat(21)}ls`, `${'true; '.repeat(200)}ls`]) expect((await guard(off, c)).decision).toBe('none');
      expect((await guard(off, 'ls', { KIT_GUARD_TIME_BUDGET_S: '0' })).decision).toBe('none');
    } finally {
      off.cleanup();
    }
  });
});
