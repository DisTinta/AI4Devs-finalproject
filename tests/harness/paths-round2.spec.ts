// Adversarial review 2026-10-21 (openspec change autonomous-run-switch): protected paths in every
// spelling (design D9 «Paths»), and secret files reached through the search tools (design D8, D21).
import { mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, REPO_ROOT, runHook, type Project } from './support/run-hook';

const WINDOWS = process.platform === 'win32';
const CHANGE = 'openspec/changes/foo-bar';

/** Base final-project-CRN with a main spec, the doctrine and a test; the branch adds the change. */
function fixture(opts: { audit?: boolean } = {}): Project {
  const p = createProject({
    env: { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' },
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

/** A directory outside the project with a link (a junction on Windows) to `target`. */
function linkOutside(target: string): { link: string; cleanup(): void } {
  const outside = mkdtempSync(join(tmpdir(), 'harness-link-')).replace(/\\/g, '/');
  const link = `${outside}/lnk`;
  symlinkSync(target, link, 'junction');
  return {
    link,
    cleanup() {
      unlinkSync(link);
      rmSync(outside, { recursive: true, force: true });
    },
  };
}

describe('Protected paths in any spelling', { timeout: 180_000 }, () => {
  let project: Project | undefined;
  let linked: { cleanup(): void } | undefined;
  afterEach(() => {
    linked?.cleanup();
    linked = undefined;
    project?.cleanup();
    project = undefined;
  });

  it('A protected path is recognised in any spelling', async () => {
    project = fixture();
    const dir = project.dir;
    const win = dir.replace(/\//g, '\\');
    const cyg = dir.replace(/^([A-Za-z]):/, (_, d: string) => `/cygdrive/${d.toLowerCase()}`);
    const spellings = [
      `${dir}/./openspec/specs/cap/spec.md`,
      `${dir}//openspec/specs/cap/spec.md`,
      `${dir}/openspec/./specs//cap/spec.md`,
      './docs/base-standards.md',
      `${dir}/./tests/a.spec.ts`,
    ];
    if (WINDOWS) {
      spellings.push(
        `${dir}/OpenSpec/specs/cap/spec.md`,
        'Docs/Base-Standards.md',
        `${dir}/Tests/a.spec.ts`,
        `\\\\?\\${win}\\tests\\a.spec.ts`,
        `\\\\?\\${win}\\docs\\base-standards.md`,
        `\\\\localhost\\${win[0]}$${win.slice(2)}\\tests\\a.spec.ts`,
        `/proc${cyg}/openspec/specs/cap/spec.md`,
        `${cyg}/docs/base-standards.md`,
      );
    }
    for (const path of spellings) {
      const r = await runHook(project, 'protect-specs-and-tests', editInput(path));
      expect(r.decision, `${path} ${r.reason}`).toBe('deny');
    }

    // A '..' segment is denied outright, before canonicalisation (stricter than the canonical decision).
    for (const path of [`${dir}/tests/../tests/a.spec.ts`, `${dir}/packages/../docs/base-standards.md`, 'openspec/x/../specs/cap/spec.md']) {
      const r = await runHook(project, 'protect-specs-and-tests', editInput(path));
      expect(r.decision, `${path} ${r.reason}`).toBe('deny');
    }

    // A leading ~ is the home directory (R3-8): with HOME at the project root, ~/… names the repository.
    const home = { env: { HOME: dir } };
    for (const path of ['~/tests/a.spec.ts', '~/docs/base-standards.md', '~/openspec/specs/cap/spec.md']) {
      const r = await runHook(project, 'protect-specs-and-tests', editInput(path), home);
      expect(r.decision, `${path} ${r.reason}`).toBe('deny');
      expect(r.reason, path).toMatch(/^(Unattended run|Autonomous run)/);
    }
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`~/${CHANGE}/tasks.md`), home)).decision).toBe('none');

    // An allowed rewrite keeps its decision in another spelling: an artifact of the approved active change.
    for (const path of [`${dir}//${CHANGE}/proposal.md`, `${dir}/./${CHANGE}/proposal.md`]) {
      expect((await runHook(project, 'protect-specs-and-tests', editInput(path))).decision, path).toBe('allow');
    }

    // A link into the repository is classified by its real location.
    const l = linkOutside(`${dir}/tests`);
    linked = l;
    const viaLink = await runHook(project, 'protect-specs-and-tests', editInput(`${l.link}/a.spec.ts`));
    expect(viaLink.decision, viaLink.reason).toBe('deny');

    // The free paths stay free in any spelling.
    for (const path of [`${dir}/./${CHANGE}/tasks.md`, `${dir}//${CHANGE}/reports/x.md`]) {
      expect((await runHook(project, 'protect-specs-and-tests', editInput(path))).decision, path).toBe('none');
    }

    // The spec-audit gate, with no audit report yet: code and tests in any spelling are denied.
    l.cleanup();
    linked = undefined;
    project.cleanup();
    project = fixture({ audit: false });
    const gdir = project.dir;
    const code = [`${gdir}/./packages/core/x.ts`, `${gdir}//tests/b.test.ts`];
    if (WINDOWS) code.push(`${gdir}/Packages/core/x.ts`, `${gdir}/TESTS/b.test.ts`, `${gdir}/Packages/new/y.ts`);
    for (const path of code) {
      const r = await runHook(project, 'spec-audit-gate', editInput(path, 'Write'));
      expect(r.decision, `${path} ${r.reason}`).toBe('deny');
    }
    const g = linkOutside(`${gdir}/packages`);
    linked = g;
    const gateViaLink = await runHook(project, 'spec-audit-gate', editInput(`${g.link}/core/x.ts`, 'Write'));
    expect(gateViaLink.decision, gateViaLink.reason).toBe('deny');
    const gateViaHome = await runHook(project, 'spec-audit-gate', editInput('~/packages/core/x.ts', 'Write'), { env: { HOME: gdir } });
    expect(gateViaHome.decision, gateViaHome.reason).toBe('deny');
  });
});

describe('Secret files and the search tools', { timeout: 180_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });
  const grep = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
  const glob = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: input });

  it('Secret files are not reached through search tools', async () => {
    project = createProject();
    const dir = project.dir;
    const denied = [
      grep({ path: `${dir}/.env.ci` }),
      grep({ path: `${dir}/config/.env.prod` }),
      grep({ path: dir, glob: '.env.*' }),
      grep({ glob: '**/.env.backup' }),
      grep({ path: `${dir}/secrets` }),
      glob({ pattern: '**/.env.*' }),
      glob({ pattern: '.env*', path: dir }),
      glob({ pattern: '*', path: `${dir}/secrets` }),
      glob({ pattern: '**/credentials.*' }),
    ];
    for (const input of denied) {
      const r = await runHook(project, 'block-secret-reads', input);
      expect(r.decision, JSON.stringify(input.tool_input)).toBe('deny');
    }
    const free = [
      grep({ path: `${dir}/.env.example` }),
      grep({ path: dir, glob: '*.ts' }),
      grep({ path: dir }),
      glob({ pattern: '**/.env.example' }),
      glob({ pattern: '**/*.ts', path: dir }),
      glob({ pattern: '*' }),
    ];
    for (const input of free) {
      const r = await runHook(project, 'block-secret-reads', input);
      expect(r.decision, JSON.stringify(input.tool_input)).toBe('none');
    }

    // Registered for Read, Grep and Glob with the same timeout.
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8')) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ args: string[]; timeout: number }> }> };
    };
    const entry = settings.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.args.some((a) => a.endsWith('block-secret-reads.sh'))));
    expect(entry?.matcher.split('|').sort()).toEqual(['Glob', 'Grep', 'Read']);
    expect(entry?.hooks[0].timeout).toBe(10);
  });

  it('A secret-read check that crashes denies in unattended mode', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const lib = readFileSync(join(project.dir, '.claude/hooks/lib.sh'), 'utf8');
    project.write('.claude/hooks/lib.sh', `${lib}\npath_facts() { exit 3; }\n`);
    const read = (file: string, extra: Record<string, unknown> = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `${project?.dir}/${file}` }, ...extra });
    const r = await runHook(project, 'block-secret-reads', read('notes.md'));
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('failed before deciding');
    // With the switch "0" nothing changes: the crash gives no decision.
    project.cleanup();
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    project.write('.claude/hooks/lib.sh', `${lib}\npath_facts() { exit 3; }\n`);
    expect((await runHook(project, 'block-secret-reads', read('notes.md'))).decision).toBe('none');

    // The path check (paths.mjs) crashes, prints something unreadable or a stale sentinel.
    for (const script of ['process.exit(3);\n', 'process.stdout.write("PF_HIT=\'\'\\n");\n', 'process.stdout.write("PF_HIT=\'\'\\nPF_SENTINEL=\'pf1\'\\n");\n']) {
      project.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
      project.write('.claude/hooks/paths.mjs', script);
      const u = await runHook(project, 'block-secret-reads', read('notes.md'));
      expect(u.decision, script).toBe('deny');
      expect(u.reason, script).toContain('paths.mjs');
      // Switch "0": jq and the bash checks decide, as before paths.mjs; a background agent still denies.
      project.cleanup();
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
      project.write('.claude/hooks/paths.mjs', script);
      expect((await runHook(project, 'block-secret-reads', read('.env'))).decision, script).toBe('deny');
      expect((await runHook(project, 'block-secret-reads', read('notes.md'))).decision, script).toBe('none');
      expect((await runHook(project, 'block-secret-reads', read('notes.md', { is_background_agent: true }))).decision, script).toBe('deny');
    }
  });
});
