// agent-harness → "Rewrites of specs, tests and doctrine are decided without a human in unattended
// mode" (and the spec-audit gate in unattended mode), plus the edit-tool half of "The kit
// configuration and the local switch stay untouched in an autonomous run"
// (openspec change autonomous-run-switch, design D5, D9).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, runHook, type Project } from './support/run-hook';

const CHANGE = 'openspec/changes/foo-bar';
const MIGRATION = 'packages/adapters/store-postgres/migrations/0001_init.sql';

/**
 * Base `final-project-CRN` (commit A) ← origin/final-project-CRN (commit B, adds an earlier ticket's
 * test) ← feature/DIS-9-foo-bar (commit C, adds the branch's own test and the change).
 */
function fixture(opts: { autonomous?: string; protect?: string; gate?: string; verdict?: 'APPROVED' | 'CHANGES REQUIRED' | 'APPROVED\r' | null; crlf?: boolean } = {}): Project {
  const p = createProject({
    env: {
      KIT_AUTONOMOUS_RUN: opts.autonomous ?? '1',
      KIT_PROTECT_SPECS: opts.protect ?? '1',
      KIT_SPEC_AUDIT_GATE: opts.gate ?? '1',
      AUTONOMOUS_MERGE_BASE: 'final-project-CRN',
    },
    files: {
      'openspec/specs/llm-adapter/spec.md': '# llm\n',
      'openspec/specs/graph-store/spec.md': '# graph\n',
      'openspec/templates/y.md': 'tpl\n',
      'tests/unit/llm/llm-config.spec.ts': 'export {};\n',
      'tests/unit/a.spec.ts': 'export {};\n',
      'docs/base-standards.md': '# doctrine\n',
      [MIGRATION]: 'select 1;\n',
    },
    git: { branch: 'final-project-CRN' },
  });
  // Commit B: an earlier ticket adds a test; only origin has it.
  p.git('checkout', '-q', '-b', 'tmp-origin');
  p.write('tests/unit/earlier.spec.ts', 'export {};\n');
  p.git('add', 'tests/unit/earlier.spec.ts');
  p.git('commit', '-q', '-m', 'earlier ticket');
  p.git('update-ref', 'refs/remotes/origin/final-project-CRN', 'HEAD');
  // Commit C: the branch.
  p.git('checkout', '-q', '-b', 'feature/DIS-9-foo-bar');
  p.git('branch', '-q', '-D', 'tmp-origin');
  p.write('tests/unit/new.spec.ts', 'export {};\n');
  p.write(`${CHANGE}/proposal.md`, '# proposal\n');
  p.write(`${CHANGE}/design.md`, '# design\n');
  p.write(`${CHANGE}/tasks.md`, '- [ ] 1.1 Edit `tests/unit/llm/llm-config.spec.ts` (requirement change)\n- [ ] 1.2 Snapshot `tests/unit/a.spec.ts.snap`\n- [ ] 1.3 Look at (tests/unit/x.spec.ts)\n');
  p.write(`${CHANGE}/specs/llm-adapter/spec.md`, '## MODIFIED Requirements\n');
  p.write(`${CHANGE}/reports/x.md`, 'notes\n');
  p.write('openspec/changes/other-change/proposal.md', '# other\n');
  if (opts.verdict !== null) {
    const verdict = opts.verdict ?? 'APPROVED';
    const nl = opts.crlf ? '\r\n' : '\n';
    p.write(
      `${CHANGE}/reports/2026-10-21-spec-audit.md`,
      ['# Spec audit', '', '## Run 1', '', 'CHANGES REQUIRED', '', '```', 'APPROVED', '```', '', '## Run 2', '', verdict, ''].join(nl),
    );
  }
  p.git('add', '-A');
  p.git('commit', '-q', '-m', 'branch work');
  return p;
}

