// Path and secret facts from one node process (paths.mjs; openspec change autonomous-run-switch,
// design D8, D9): bash's string operations grow quadratically with the length of a path, so a long
// non-ASCII path (45 000 'é') took the secret-read hook past its 10 s timeout and the read went
// through undecided. The hooks now read their facts from paths.mjs, linear in the length.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, runHook, type HookResult, type Project, type RunOptions } from './support/run-hook';

const B = String.fromCharCode(92);
const E = 'é';
// The author's shell runs with a UTF-8 locale, where bash's string operations count characters.
const UTF8 = { LC_ALL: 'C.UTF-8' };

const read = (filePath: string) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } });
const grep = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
const glob = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: input });
const cursorRead = (filePath: string) => ({ hook_event_name: 'beforeReadFile', file_path: filePath, content: '' });

interface Case {
  label: string;
  hook: string;
  input: Record<string, unknown>;
  short: Record<string, unknown>;
  expected: HookResult['decision'];
  opts?: RunOptions;
}

const timed = async (project: Project, hook: string, input: Record<string, unknown>, opts: RunOptions = {}) => {
  const start = Date.now();
  const result = await runHook(project, hook, input, { ...opts, timeoutMs: 20_000 });
  return { result, ms: Date.now() - start };
};

/**
 * Runs the long calls (one after another, or all at once) between two rounds of the same hooks on
 * short-path inputs (the slower round, the short-path baseline, is only reported). Each long call
 * must get the expected decision and, with HOOK_TIMING=1 (the serial CI step "Hook timing"), finish
 * within an absolute 8 s: the hook timeout is 10 s. Without it no time is asserted.
 */
async function withinBudget(project: Project, cases: Case[], parallel = false): Promise<void> {
  const shortRound = async () => {
    let worst = 0;
    for (const c of cases) worst = Math.max(worst, (await timed(project, c.hook, c.short, { ...c.opts })).ms);
    return worst;
  };
  const before = await shortRound();
  const runs = parallel
    ? await Promise.all(cases.map((c) => timed(project, c.hook, c.input, { ...c.opts })))
    : await cases.reduce<Promise<Array<{ result: HookResult; ms: number }>>>(
        async (acc, c) => [...(await acc), await timed(project, c.hook, c.input, { ...c.opts })],
        Promise.resolve([]),
      );
  const base = Math.max(before, await shortRound());
  cases.forEach((c, k) => {
    const { result, ms } = runs[k];
    // Time is asserted only in the serial timing run (HOOK_TIMING=1, CI step "Hook timing"): under the
    // parallel suite the whole machine slows down several times and the figure measures the load.
    if (process.env.HOOK_TIMING === '1') expect(ms, `${c.label}: ${ms} ms against a short-path baseline of ${base} ms`).toBeLessThanOrEqual(8000);
    expect(result.decision, `${c.label}: ${result.reason.slice(0, 200)}`).toBe(c.expected);
  });
}

