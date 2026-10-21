// agent-harness → "The agent merges only in an autonomous run and under deterministic conditions"
// (openspec change autonomous-run-switch, design D4): the bypasses and gaps found by
// verify-against-spec on 2026-10-21 (V1, V3, V11, V12, V13, V23).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';
import { createGhShim, prViewJson, type GhShim, type GhShimBehaviour } from './support/stubs';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };

describe('The merge gate is not bypassed by alternative forms (verify 2026-10-21)', { timeout: 180_000 }, () => {
  let project: Project | undefined;
  let shim: GhShim | undefined;
  afterEach(() => {
    project?.cleanup();
    shim?.cleanup();
    project = undefined;
    shim = undefined;
  });

  async function gate(command: string, behaviour: GhShimBehaviour = { prView: prViewJson() }, env: Record<string, string> = AUTONOMOUS) {
    project?.cleanup();
    shim?.cleanup();
    project = createProject({ env, git: { branch: 'feature/DIS-9-foo-bar' } });
    shim = createGhShim(behaviour);
    return runHook(project, 'autonomous-merge-gate', bashInput(command, { cwd: project.dir }), { env: { PATH: shim.path } });
  }

  it('V3: forbidden flags in --flag=value form are denied like the bare flags', async () => {
    for (const [command, flag] of [
      ['gh pr merge 61 --merge --admin=true', '--admin'],
      ['gh pr merge 61 --merge --auto=true', '--auto'],
      ['gh pr merge 61 --merge --delete-branch=1', '--delete-branch'],
      ['gh pr merge 61 --merge --squash=true', '--squash'],
      ['gh pr merge 61 --merge --rebase=true', '--rebase'],
      ['gh pr merge 61 --merge -d=true', '-d'],
    ]) {
      const r = await gate(command);
      expect(r.decision, command).toBe('deny');
      expect(r.reason, command).toContain(`flag ${flag}`);
    }
  });

  it('V3: --merge=true counts as --merge, --merge=false does not', async () => {
    expect((await gate('gh pr merge 61 --merge=true')).decision).toBe('allow');
    const r = await gate('gh pr merge 61 --merge=false');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('use --merge');
  });

  it("V11: a URL selector of another repository reads that repository's base protection", async () => {
    const r = await gate('gh pr merge https://github.com/other/repo/pull/61 --merge');
    expect(r.decision, r.reason).toBe('allow');
    const calls = shim!.calls();
    expect(calls.some((c) => c.args[0] === 'api' && c.ghRepo === 'other/repo')).toBe(true);
    expect(calls.some((c) => c.args[0] === 'api' && c.ghRepo === null)).toBe(false);
  });

  it('V12: a missing or non-numeric changedFiles means the file list cannot be checked', async () => {
    for (const changedFiles of [undefined, 'many', null]) {
      const r = await gate('gh pr merge 61 --merge', { prView: { ...prViewJson(), changedFiles } });
      expect(r.decision, String(changedFiles)).toBe('deny');
      expect(r.reason, String(changedFiles)).toContain('the file list cannot be checked');
    }
  });

  it('V13: a merge split across lines of interpreter text is caught', async () => {
    const r = await gate(`python3 -c "import subprocess\nsubprocess.run(['gh', 'pr',\n  'merge', '61', '--merge'])"`);
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('interpreter text');
  });

  it('V13: words far apart in interpreter prose are not a merge', async () => {
    const filler = 'x'.repeat(300);
    const r = await gate(`python3 -c "print('gh')\n# ${filler}\n# pr\n# ${filler}\nprint('merge')"`);
    expect(r.decision).toBe('none');
  });

  it('V23: a bad form and an empty AUTONOMOUS_MERGE_BASE are both named', async () => {
    const r = await gate('gh pr merge 61 --squash', { prView: prViewJson() }, { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: '' });
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('use --merge');
    expect(r.reason).toContain('flag --squash');
    expect(r.reason).toContain('AUTONOMOUS_MERGE_BASE is empty');
  });

  it("V23: a bad form and GitHub's failed conditions are named together", async () => {
    const r = await gate('gh pr merge 61 --merge --admin', { prView: prViewJson({ mergeable: 'CONFLICTING' }) });
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('flag --admin');
    expect(r.reason).toContain('CONFLICTING');
  });

  it('V23: when GitHub cannot be queried, the form failure is still named and the state is said unchecked', async () => {
    const r = await gate('gh pr merge 61 --merge --auto', { exitCode: 1 });
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('flag --auto');
    expect(r.reason).toContain('could not be queried');
    expect(r.reason).toContain('not checked');
  });

  // Depends on shell-words.mjs recording assignments after an `env` wrapper (V1, parser side).
  it('V1: env GH_REPO=x before gh is a GH_* assignment', async () => {
    const r = await gate('env GH_REPO=x gh pr merge 61 --merge');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('GH_*');
  });
});
