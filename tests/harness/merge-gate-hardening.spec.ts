// agent-harness → "The agent merges only in an autonomous run and under deterministic conditions"
// (openspec change autonomous-run-switch, design D4): the bypasses and gaps found by
// verify-against-spec on 2026-10-21 (V1, V3, V11, V12, V13, V23).
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
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

  // A `gh` placed before the shim that answers `gh api …/pulls/<n>/files` from a canned page (through
  // the real jq and the gate's own --jq filter) and passes every other call to the shim.
  let filesBin: string | undefined;
  afterEach(() => {
    if (filesBin) rmSync(filesBin, { recursive: true, force: true });
    filesBin = undefined;
  });
  function filesCalls(): Array<{ args: string[]; ghRepo: string | null }> {
    if (!filesBin || !existsSync(join(filesBin, 'calls.jsonl'))) return [];
    return readFileSync(join(filesBin, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  async function gateWithFiles(command: string, filesJson: string, view: unknown, mode: 'ok' | 'fail' | 'sleep' = 'ok') {
    project?.cleanup();
    shim?.cleanup();
    if (filesBin) rmSync(filesBin, { recursive: true, force: true });
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    shim = createGhShim({ prView: view });
    filesBin = mkdtempSync(join(tmpdir(), 'harness-ghfiles-')).replace(/\\/g, '/');
    writeFileSync(join(filesBin, 'files.json'), filesJson);
    writeFileSync(join(filesBin, 'record.cjs'), `require('fs').appendFileSync(${JSON.stringify(join(filesBin, 'calls.jsonl'))}, JSON.stringify({ args: process.argv.slice(2), ghRepo: process.env.GH_REPO || null }) + '\\n');\n`);
    writeFileSync(
      join(filesBin, 'gh'),
      [
        '#!/usr/bin/env bash',
        'if [[ "$1" == api && "$*" == */pulls/*/files* ]]; then',
        `  node "${filesBin}/record.cjs" "$@"`,
        `  ${mode === 'fail' ? 'exit 1' : mode === 'sleep' ? 'sleep 20' : ':'}`,
        '  f=.; prev=""; for a in "$@"; do [[ "$prev" == --jq ]] && f="$a"; prev="$a"; done',
        `  exec jq -r "$f" "${filesBin}/files.json"`,
        'fi',
        `exec "${shim.binDir}/gh" "$@"`,
        '',
      ].join('\n'),
    );
    chmodSync(join(filesBin, 'gh'), 0o755);
    return runHook(project, 'autonomous-merge-gate', bashInput(command, { cwd: project.dir }), {
      env: { PATH: `${filesBin}${delimiter}${shim.path}` },
    });
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

  it('A line too costly to check is denied in unattended mode', async () => {
    project?.cleanup();
    shim?.cleanup();
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    shim = createGhShim({ prView: prViewJson() });
    const started = Date.now();
    const r = await runHook(project, 'autonomous-merge-gate', bashInput(`${'eval true; '.repeat(170)}gh pr merge 61 --merge`, { cwd: project.dir }), {
      env: { PATH: shim.path },
      timeoutMs: 120_000,
    });
    const elapsed = Date.now() - started;
    expect(r.decision, r.reason).toBe('deny');
    expect(r.reason).toContain('too costly to check');
    // The hook timeout is 60 s; the denial must come well before it.
    expect(elapsed).toBeLessThan(45_000);
  });

  it('A pull request that renames a file out of the kit configuration is not merged', async () => {
    const files = (entries: Array<Record<string, string>>) => JSON.stringify(entries.map((e) => ({ status: 'modified', ...e })));
    const archived = { filename: 'openspec/changes/archive/2026-10-21-foo/proposal.md', status: 'added' };
    const cases: Array<[string, string, string[], string]> = [
      ['renamed out', files([archived, { filename: 'docs/old-merge-gate.sh', previous_filename: '.claude/hooks/autonomous-merge-gate.sh', status: 'renamed' }]), ['docs/old-merge-gate.sh', archived.filename], '.claude/hooks/autonomous-merge-gate.sh'],
      ['removed', files([archived, { filename: '.cursor/hooks.json', status: 'removed' }]), [archived.filename], '.cursor/hooks.json'],
      ['case variant', files([archived, { filename: '.Claude/hooks/lib.sh' }]), [archived.filename, '.Claude/hooks/lib.sh'], '.Claude/hooks/lib.sh'],
    ];
    for (const [label, filesJson, viewFiles, expected] of cases) {
      const r = await gateWithFiles('gh pr merge 61 --merge', filesJson, prViewJson({ files: viewFiles }));
      expect(r.decision, label).toBe('deny');
      expect(r.reason, label).toContain('kit configuration');
      expect(r.reason, label).toContain(expected);
      const query = [...shim!.calls(), ...filesCalls()].find((c) => c.args[0] === 'api' && c.args.some((a) => /pulls\/61\/files/.test(a)));
      expect(query, label).toBeDefined();
      expect(query!.args, label).toContain('--paginate');
    }
    // A clean list passes, and the query follows -R.
    const clean = await gateWithFiles('gh pr merge 61 --merge -R o/r', files([archived, { filename: 'packages/core/src/a.ts' }]), prViewJson());
    expect(clean.decision, clean.reason).toBe('allow');
    expect(filesCalls().some((c) => c.ghRepo === 'o/r')).toBe(true);
    // The query failing or timing out denies.
    for (const [label, mode] of [['fails', 'fail'], ['times out', 'sleep']] as const) {
      const r = await gateWithFiles('gh pr merge 61 --merge', files([archived]), prViewJson(), mode);
      expect(r.decision, label).toBe('deny');
      expect(r.reason, label).toContain('not checked');
    }
  });

  // Depends on shell-words.mjs recording assignments after an `env` wrapper (V1, parser side).
  it('V1: env GH_REPO=x before gh is a GH_* assignment', async () => {
    const r = await gate('env GH_REPO=x gh pr merge 61 --merge');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('GH_*');
  });
});
