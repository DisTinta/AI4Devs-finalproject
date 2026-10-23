// Review round 7 (openspec change autonomous-run-switch, design D8, D9, D21): gh and git
// configuration files are not edited in an autonomous run, the whole answer of the path check
// (paths.mjs) is bounded and its process never outlives the hook, an input the hooks cannot parse is
// denied in an unattended run, and with the switch "0" a drive-relative path (C:tests/x) is decided
// as before paths.mjs (as written).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, runHook, type Decision, type HookResult, type Project, type RunOptions } from './support/run-hook';

const WINDOWS = process.platform === 'win32';
const TIMING = process.env.HOOK_TIMING === '1';
// The hook timeout is 10 s: a decision past it lets the call through undecided. Asserted only in the
// serial timing run (HOOK_TIMING=1, CI step "Hook timing").
const CEILING_MS = 8000;
// Past this a hook is taken as hung, whatever the run (a hang detector, not a timing figure): the
// stand-ins below stall 120 s.
const HUNG_MS = 25_000;

const read = (filePath: string) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } });

async function timed(project: Project, hook: string, input: unknown, opts: RunOptions = {}): Promise<HookResult & { ms: number }> {
  const start = Date.now();
  const r = await runHook(project, hook, input, { timeoutMs: HUNG_MS, ...opts });
  return { ...r, ms: Date.now() - start };
}

/** Runs a hook with `text` as its raw stdin (runHook always sends valid JSON). */
function runRaw(project: Project, hook: string, text: string): Promise<{ decision: Decision; reason: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [join(project.dir, '.claude/hooks/invoke.cjs'), join(project.dir, '.claude/hooks', `${hook}.sh`)], {
      cwd: project.dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: project.dir },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), HUNG_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 2) return resolve({ decision: 'deny', reason: stderr.trim() });
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(stdout.trim().split('\n').pop() ?? '') as Record<string, unknown>;
      } catch {
        json = null;
      }
      const hso = json?.hookSpecificOutput as Record<string, unknown> | undefined;
      if (hso?.permissionDecision) return resolve({ decision: hso.permissionDecision as Decision, reason: String(hso.permissionDecisionReason ?? '') });
      resolve({ decision: 'none', reason: '' });
    });
    child.stdin.end(text);
  });
}

describe('A gh or git alias is not defined in an autonomous run', { timeout: 600_000 }, () => {
  let project: Project | undefined;
  const dirs: string[] = [];
  afterEach(() => {
    project?.cleanup();
    project = undefined;
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('A gh or git alias is not defined in an autonomous run', async () => {
    const home = mkdtempSync(join(tmpdir(), 'harness-home-')).replace(/\\/g, '/');
    const xdg = mkdtempSync(join(tmpdir(), 'harness-xdg-')).replace(/\\/g, '/');
    const ghDir = mkdtempSync(join(tmpdir(), 'harness-ghdir-')).replace(/\\/g, '/');
    dirs.push(home, xdg, ghDir);
    const env = { HOME: home, XDG_CONFIG_HOME: xdg, GH_CONFIG_DIR: ghDir };
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw }, git: {} });
      const dir = project.dir;
      const paths = [
        '~/.config/gh/config.yml', '~/.config/gh/hosts.yml', `${home}/.config/gh/config.yml`,
        `${xdg}/gh/config.yml`, `${xdg}/gh/hosts.yml`, `${ghDir}/config.yml`, `${ghDir}/hosts.yml`,
        'C:/Users/someone/AppData/Roaming/GitHub CLI/config.yml', 'c:\\users\\someone\\appdata\\roaming\\github cli\\HOSTS.YML',
        'C:/USERS/SOMEONE/APPDATA/ROAMING/GITHUB CLI/config.yml',
        '.git/config', `${dir}/.git/config`, `${dir}/.git/config.worktree`, '~/.gitconfig', `${home}/.gitconfig`,
        '~/.config/git/config', `${xdg}/git/config`,
      ];
      for (const path of paths) {
        for (const tool of ['Edit', 'Write']) {
          for (const client of ['claude', 'cursor'] as const) {
            const r = await runHook(project, 'protect-specs-and-tests', editInput(path, tool), { env, client });
            const label = `switch ${sw} ${client} ${tool} ${path}: ${r.reason.slice(0, 200)}`;
            // Switch "0": the decision before paths.mjs (no protection for these files).
            expect(r.decision, label).toBe(sw === '1' ? 'deny' : 'none');
            if (sw === '1') expect(r.reason, label).toContain('alias');
          }
        }
      }
      // A config.yml or config elsewhere is not gh's or git's.
      for (const path of ['packages/config.yml', `${dir}/config/hosts.yml`, 'docs/git/config.md']) {
        expect((await runHook(project, 'protect-specs-and-tests', editInput(path), { env })).decision, `switch ${sw} ${path}`).toBe('none');
      }
    }
  });
});