describe('Long non-ASCII paths stay within the hook timeout', { timeout: 600_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Real environment and secret files stay denied', async () => {
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw } });
      const dir = project.dir;
      const shapes: Record<string, string> = {
        '45 000 é': `${dir}/${E.repeat(45_000)}/`,
        '60 000 é': `${dir}/${E.repeat(60_000)}`,
        'é with \\ and /': `${dir}/${`${E}${B}${E}/`.repeat(15_000)}`,
      };
      for (const [shape, prefix] of Object.entries(shapes)) {
        const env = `${prefix}.env`;
        const code = `${prefix}x.ts`;
        const opts = { env: UTF8 };
        await withinBudget(project, [
          { label: `${shape} Read switch ${sw}`, hook: 'block-secret-reads', input: read(env), short: read(`${dir}/a/.env`), expected: 'deny', opts },
          { label: `${shape} Cursor read switch ${sw}`, hook: 'block-secret-reads', input: cursorRead(env), short: cursorRead(`${dir}/a/.env`), expected: 'deny', opts: { ...opts, client: 'cursor' } },
          { label: `${shape} Grep path switch ${sw}`, hook: 'block-secret-reads', input: grep({ path: env }), short: grep({ path: `${dir}/a/.env` }), expected: 'deny', opts },
          { label: `${shape} Glob pattern switch ${sw}`, hook: 'block-secret-reads', input: glob({ pattern: env }), short: glob({ pattern: `${dir}/a/.env` }), expected: 'deny', opts },
          { label: `${shape} Read of code switch ${sw}`, hook: 'block-secret-reads', input: read(code), short: read(`${dir}/a/x.ts`), expected: 'none', opts },
          { label: `${shape} Edit .env switch ${sw}`, hook: 'protect-specs-and-tests', input: editInput(env), short: editInput(`${dir}/a/.env`), expected: 'deny', opts },
          // Unattended, an edit path over 4 KiB is denied as too long to check; attended, nothing changes.
          { label: `${shape} Edit code switch ${sw}`, hook: 'protect-specs-and-tests', input: editInput(code), short: editInput(`${dir}/a/x.ts`), expected: sw === '1' ? 'deny' : 'none', opts },
          { label: `${shape} Spec-audit gate switch ${sw}`, hook: 'spec-audit-gate', input: editInput(code), short: editInput(`${dir}/a/x.ts`), expected: sw === '1' ? 'deny' : 'none', opts },
        ]);
      }
    }
  });

  it('Secret files are not reached through search tools, under parallel load', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const dir = project.dir;
    const win = dir.replace(/\//g, B);
    const shortRead = read(`${dir}/a/.env`);
    const cases: Case[] = [
      { label: '60 000 é Read', hook: 'block-secret-reads', input: read(`${dir}/${E.repeat(60_000)}.env`), short: shortRead, expected: 'deny' },
      { label: '45 000 é Grep path', hook: 'block-secret-reads', input: grep({ path: `${dir}/${E.repeat(45_000)}/secrets` }), short: grep({ path: `${dir}/secrets` }), expected: 'deny' },
      { label: '30 000 backslashes Read', hook: 'block-secret-reads', input: read(`${win}${B.repeat(30_000)}.env`), short: shortRead, expected: 'deny' },
      { label: '30 000 segments Edit', hook: 'protect-specs-and-tests', input: editInput(`${dir}/${'a/'.repeat(30_000)}.env`), short: editInput(`${dir}/a/.env`), expected: 'deny' },
      { label: 'mixed é stream Read', hook: 'block-secret-reads', input: read(`${dir}/${`${E}${B}/`.repeat(15_000)}.env:${E.repeat(5_000)}:$DATA`), short: shortRead, expected: 'deny' },
      { label: '45 000 é spec-audit gate', hook: 'spec-audit-gate', input: editInput(`${dir}/${E.repeat(45_000)}/x.ts`), short: editInput(`${dir}/a/x.ts`), expected: 'deny' },
    ];
    await withinBudget(project, cases.map((c) => ({ ...c, opts: { env: UTF8 } })), true);
  });
});

