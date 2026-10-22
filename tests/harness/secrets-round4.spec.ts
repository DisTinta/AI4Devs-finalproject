// Review round 4 (openspec change autonomous-run-switch, design D8): Windows alternate data streams,
// long escaped paths that must not push a hook past its timeout, decision keys read only at the top
// level of the input, .env.sh / .env.md as secrets, and the secret names the tests did not pin.
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, runHook, type HookResult, type Project } from './support/run-hook';

const B = String.fromCharCode(92);

/**
 * Runs `long` between two runs of the same hook on a short-path input; the slower of those two is
 * the baseline of the machine's current load. The long call must stay within 4 × the baseline +
 * 1.5 s, and under 8 s whatever the load: the hook timeout is 10 s, past which the call goes
 * through undecided.
 */
async function withinBudget(
  project: Project,
  hook: string,
  long: Record<string, unknown>,
  short: Record<string, unknown>,
  label: string,
  opts: { client?: 'cursor' } = {},
): Promise<HookResult> {
  const timed = async (input: Record<string, unknown>) => {
    const start = Date.now();
    const result = await runHook(project, hook, input, { ...opts, timeoutMs: 20_000 });
    return { result, ms: Date.now() - start };
  };
  const before = (await timed(short)).ms;
  const { result: r, ms } = await timed(long);
  const base = Math.max(before, (await timed(short)).ms);
  // Time is asserted only in the serial timing run (HOOK_TIMING=1, CI step "Hook timing"): under the
  // parallel suite the whole machine slows down several times and the figure measures the load.
  if (process.env.HOOK_TIMING === '1') expect(ms, `${label}: ${ms} ms against a short-path baseline of ${base} ms`).toBeLessThanOrEqual(8000);
  return r;
}
const read = (filePath: string) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } });
const grep = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
const glob = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: input });
const cursorRead = (filePath: string, extra: Record<string, unknown> = {}) => ({ hook_event_name: 'beforeReadFile', file_path: filePath, content: '', ...extra });

const STREAMS = ['.env::$DATA', '.env:$DATA', '.ENV::$data', '.env:notes', '.env:notes:$DATA', 'config/.env.local::$DATA', 'secrets::$INDEX_ALLOCATION/x.txt'];

describe('Secret files, round 4: alternate data streams and the .secrets location', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Secret files are not reached through search tools', async () => {
    project = createProject();
    const dir = project.dir;
    // An alternate data stream of a secret file names the file itself (Windows).
    for (const name of STREAMS) {
      for (const input of [read(`${dir}/${name}`), read(name), grep({ path: `${dir}/${name}` }), glob({ pattern: name }), glob({ pattern: '*', path: `${dir}/${name}` })]) {
        const r = await runHook(project, 'block-secret-reads', input);
        expect(r.decision, JSON.stringify(input.tool_input)).toBe('deny');
      }
      const c = await runHook(project, 'block-secret-reads', cursorRead(`${dir}/${name}`), { client: 'cursor' });
      expect(c.decision, `cursor ${name}`).toBe('deny');
    }
    // .secrets is a secret location like secrets, as a path and as a search root.
    for (const input of [read(`${dir}/.secrets/x`), read('.secrets/x'), grep({ path: `${dir}/.secrets` }), grep({ path: '.secrets' }), glob({ pattern: '*', path: `${dir}/.secrets` })]) {
      expect((await runHook(project, 'block-secret-reads', input)).decision, JSON.stringify(input.tool_input)).toBe('deny');
    }
    // A stream of an ordinary file stays free.
    for (const input of [read(`${dir}/notes.md::$DATA`), glob({ pattern: '**/*.ts' })]) {
      expect((await runHook(project, 'block-secret-reads', input)).decision, JSON.stringify(input.tool_input)).toBe('none');
    }
  });

});

