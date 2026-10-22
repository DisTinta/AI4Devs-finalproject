// Review round 6 (openspec change autonomous-run-switch, design D8, D9, D21): the path check
// (paths.mjs) is bounded from outside its own process, the switch "0" fallback keeps the hook input
// whatever paths.mjs did with it, drive-relative paths (C:tests/x) and this machine's \\host\C$
// spelling are recognised, and the 4 KiB rule for search patterns applies to unattended runs only.
import { hostname } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, runHook, type HookResult, type Project, type RunOptions } from './support/run-hook';

const WINDOWS = process.platform === 'win32';
const CHANGE = 'openspec/changes/foo-bar';
// The hook timeout is 10 s: a decision past it lets the call through undecided.
const CEILING_MS = 8000;

const read = (filePath: string, extra: Record<string, unknown> = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath }, ...extra });
const grep = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
const glob = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: input });

async function timed(project: Project, hook: string, input: unknown, opts: RunOptions = {}): Promise<HookResult & { ms: number }> {
  const start = Date.now();
  const r = await runHook(project, hook, input, { ...opts, timeoutMs: 40_000 });
  return { ...r, ms: Date.now() - start };
}

/** Base final-project-CRN with a main spec, the doctrine and a test; the branch adds the change. */
function fixture(sw: string, opts: { audit?: boolean } = {}): Project {
  const p = createProject({
    env: { KIT_AUTONOMOUS_RUN: sw, AUTONOMOUS_MERGE_BASE: 'final-project-CRN' },
    files: {
      'openspec/specs/cap/spec.md': '# spec\n',
      'docs/base-standards.md': '# doctrine\n',
      'tests/a.spec.ts': 'export {};\n',
      'packages/core/x.ts': 'export {};\n',
    },
    git: { branch: 'final-project-CRN' },
  });
  p.git('update-ref', 'refs/remotes/origin/final-project-CRN', 'HEAD');
  p.git('checkout', '-q', '-b', 'feature/DIS-9-foo-bar');
  p.write(`${CHANGE}/proposal.md`, '# proposal\n');
  p.write(`${CHANGE}/tasks.md`, '- [ ] 1.1 something\n');
  if (opts.audit !== false) p.write(`${CHANGE}/reports/2026-10-21-spec-audit.md`, '# Spec audit\n\nAPPROVED\n');
  p.git('add', '-A');
  p.git('commit', '-q', '-m', 'branch work');
  return p;
}

// Stand-ins for paths.mjs that never give facts: one hangs before reading anything, the others read
// the whole input first and then fail in a different way.
const STUBS: Record<string, string> = {
  'hangs 30 s': 'setTimeout(() => {}, 30_000);\n',
  'reads, then hangs 30 s': "import { readFileSync } from 'node:fs';\nreadFileSync(0);\nsetTimeout(() => {}, 30_000);\n",
  'reads, then exits 1': "import { readFileSync } from 'node:fs';\nreadFileSync(0);\nprocess.exit(1);\n",
  'reads, then prints garbage': "import { readFileSync } from 'node:fs';\nreadFileSync(0);\nprocess.stdout.write('garbage ( unbalanced\\n');\n",
  'reads, then omits the sentinel': "import { readFileSync } from 'node:fs';\nreadFileSync(0);\nprocess.stdout.write(\"PF_HIT=''\\nPF_FILE=''\\n\");\n",
};

describe('The path check is bounded and the fallback keeps the input', { timeout: 600_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('The path facts fail closed', async () => {
    for (const [label, stub] of Object.entries(STUBS)) {
      for (const sw of ['0', '1']) {
        project?.cleanup();
        project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw }, files: { 'tests/a.spec.ts': 'export {};\n' } });
        project.write('.claude/hooks/paths.mjs', stub);
        const dir = project.dir;
        const calls: Array<[string, string, Record<string, unknown>, string]> = [
          ['Read .env', 'block-secret-reads', read(`${dir}/.env`), 'deny'],
          ['Glob **/.env*', 'block-secret-reads', glob({ pattern: '**/.env*' }), 'deny'],
          // Switch "0": jq and the bash checks decide on the kept input, as before paths.mjs.
          ['Edit of an existing test', 'protect-specs-and-tests', editInput(`${dir}/tests/a.spec.ts`), sw === '1' ? 'deny' : 'ask'],
          ['Read of a plain file', 'block-secret-reads', read(`${dir}/notes.md`), sw === '1' ? 'deny' : 'none'],
        ];
        for (const [what, hook, input, expected] of calls) {
          const r = await timed(project, hook, input);
          expect(r.decision, `${label}, switch ${sw}, ${what}: ${r.reason.slice(0, 200)}`).toBe(expected);
          expect(r.ms, `${label}, switch ${sw}, ${what}`).toBeLessThanOrEqual(CEILING_MS);
          if (sw === '1') expect(r.reason, `${label} ${what}`).toContain('paths.mjs');
        }
      }
    }
  });

  it('A protected path is recognised in any spelling', async () => {
    // An unreachable network path: resolving it would block for many seconds. It is outside the
    // repository, so it gets no decision, within the hook timeout, in both switches.
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw } });
      for (const path of ['//10.255.254.7/share/x.ts', '\\\\10.255.254.7\\share\\x.ts', '\\\\?\\UNC\\10.255.254.7\\share\\x.ts']) {
        for (const hook of ['protect-specs-and-tests', 'spec-audit-gate']) {
          const r = await timed(project, hook, editInput(path));
          expect(r.decision, `${hook} ${path} switch ${sw}: ${r.reason.slice(0, 200)}`).toBe('none');
          expect(r.ms, `${hook} ${path} switch ${sw}`).toBeLessThanOrEqual(CEILING_MS);
        }
      }
    }
  });
});