describe('Rewrites of specs, tests and doctrine are decided without a human in unattended mode', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const edit = (p: Project, path: string, extra: Record<string, unknown> = {}) =>
    runHook(p, 'protect-specs-and-tests', editInput(path.includes(':') ? path : `${p.dir}/${path}`, 'Edit', extra));

  for (const protect of ['1', '0']) {
    describe(`with KIT_PROTECT_SPECS="${protect}"`, () => {
      it('An artifact of an approved active change is rewritten', async () => {
        project = fixture({ protect });
        expect((await edit(project, `${CHANGE}/design.md`)).decision).toBe('allow');
      });

      it('A verdict line with a carriage return still counts', async () => {
        project = fixture({ protect, crlf: true });
        expect((await edit(project, `${CHANGE}/design.md`)).decision).toBe('allow');
      });

      it('Artifacts are free before the first audit', async () => {
        project = fixture({ protect, verdict: null });
        expect((await edit(project, `${CHANGE}/design.md`)).decision).toBe('allow');
      });

      it('An artifact of a change not yet approved is protected', async () => {
        project = fixture({ protect, verdict: 'CHANGES REQUIRED' });
        const r = await edit(project, `${CHANGE}/design.md`);
        expect(r.decision).toBe('deny');
        expect(r.reason).toContain('spec audit has not approved');
        project.cleanup();
        project = fixture({ protect, autonomous: '0' });
        const bg = await edit(project, `${CHANGE}/design.md`, { is_background_agent: true });
        expect(bg.decision).toBe('deny');
        expect(bg.reason).toContain('KIT_AUTONOMOUS_RUN');
      });

      it('Task lists, reports and templates stay free', async () => {
        project = fixture({ protect });
        for (const path of [`${CHANGE}/tasks.md`, `${CHANGE}/reports/x.md`, 'openspec/templates/y.md']) {
          expect((await edit(project, path)).decision, path).toBe('none');
        }
      });

      it('A main spec with a delta in the active change is synced', async () => {
        project = fixture({ protect });
        expect((await edit(project, 'openspec/specs/llm-adapter/spec.md')).decision).toBe('allow');
      });

      it('A main spec without a delta is protected', async () => {
        project = fixture({ protect });
        expect((await edit(project, 'openspec/specs/graph-store/spec.md')).decision).toBe('deny');
      });

      it('An artifact of another change is protected', async () => {
        project = fixture({ protect });
        expect((await edit(project, 'openspec/changes/other-change/proposal.md')).decision).toBe('deny');
      });

      it('An existing test planned in tasks.md may change', async () => {
        project = fixture({ protect });
        const windows = `${project.dir}/tests/unit/llm/llm-config.spec.ts`.replace(/\//g, '\\');
        expect((await edit(project, windows)).decision).toBe('allow');
      });

      it('A test the branch created may change', async () => {
        project = fixture({ protect });
        expect((await edit(project, 'tests/unit/new.spec.ts')).decision).toBe('allow');
      });

      it('A test added to the base by an earlier ticket is not the branch\'s own', async () => {
        project = fixture({ protect });
        expect((await edit(project, 'tests/unit/earlier.spec.ts')).decision).toBe('deny');
      });

      it('An existing test not planned in tasks.md is protected', async () => {
        project = fixture({ protect });
        const r = await edit(project, 'tests/unit/a.spec.ts');
        expect(r.decision).toBe('deny');
        expect(r.reason).toContain('tasks.md');
      });

      it('Doctrine and versioned migrations are protected', async () => {
        project = fixture({ protect });
        expect((await edit(project, 'docs/base-standards.md')).decision).toBe('deny');
        const m = await edit(project, MIGRATION);
        expect(m.decision).toBe('deny');
        expect(m.reason).toContain('new migration');
      });
    });
  }

  it('Without a determinable active change the rewrite is denied', async () => {
    project = fixture();
    project.write('openspec/changes/second/proposal.md', '# second\n');
    project.git('checkout', '-q', '-b', 'feature/DIS-10-unrelated');
    const r = await edit(project, `${CHANGE}/design.md`);
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('feature/DIS-10-unrelated');
  });

  it('Editing kit configuration is denied (edit tool)', async () => {
    project = fixture();
    expect((await edit(project, '.claude/hooks/lib.sh')).decision).toBe('deny');
    const profile = mkdtempSync(join(tmpdir(), 'harness-profile-')).replace(/\\/g, '/');
    try {
      const r = await runHook(project, 'protect-specs-and-tests', editInput(`${profile}/settings.json`), { env: { CLAUDE_CONFIG_DIR: profile } });
      expect(r.decision).toBe('deny');
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });

  it('Files outside the repository and the profile stay free', async () => {
    project = fixture();
    const home = mkdtempSync(join(tmpdir(), 'harness-home-')).replace(/\\/g, '/');
    try {
      expect((await edit(project, `${home}/.claude/projects/x/memory/MEMORY.md`)).decision).toBe('none');
      project.git('worktree', 'add', '-q', '.claude/worktrees/w1');
      expect((await edit(project, '.claude/worktrees/w1/src/a.ts')).decision).toBe('none');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('The spec-audit gate in unattended mode', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const code = (p: Project, extra: Record<string, unknown> = {}) =>
    runHook(p, 'spec-audit-gate', editInput(`${p.dir}/packages/core/src/x.ts`, 'Write', extra));

  for (const gate of ['1', '0']) {
    it(`No code is written after a CHANGES REQUIRED audit (KIT_SPEC_AUDIT_GATE="${gate}")`, async () => {
      project = fixture({ gate, verdict: 'CHANGES REQUIRED' });
      const r = await code(project);
      expect(r.decision).toBe('deny');
      expect(r.reason).toContain('stops cleanly');
    });

    it(`No code is written without an active change in unattended mode (KIT_SPEC_AUDIT_GATE="${gate}")`, async () => {
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1', KIT_SPEC_AUDIT_GATE: gate }, git: { branch: 'feature/DIS-10-next' } });
      const r = await code(project);
      expect(r.decision).toBe('deny');
      expect(r.reason).toContain('feature/DIS-10-next');
    });
  }

  it('An approved change lets code through, and outside unattended mode the gate is unchanged', async () => {
    project = fixture();
    expect((await code(project)).decision).toBe('none');
    project.cleanup();
    project = fixture({ autonomous: '0', verdict: 'CHANGES REQUIRED' });
    expect((await code(project)).decision).toBe('none');
  });
});