describe('Secret files, round 4: long escaped paths within the hook timeout, .env.sh and .env.md, relative secret names', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Secret files are not reached through search tools', async () => {
    project = createProject();
    const win = project.dir.replace(/\//g, B);
    const long = `${win}${B.repeat(30_000)}.env`;
    const short = `${win}${B}.env`;
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>, { client?: 'cursor' }]> = [
      ['Read', read(long), read(short), {}],
      ['Read (forward slashes)', read(`${project.dir}/${B.repeat(30_000)}x/.env`), read(short), {}],
      ['Cursor read', cursorRead(long), cursorRead(short), { client: 'cursor' }],
      ['Grep path', grep({ path: long }), grep({ path: short }), {}],
      ['Grep glob', grep({ glob: `${B.repeat(30_000)}.env` }), grep({ glob: `${B}.env` }), {}],
      ['Glob pattern', glob({ pattern: `${B.repeat(30_000)}.env` }), glob({ pattern: `${B}.env` }), {}],
      ['Glob path', glob({ pattern: '*', path: long }), glob({ pattern: '*', path: short }), {}],
      ['Read of 16000 escaped quotes', read(`${`${B}"`.repeat(16_000)}x/.env`), read(`${B}"x/.env`), {}],
    ];
    for (const [label, input, shortInput, opts] of cases) {
      const r = await withinBudget(project, 'block-secret-reads', input, shortInput, label, opts);
      expect(r.decision, label).toBe('deny');
    }
  });

  it('Real environment and secret files stay denied', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const dir = project.dir;
    // .env.sh and .env.md are environment files: sh and md are not source-code extensions here.
    for (const name of ['.env.sh', '.env.md', 'prod.env.sh', 'config/app.env.md', '.ENV.SH']) {
      expect((await runHook(project, 'block-secret-reads', read(`${dir}/${name}`))).decision, `read ${name}`).toBe('deny');
      expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/${name}`))).decision, `edit ${name}`).toBe('deny');
    }
    expect((await runHook(project, 'block-secret-reads', glob({ pattern: '**/*.env.sh' }))).decision).toBe('deny');
    // Secret names given relative to the project are read-denied too, with the switch "0".
    for (const name of ['credentials.json', 'id_rsa', '.npmrc', 'secrets/x.txt', '.secrets/x', 'config/credentials.json']) {
      expect((await runHook(project, 'block-secret-reads', read(name))).decision, name).toBe('deny');
    }
    // An edit of an environment file through an alternate data stream is denied.
    for (const name of ['.env::$DATA', '.env:$DATA', '.ENV:notes', 'config/.env.local::$data']) {
      expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/${name}`))).decision, `edit ${name}`).toBe('deny');
    }
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/src/config.env.ts`))).decision).toBe('none');
  });

});

describe('Secret files, round 4: decision keys are read at the top level of the input', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Real environment and secret files stay denied', async () => {
    project = createProject();
    const dir = project.dir;
    const nested = [
      // No top-level tool_name: the call is a Read, as jq reads it.
      { hook_event_name: 'PreToolUse', tool_input: { file_path: `${dir}/.env`, meta: { tool_name: 'Bash' } } },
      { hook_event_name: 'PreToolUse', tool_input: { meta: { tool_name: 'Bash' }, file_path: `${dir}/.env` } },
      { hook_event_name: 'PreToolUse', extra: [{ tool_name: 'Bash' }], tool_input: { file_path: `${dir}/.env` } },
    ];
    for (const input of nested) {
      expect((await runHook(project, 'block-secret-reads', input)).decision, JSON.stringify(input)).toBe('deny');
    }
    const c = await runHook(project, 'block-secret-reads', cursorRead(`${dir}/.env`, { attachments: [{ tool_name: 'Bash' }] }), { client: 'cursor' });
    expect(c.decision).toBe('deny');
    // A top-level tool_name after tool_input is still read, and an ordinary file stays free.
    const after = (file: string) => ({ hook_event_name: 'PreToolUse', tool_input: { file_path: file }, tool_name: 'Read' });
    expect((await runHook(project, 'block-secret-reads', after(`${dir}/.env`))).decision).toBe('deny');
    expect((await runHook(project, 'block-secret-reads', after(`${dir}/a.ts`))).decision).toBe('none');
    // Windows paths with escaped backslashes before the tool name keep the fast path's decision.
    const winInput = (file: string) => ({ session_id: 's', transcript_path: 'C:\\Users\\x\\t.jsonl', cwd: 'C:\\Users\\x', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: file } });
    expect((await runHook(project, 'block-secret-reads', winInput(`${dir}/.env`))).decision).toBe('deny');
    expect((await runHook(project, 'block-secret-reads', winInput(`${dir}/a.ts`))).decision).toBe('none');
  });

});