describe.runIf(WINDOWS)('Drive-relative paths and this machine\'s admin share', { timeout: 600_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('A protected path is recognised in any spelling', async () => {
    project = fixture('1');
    const dir = project.dir;
    const drive = dir[0];
    const other = drive.toUpperCase() === 'Q' ? 'R' : 'Q';
    // C:tests/x is relative to the current directory of drive C:, taken as the project directory
    // when the drive is the project's.
    for (const d of [drive.toUpperCase(), drive.toLowerCase()]) {
      for (const path of [`${d}:tests/a.spec.ts`, `${d}:docs/base-standards.md`, `${d}:.claude/hooks/lib.sh`, `${d}:openspec\\specs\\cap\\spec.md`]) {
        const r = await runHook(project, 'protect-specs-and-tests', editInput(path));
        expect(r.decision, `${path} ${r.reason}`).toBe('deny');
      }
    }
    // Another drive is outside the repository: no decision.
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${other}:tests/a.spec.ts`))).decision).toBe('none');
    // The approved change's tasks.md stays free in that spelling.
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${drive}:${CHANGE}/tasks.md`))).decision).toBe('none');

    // This machine's name, as \\<hostname>\C$\…, names the local drive.
    const share = `\\\\${hostname()}\\${drive}$${dir.slice(2).replace(/\//g, '\\')}`;
    for (const rel of ['tests\\a.spec.ts', 'docs\\base-standards.md', '.claude\\hooks\\lib.sh', '.claude\\settings.json']) {
      const r = await runHook(project, 'protect-specs-and-tests', editInput(`${share}\\${rel}`));
      expect(r.decision, `${share}\\${rel} ${r.reason}`).toBe('deny');
    }
    const kit = await runHook(project, 'protect-specs-and-tests', editInput(`${share}\\.claude\\hooks\\lib.sh`));
    expect(kit.reason).toContain('.claude/');

    // Switch "0": the attended confirmations see the same files.
    project.cleanup();
    project = fixture('0');
    const d0 = project.dir[0];
    for (const path of [`${d0}:tests/a.spec.ts`, `${d0}:docs/base-standards.md`, `${d0}:openspec/specs/cap/spec.md`]) {
      const r = await runHook(project, 'protect-specs-and-tests', editInput(path));
      expect(r.decision, `${path} ${r.reason}`).toBe('ask');
    }
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${d0}:.env`))).decision).toBe('deny');

    // The spec-audit gate, with no audit report yet: code and tests in that spelling are denied.
    for (const sw of ['0', '1']) {
      project.cleanup();
      project = fixture(sw, { audit: false });
      const g = project.dir[0];
      for (const path of [`${g}:packages/core/x.ts`, `${g}:tests/b.test.ts`, `${g.toLowerCase()}:packages\\new\\y.ts`]) {
        const r = await runHook(project, 'spec-audit-gate', editInput(path, 'Write'));
        expect(r.decision, `switch ${sw} ${path} ${r.reason}`).toBe('deny');
      }
      expect((await runHook(project, 'spec-audit-gate', editInput(`${other}:packages/core/x.ts`, 'Write'))).decision, `switch ${sw}`).toBe(sw === '1' ? 'deny' : 'none');
    }
  });

  it('Secret files are not reached through search tools', async () => {
    project = createProject();
    const drive = project.dir[0];
    for (const input of [read(`${drive}:.env`), read(`${drive}:secrets/x.txt`), grep({ path: `${drive}:secrets` }), glob({ pattern: '*', path: `${drive}:secrets` }), glob({ pattern: `${drive}:secrets/*` })]) {
      expect((await runHook(project, 'block-secret-reads', input)).decision, JSON.stringify(input.tool_input)).toBe('deny');
    }
    expect((await runHook(project, 'block-secret-reads', read(`${drive}:notes.md`))).decision).toBe('none');
  });
});

describe('The 4 KiB rule for search patterns applies to unattended runs only', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Secret files are not reached through search tools', async () => {
    const harmless = `${'src/'.repeat(1_200)}**/*.ts`;
    const secret = `${'src/'.repeat(1_200)}**/.env.*`;
    expect(Buffer.byteLength(harmless)).toBeGreaterThan(4096);
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw } });
      // Switch "0": decided by what the pattern names, whatever its length.
      for (const input of [glob({ pattern: harmless }), grep({ glob: harmless })]) {
        const r = await timed(project, 'block-secret-reads', input);
        expect(r.decision, `switch ${sw} ${r.reason.slice(0, 120)}`).toBe(sw === '1' ? 'deny' : 'none');
        expect(r.ms).toBeLessThanOrEqual(CEILING_MS);
      }
      for (const input of [glob({ pattern: secret }), grep({ glob: secret })]) {
        expect((await timed(project, 'block-secret-reads', input)).decision, `switch ${sw}`).toBe('deny');
      }
      // A background agent with the switch "0" is unattended: the rule applies.
      if (sw === '0') expect((await runHook(project, 'block-secret-reads', { ...glob({ pattern: harmless }), is_background_agent: true })).decision).toBe('deny');
    }
  });
});