describe('Alternate data streams with any name', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Real environment and secret files stay denied', async () => {
    project = createProject();
    const dir = project.dir;
    const streams = ['.env:Zone.Identifier', '.env:Zone.Identifier:$DATA', `.env:${E}${E}:$DATA`, '.env.local:a b c', 'secrets:x/api.key', 'config/.ENV.PROD:any:$data', `.env:${'s'.repeat(5_000)}`];
    for (const name of streams) {
      expect((await runHook(project, 'block-secret-reads', read(`${dir}/${name}`))).decision, `read ${name}`).toBe('deny');
      // Edits deny environment files only: secrets/api.key keeps its "none" with the switch "0" (design D8).
      const edit = name.startsWith('secrets') ? 'none' : 'deny';
      expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/${name}`))).decision, `edit ${name}`).toBe(edit);
    }
    // A stream of an ordinary file stays free.
    for (const name of ['notes.md:Zone.Identifier', 'README.md:x:$DATA', `src/a.ts:${E}`]) {
      expect((await runHook(project, 'block-secret-reads', read(`${dir}/${name}`))).decision, `read ${name}`).toBe('none');
    }
  });
});

describe('The unattended 4 KiB edit-path rule counts bytes as written', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('A protected path is recognised in any spelling', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const dir = project.dir;
    const room = 4096 - Buffer.byteLength(`${dir}/x/x.ts`);
    // Over 4 KiB in bytes though under 4 KiB in characters (2-byte 'é'), and over 4 KiB only before
    // the backslash run is squeezed: both are denied as too long.
    for (const path of [`${dir}/${E.repeat(Math.ceil(room / 2) + 1)}/x/x.ts`, `${dir}/x${B.repeat(room + 2)}x.ts`]) {
      expect(Buffer.byteLength(path)).toBeGreaterThan(4096);
      for (const hook of ['protect-specs-and-tests', 'spec-audit-gate']) {
        const r = await runHook(project, hook, editInput(path));
        expect(r.decision, `${hook} ${path.length}`).toBe('deny');
        expect(r.reason, hook).toContain('over 4 KiB');
      }
    }
    // Just under 4 KiB in bytes: decided on its canonical path (a new file outside the gated folders).
    const under = `${dir}/${E.repeat(Math.floor(room / 2) - 1)}/x/x.ts`;
    expect(Buffer.byteLength(under)).toBeLessThanOrEqual(4096);
    expect((await runHook(project, 'protect-specs-and-tests', editInput(under))).decision).toBe('none');
  });
});

describe('The path facts fail closed', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  // A paths.mjs that reads the whole input and answers without facts (it echoes the input back, as
  // an earlier version did on failure): the hook decides on its own copy of the input.
  const handBack = [
    "import { readFileSync } from 'node:fs';",
    'const text = readFileSync(0, "utf8");',
    'const nonce = process.argv[process.argv.indexOf("--nonce") + 1];',
    'const q = (s) => "\'" + s.replace(/\'/g, "\'\\\\\'\'") + "\'";',
    'process.stdout.write(`PF_INPUT=${q(text)}\\nPF_FAILED=${q(nonce)}\\n`);',
    'process.exitCode = 3;',
    '',
  ].join('\n');

  it('Real environment and secret files stay denied', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    project.write('.claude/hooks/paths.mjs', handBack);
    const dir = project.dir;
    // Switch "0": the handed-back input goes through jq and the bash checks, as before paths.mjs.
    expect((await runHook(project, 'block-secret-reads', read(`${dir}/.env`))).decision).toBe('deny');
    expect((await runHook(project, 'block-secret-reads', glob({ pattern: "**/.env.*" }))).decision).toBe('deny');
    expect((await runHook(project, 'block-secret-reads', read(`${dir}/notes.md`))).decision).toBe('none');
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/.env.local`))).decision).toBe('deny');
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/.claude/sdd-harness.env`))).decision).toBe('ask');
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/src/a.ts`))).decision).toBe('none');
    // A background agent with the switch "0" is unattended: denied.
    const bg = await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/src/a.ts`, 'Edit', { is_background_agent: true }));
    expect(bg.decision).toBe('deny');
    expect(bg.reason).toContain('paths.mjs');
    // Switch "1": every file-tool hook denies.
    project.cleanup();
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    project.write('.claude/hooks/paths.mjs', handBack);
    for (const [hook, input] of [['block-secret-reads', read(`${project.dir}/notes.md`)], ['protect-specs-and-tests', editInput(`${project.dir}/README.md`)], ['spec-audit-gate', editInput(`${project.dir}/packages/a.ts`)]] as const) {
      const r = await runHook(project, hook, input);
      expect(r.decision, hook).toBe('deny');
      expect(r.reason, hook).toContain('paths.mjs');
    }
  });
});

describe('paths.mjs and the bash fallback classify alike', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Secret files are not reached through search tools', async () => {
    project = createProject();
    const names = ['.env', '.ENV.prod', '.env.example', '.env.sample', 'x.env', 'x.env.ts', 'app.env.d.ts', '.env.sh', '.env.md', 'prod.env.local', 'credentials.json',
      'credentials', 'id_rsa', 'id_rsa.pub', 'id_ed25519', '.npmrc', '.pypirc', 'google-services.json', 'service-account-1.json', 'secrets', '.secrets/x', 'a/secrets/x.env.example',
      'README.md', '.env::$DATA', '.ENV:notes', 'secrets::$INDEX_ALLOCATION/x.txt', 'notes.md::$DATA', 'c:/x/.env', `C:${B}x${B}.env`, '//?/c:/x/.env:z', '.claude/sdd-harness.env',
      'a/.claude/sdd-harness.env', 'sdd-harness.env', 'x/sdd-harness.env', '.env.', 'secrets/', `a${B}secrets${B}b`, 'x.env.bak', 'a:b/.env', `${E}/.env`];
    const globs = ['*', '**/*.ts', '**/*.json', '.env*', '?env.prod', '[.]env.prod', '.e?v.local', '**/.ENV*', '**/[.]e[n]v', '**/*.ENV', '**/SECRETS/*', '**/secre?s/**',
      '{src,config}/.env.{prod,ci}', '**/cred*.json', '**/id_*', '**/.npm*', '*.env.*', 'src/**/*.env.ts', '**/.env.{example,sample}', '**/*.{ts,tsx}', '{a,b', '[a-z]env',
      '*[!x]env', '**/[^a]env.prod', '**/*e*n*v*', '**/.?nv', 'se*ts/a', '**/.sec*/**', '**/goo*-services.json', '**/service-*.json', '[', '[]env', '*env', '**/*.env.sh'];
    // Each line: P (secret path), D (secret location), then the edit verdict; G lines: 1 when the glob reaches.
    const script = [
      'source "$CLAUDE_PROJECT_DIR/.claude/hooks/lib.sh"',
      'while IFS= read -r l; do r=""; is_secret_path "$l" && r+=P; is_secret_dir "$l" && r+=D; slashes_v "$l"; lc="${SLASHED,,}"; PF_ENV=""',
      '  if [[ "$lc" == *:* ]]; then no_streams_v "$lc"; [[ "$NO_STREAMS" != "$lc" ]] && _env_edit_fact "$NO_STREAMS"; fi',
      '  [[ -n "$PF_ENV" ]] || _env_edit_fact "$lc"; printf "%s %s\\n" "$r" "$PF_ENV"; done < "$CLAUDE_PROJECT_DIR/names.txt"',
      'while IFS= read -r l; do glob_reaches_secret "$l" && echo "G1" || echo "G0"; done < "$CLAUDE_PROJECT_DIR/globs.txt"',
      '',
    ].join('\n');
    writeFileSync(join(project.dir, 'names.txt'), `${names.join('\n')}\n`);
    writeFileSync(join(project.dir, 'globs.txt'), `${globs.join('\n')}\n`);
    writeFileSync(join(project.dir, 'classify.sh'), script);
    const bash = spawnSync('node', [join(project.dir, '.claude/hooks/invoke.cjs'), join(project.dir, 'classify.sh')], {
      cwd: project.dir,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: project.dir },
    });
    const lines = bash.stdout.split('\n').filter(Boolean);
    expect(lines, bash.stderr).toHaveLength(names.length + globs.length);
    const mod = (await import(pathToFileURL(join(project.dir, '.claude/hooks/paths.mjs')).href)) as {
      isSecretPath(p: string): boolean;
      isSecretDir(p: string): boolean;
      envEdit(p: string): string;
      globReachesSecret(p: string): boolean;
    };
    names.forEach((n, k) => {
      const mine = `${mod.isSecretPath(n) ? 'P' : ''}${mod.isSecretDir(n) ? 'D' : ''} ${mod.envEdit(n.replace(/\\/g, '/'))}`;
      expect(mine, `name ${n}`).toBe(lines[k]);
    });
    globs.forEach((g, k) => {
      expect(mod.globReachesSecret(g) ? 'G1' : 'G0', `glob ${g}`).toBe(lines[names.length + k]);
    });
  });
});