// Stand-ins for paths.mjs. Each writes its process id first, so the test can tell whether it
// outlived the hook.
const PID = "import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('../paths.pid', import.meta.url), String(process.pid));\n";
const STALLS: Record<string, string> = {
  'prints a short length and one line, then stalls': `${PID}process.stdout.write("120\\nPF_HIT=''\\n");\nsetTimeout(() => {}, 120_000);\n`,
  'prints a long length and one line, then stalls': `${PID}process.stdout.write("99999\\nPF_HIT=''\\n");\nsetTimeout(() => {}, 120_000);\n`,
};
const FULL_THEN_STAYS = `${PID}const a = process.argv;\nconst body = "PF_HIT=''\\nPF_SENTINEL='" + a[a.indexOf('--nonce') + 1] + "'\\n";\nprocess.stdout.write(Buffer.byteLength(body) + '\\n' + body);\nsetTimeout(() => {}, 120_000);\n`;
const HANGS = `${PID}setTimeout(() => {}, 120_000);\n`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gone(pid: number): Promise<boolean> {
  for (let k = 0; k < 30; k += 1) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

describe('The path facts fail closed', { timeout: 900_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('The path facts fail closed', async () => {
    for (const [label, stub] of Object.entries(STALLS)) {
      for (const sw of ['0', '1']) {
        for (const client of ['claude', 'cursor'] as const) {
          project?.cleanup();
          project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw }, files: { 'tests/a.spec.ts': 'export {};\n' } });
          project.write('.claude/hooks/paths.mjs', stub);
          const dir = project.dir;
          const calls: Array<[string, string, unknown, Decision]> = [
            ['Read .env', 'block-secret-reads', read(`${dir}/.env`), 'deny'],
            ['Read of a plain file', 'block-secret-reads', read(`${dir}/notes.md`), sw === '1' ? 'deny' : 'none'],
          ];
          // Switch "0": jq and the bash checks decide on the kept input (Claude Code's ask).
          if (client === 'claude') calls.push(['Edit of an existing test', 'protect-specs-and-tests', editInput(`${dir}/tests/a.spec.ts`), sw === '1' ? 'deny' : 'ask']);
          for (const [what, hook, input, expected] of calls) {
            const r = await timed(project, hook, input, { client });
            const msg = `${label}, switch ${sw}, ${client}, ${what}: ${r.ms} ms ${r.reason.slice(0, 200)}`;
            expect(r.ms, `${msg}: hung`).toBeLessThan(HUNG_MS);
            expect(r.decision, msg).toBe(expected);
            if (sw === '1') expect(r.reason, msg).toContain('paths.mjs');
            if (TIMING) expect(r.ms, msg).toBeLessThanOrEqual(CEILING_MS);
          }
        }
      }
    }
  });

  it('The path check never outlives the hook', async () => {
    const cases: Array<[string, string, Decision, Decision]> = [
      ['hangs before any output', HANGS, 'deny', 'none'],
      ['prints one line, then stalls', STALLS['prints a short length and one line, then stalls'], 'deny', 'none'],
      ['prints a long length, then stalls', STALLS['prints a long length and one line, then stalls'], 'deny', 'none'],
      // A complete answer is taken as soon as it is read, even while the process keeps running.
      ['prints the whole answer, then keeps running', FULL_THEN_STAYS, 'none', 'none'],
    ];
    for (const [label, stub, d1, d0] of cases) {
      for (const sw of ['0', '1']) {
        project?.cleanup();
        project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw } });
        project.write('.claude/hooks/paths.mjs', stub);
        const r = await timed(project, 'block-secret-reads', read(`${project.dir}/notes.md`));
        const msg = `${label}, switch ${sw}: ${r.ms} ms ${r.reason.slice(0, 200)}`;
        expect(r.ms, `${msg}: hung`).toBeLessThan(HUNG_MS);
        expect(r.decision, msg).toBe(sw === '1' ? d1 : d0);
        if (TIMING) expect(r.ms, msg).toBeLessThanOrEqual(label.startsWith('prints the whole') ? 3000 : CEILING_MS);
        const pid = Number(readFileSync(join(project.dir, '.claude/paths.pid'), 'utf8'));
        expect(await gone(pid), `${msg}: paths.mjs (pid ${pid}) outlived the hook`).toBe(true);
      }
    }
  });
});