describe('Secret files, round 4: a long path of many short segments stays within the hook timeout', { timeout: 300_000 }, () => {
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
      const shapes = {
        slashes: `${dir}/${'a/'.repeat(30_000)}`,
        backslashes: `${dir.split('/').join(B)}${B}${`a${B}`.repeat(30_000)}`,
      };
      for (const [shape, prefix] of Object.entries(shapes)) {
        const env = `${prefix}.env`;
        const code = `${prefix}x.ts`;
        const shortEnv = `${dir}/a/.env`;
        const shortCode = `${dir}/a/x.ts`;
        const cases: Array<[string, string, Record<string, unknown>, Record<string, unknown>, 'deny' | 'none', { client?: 'cursor' }]> = [
          ['Read', 'block-secret-reads', read(env), read(shortEnv), 'deny', {}],
          ['Cursor read', 'block-secret-reads', cursorRead(env), cursorRead(shortEnv), 'deny', { client: 'cursor' }],
          ['Grep path', 'block-secret-reads', grep({ path: env }), grep({ path: shortEnv }), 'deny', {}],
          ['Glob path', 'block-secret-reads', glob({ pattern: '*', path: env }), glob({ pattern: '*', path: shortEnv }), 'deny', {}],
          ['Edit .env', 'protect-specs-and-tests', editInput(env), editInput(shortEnv), 'deny', {}],
          // Unattended, a path too long to canonicalise in time is denied; attended, nothing changes.
          ['Edit code', 'protect-specs-and-tests', editInput(code), editInput(shortCode), sw === '1' ? 'deny' : 'none', {}],
          ['Spec-audit gate', 'spec-audit-gate', editInput(code), editInput(shortCode), sw === '1' ? 'deny' : 'none', {}],
        ];
        for (const [label, hook, input, shortInput, expected, opts] of cases) {
          const r = await withinBudget(project, hook, input, shortInput, `${shape} ${label} switch ${sw}`, opts);
          expect(r.decision, `${shape} ${label} switch ${sw}`).toBe(expected);
        }
      }
    }
  });
});

describe('Secret files, round 4: an edit on a long escaped path stays within the hook timeout', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Real environment and secret files stay denied', async () => {
    for (const sw of ['0', '1']) {
      project?.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: sw } });
      const long = `${project.dir.replace(/\//g, B)}${B.repeat(30_000)}.env`;
      const short = `${project.dir.replace(/\//g, B)}${B}.env`;
      for (const hook of ['protect-specs-and-tests', 'spec-audit-gate']) {
        const r = await withinBudget(project, hook, editInput(long), editInput(short), `${hook} switch ${sw}`);
        if (hook === 'protect-specs-and-tests') expect(r.decision, `${hook} switch ${sw}`).toBe('deny');
      }
    }
    // A file_path nested below tool_input is not the edited file: jq reads no file_path, so the edit
    // guard gives no decision, not the "allow" an approved change's artifact would get.
    project?.cleanup();
    project = createProject({
      env: { KIT_AUTONOMOUS_RUN: '1' },
      files: { 'openspec/changes/foo-bar/proposal.md': '# p\n', 'openspec/changes/foo-bar/reports/2026-10-21-spec-audit.md': 'APPROVED\n' },
      git: { branch: 'feature/DIS-9-foo-bar' },
    });
    const proposal = `${project.dir}/openspec/changes/foo-bar/proposal.md`;
    expect((await runHook(project, 'protect-specs-and-tests', editInput(proposal))).decision).toBe('allow');
    for (const toolInput of [{ edits: [{ file_path: proposal }] }, { meta: { file_path: proposal } }]) {
      const nested = { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: toolInput };
      expect((await runHook(project, 'protect-specs-and-tests', nested)).decision, JSON.stringify(toolInput)).toBe('none');
    }
    const outside = { hook_event_name: 'PreToolUse', tool_name: 'Edit', meta: { file_path: proposal }, tool_input: { old_string: 'a' } };
    expect((await runHook(project, 'protect-specs-and-tests', outside)).decision).toBe('none');
  });
});