describe('An input the hooks cannot parse is denied in an unattended run', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('The path facts fail closed', async () => {
    const inputs = ['', 'not json', '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":".env"'];
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw }, files: { 'tests/a.spec.ts': 'export {};\n' }, git: {} });
      for (const hook of ['block-secret-reads', 'protect-specs-and-tests', 'spec-audit-gate']) {
        for (const text of inputs) {
          const r = await runRaw(project, hook, text);
          // Switch "0": as before (nothing to decide on).
          expect(r.decision, `switch ${sw} ${hook} ${JSON.stringify(text)}: ${r.reason}`).toBe(sw === '1' ? 'deny' : 'none');
          if (sw === '1') expect(r.reason).toContain('could not be parsed');
        }
      }
    }
  });
});

describe.runIf(WINDOWS)('Drive-relative paths keep the base decision with the switch "0"', { timeout: 600_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  /** Base final-project-CRN with a main spec, the doctrine and a test; the branch adds the change. */
  function fixture(sw: string, audit: boolean): Project {
    const p = createProject({
      env: { KIT_AUTONOMOUS_RUN: sw },
      files: { 'openspec/specs/cap/spec.md': '# spec\n', 'docs/base-standards.md': '# doctrine\n', 'tests/a.spec.ts': 'export {};\n', 'packages/core/x.ts': 'export {};\n' },
      git: { branch: 'final-project-CRN' },
    });
    p.git('checkout', '-q', '-b', 'feature/DIS-9-foo-bar');
    p.write('openspec/changes/foo-bar/proposal.md', '# proposal\n');
    if (audit) p.write('openspec/changes/foo-bar/reports/2026-10-21-spec-audit.md', '# Spec audit\n\nAPPROVED\n');
    return p;
  }

  it('A protected path is recognised in any spelling', async () => {
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = fixture(sw, true);
      const d = project.dir[0];
      // Switch "0": as written, the way the hook decided before paths.mjs; switch "1": resolved.
      const cases: Array<[string, Decision, Decision]> = [
        [`${d}:tests/a.spec.ts`, 'none', 'deny'],
        [`${d}:docs/base-standards.md`, 'none', 'deny'],
        [`${d}:openspec/specs/cap/spec.md`, 'none', 'deny'],
        [`${d}:.env`, 'deny', 'deny'],
      ];
      for (const [path, d0, d1] of cases) {
        const r = await runHook(project, 'protect-specs-and-tests', editInput(path));
        expect(r.decision, `switch ${sw} ${path}: ${r.reason}`).toBe(sw === '1' ? d1 : d0);
      }
      // The fallback (paths.mjs gave no facts) decides as written too.
      if (sw === '0') {
        project.write('.claude/hooks/paths.mjs', 'process.exit(1);\n');
        for (const [path, d0] of cases) {
          expect((await runHook(project, 'protect-specs-and-tests', editInput(path))).decision, `fallback ${path}`).toBe(d0);
        }
      }
      // The spec-audit gate, with no audit report yet.
      project.cleanup();
      project = fixture(sw, false);
      const g = project.dir[0];
      for (const path of [`${g}:packages/core/x.ts`, `${g}:tests/b.test.ts`]) {
        const r = await runHook(project, 'spec-audit-gate', editInput(path, 'Write'));
        expect(r.decision, `gate switch ${sw} ${path}: ${r.reason}`).toBe(sw === '1' ? 'deny' : 'none');
      }
    }
  });

  it('A drive-relative path is denied as unsure when the project path has no drive letter', async () => {
    // Git Bash mounts /tmp on the temporary directory: the project is reached through a path with no
    // drive letter, so C:tests/x cannot be compared with it.
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = fixture(sw, true);
      const d = project.dir[0];
      const env = { CLAUDE_PROJECT_DIR: `/tmp/${basename(project.dir)}` };
      for (const hook of ['protect-specs-and-tests', 'spec-audit-gate']) {
        const r = await runHook(project, hook, editInput(`${d}:tests/a.spec.ts`), { env });
        expect(r.decision, `switch ${sw} ${hook}: ${r.reason}`).toBe(sw === '1' ? 'deny' : 'none');
        if (sw === '1') expect(r.reason).toContain('relative to the current directory of its drive');
      }
    }
  });
});
