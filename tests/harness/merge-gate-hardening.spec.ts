// agent-harness → "The agent merges only in an autonomous run and under deterministic conditions"
// (openspec change autonomous-run-switch, design D4): the bypasses and gaps found by
// verify-against-spec on 2026-10-21 (V1, V3, V11, V12, V13, V23).
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  // A `gh` placed before the shim that answers `gh api …/pulls/<n>/files` from a canned page (through
  // the real jq and the gate's own --jq filter; a file holding several JSON values is several pages)
  // and passes every other call to the shim. The shim still records the files query (with GH_REPO)
  // and applies its exit code and delays to it.
  let filesBin: string | undefined;
  afterEach(() => {
    if (filesBin) rmSync(filesBin, { recursive: true, force: true });
    filesBin = undefined;
  });
  function pageOf(view: unknown): string {
    const files = (view as { files?: unknown } | null)?.files;
    return JSON.stringify(Array.isArray(files) ? files.map((f: { path: string }) => ({ filename: f.path, status: 'modified' })) : []);
  }
  async function run(
    command: string,
    behaviour: GhShimBehaviour,
    filesJson: string,
    opts: { env?: Record<string, string>; mode?: 'ok' | 'fail' | 'sleep' | 'raw'; processEnv?: Record<string, string>; timeoutMs?: number } = {},
  ) {
    project?.cleanup();
    shim?.cleanup();
    if (filesBin) rmSync(filesBin, { recursive: true, force: true });
    project = createProject({ env: opts.env ?? AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    shim = createGhShim(behaviour);
    filesBin = mkdtempSync(join(tmpdir(), 'harness-ghfiles-')).replace(/\\/g, '/');
    writeFileSync(join(filesBin, 'files.json'), filesJson);
    const mode = opts.mode ?? 'ok';
    writeFileSync(
      join(filesBin, 'gh'),
      [
        '#!/usr/bin/env bash',
        'if [[ "$1" == api && "$*" == */pulls/*/files* ]]; then',
        `  "${shim.binDir}/gh" "$@" > /dev/null || exit $?`,
        `  ${mode === 'fail' ? 'exit 1' : mode === 'sleep' ? 'sleep 20' : ':'}`,
        // raw: gh exits 0 printing files.json as is (a page its --jq filter never saw).
        `  ${mode === 'raw' ? `cat "${filesBin}/files.json"; exit 0` : ':'}`,
        '  f=.; prev=""; for a in "$@"; do [[ "$prev" == --jq ]] && f="$a"; prev="$a"; done',
        `  exec jq -r "$f" "${filesBin}/files.json"`,
        'fi',
        `exec "${shim.binDir}/gh" "$@"`,
        '',
      ].join('\n'),
    );
    chmodSync(join(filesBin, 'gh'), 0o755);
    return runHook(project, 'autonomous-merge-gate', bashInput(command, { cwd: project.dir }), {
      env: { PATH: `${filesBin}${delimiter}${shim.path}`, ...opts.processEnv },
      timeoutMs: opts.timeoutMs,
    });
  }
  async function gate(command: string, behaviour: GhShimBehaviour = { prView: prViewJson() }, env: Record<string, string> = AUTONOMOUS) {
    return run(command, behaviour, pageOf(behaviour.prView), { env });
  }
  async function gateWithFiles(command: string, filesJson: string, view: unknown, mode: 'ok' | 'fail' | 'sleep' | 'raw' = 'ok') {
    return run(command, { prView: view }, filesJson, { mode });
  }
  function filesCalls(): Array<{ args: string[]; ghRepo: string | null }> {
    return shim!.calls().filter((c) => c.args[0] === 'api' && c.args.some((a) => /\/pulls\/[0-9]+\/files/.test(a)));
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
    const started = Date.now();
    const r = await run(`${'eval true; '.repeat(170)}gh pr merge 61 --merge`, { prView: prViewJson() }, pageOf(prViewJson()), { timeoutMs: 120_000 });
    const elapsed = Date.now() - started;
    expect(r.decision, r.reason).toBe('deny');
    expect(r.reason).toContain('too costly to check');
    expect(r.reason).toContain('more than 20');
    // The hook timeout is 60 s; the denial must come well before it.
    expect(elapsed).toBeLessThan(45_000);
  });

  it("A line too costly to check: the shell guard's caps, at their boundary, named in the reason", async () => {
    const big = 'x'.repeat(65_536);
    const cases: Array<[string, string, string]> = [
      ['20 interpreter texts', `${'eval true; '.repeat(20)}echo ok`, ''],
      ['21 interpreter texts', `${'eval true; '.repeat(21)}echo ok`, 'interpreter texts, more than 20'],
      ['200 commands', `${'true; '.repeat(199)}echo ok`, ''],
      ['201 commands', `${'true; '.repeat(200)}echo ok`, 'commands, more than 200'],
      ['64 KB of interpreter text', `python3 -c "${big}"`, ''],
      ['64 KB + 1 of interpreter text', `python3 -c "${big}y"`, 'characters of interpreter text, more than 65536'],
    ];
    for (const [label, command, cap] of cases) {
      const r = await gate(command);
      if (cap) {
        expect(r.decision, label).toBe('deny');
        expect(r.reason, label).toContain('too costly to check');
        expect(r.reason, label).toContain(cap);
      } else {
        expect(r.decision, `${label}: ${r.reason}`).toBe('none');
      }
    }
    // With the switch "0" (attended) such a line keeps today's decision: the gate stays silent.
    expect((await gate(`${'eval true; '.repeat(21)}echo ok`, { prView: prViewJson() }, { KIT_AUTONOMOUS_RUN: '0' })).decision).toBe('none');
  });

  it("A line too costly to check: past the gate's time budget the merge is denied, naming the budget", async () => {
    const r = await run('gh pr merge 61 --merge', { prView: prViewJson() }, pageOf(prViewJson()), { processEnv: { KIT_GATE_TIME_BUDGET_S: '0' } });
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('too costly to check');
    expect(r.reason).toContain('time budget is 0 s');
    // The budget is read from the process only, never from sdd-harness.env.
    const fromFile = await run('gh pr merge 61 --merge', { prView: prViewJson() }, pageOf(prViewJson()), { env: { ...AUTONOMOUS, KIT_GATE_TIME_BUDGET_S: '0' } });
    expect(fromFile.decision, fromFile.reason).toBe('allow');
  });

  it('R3-5: a URL selector is read case-insensitively and in every form gh accepts', async () => {
    const cases: Array<[string, string, string]> = [
      ['HTTPS://GitHub.com/o/r/pull/5', 'o/r', '5'],
      ['https://www.github.com/o/r/pull/6', 'o/r', '6'],
      ['https://github.com/o/r/pull/7/files', 'o/r', '7'],
      ['https://github.com/o/r/pull/8#discussion_r1', 'o/r', '8'],
      ['Http://GHE.Example.com:443/o/r/pull/9', 'ghe.example.com/o/r', '9'],
    ];
    for (const [url, repo, n] of cases) {
      const r = await gate(`gh pr merge ${url} --merge`);
      expect(r.decision, `${url}: ${r.reason}`).toBe('allow');
      const api = shim!.calls().filter((c) => c.args[0] === 'api');
      expect(api.length, url).toBe(2);
      expect(api.every((c) => c.ghRepo === repo), `${url} ${JSON.stringify(api)}`).toBe(true);
      expect(filesCalls().some((c) => c.args.some((a) => a.includes(`pulls/${n}/files`))), url).toBe(true);
    }
    for (const url of ['HTTPS://github.com/o/r/issues/5', 'https://github.com/o/r/pull/5abc', 'ftp://github.com/o/r/pull/5', 'https:///o/r/pull/5', 'https://github.com/o%2Fx/r/pull/5']) {
      const r = await gate(`gh pr merge ${url} --merge`);
      expect(r.decision, url).toBe('deny');
      expect(r.reason, url).toContain('pull request URL cannot be read');
    }
  });

  it('R3-10: a files list shorter than changedFiles means the file list cannot be checked', async () => {
    const view = prViewJson({ files: ['openspec/changes/archive/2026-10-21-foo/proposal.md', 'packages/core/src/a.ts'] });
    const empty = await gateWithFiles('gh pr merge 61 --merge', '[]', view);
    expect(empty.decision).toBe('deny');
    expect(empty.reason).toContain('the file list cannot be checked');
    expect(empty.reason).toContain('0 of 2');
    const short = await gateWithFiles('gh pr merge 61 --merge', JSON.stringify([{ filename: 'packages/core/src/a.ts', status: 'modified' }]), view);
    expect(short.decision).toBe('deny');
    expect(short.reason).toContain('1 of 2');
    // Two pages that together list every file pass.
    const twoPages = `${JSON.stringify([{ filename: 'openspec/changes/archive/2026-10-21-foo/proposal.md', status: 'added' }])}\n${JSON.stringify([{ filename: 'packages/core/src/a.ts', status: 'modified' }])}\n`;
    const full = await gateWithFiles('gh pr merge 61 --merge', twoPages, view);
    expect(full.decision, full.reason).toBe('allow');
  });

  it('A pull request that renames a file out of the kit configuration is not merged', async () => {
    const files = (entries: Array<Record<string, string>>) => JSON.stringify(entries.map((e) => ({ status: 'modified', ...e })));
    const archived = { filename: 'openspec/changes/archive/2026-10-21-foo/proposal.md', status: 'added' };
    const cases: Array<[string, string, string[], string]> = [
      ['renamed out', files([archived, { filename: 'docs/old-merge-gate.sh', previous_filename: '.claude/hooks/autonomous-merge-gate.sh', status: 'renamed' }]), ['docs/old-merge-gate.sh', archived.filename], '.claude/hooks/autonomous-merge-gate.sh'],
      ['removed', files([archived, { filename: '.cursor/hooks.json', status: 'removed' }]), [archived.filename], '.cursor/hooks.json'],
      ['case variant', files([archived, { filename: '.Claude/hooks/lib.sh' }]), [archived.filename, '.Claude/hooks/lib.sh'], '.Claude/hooks/lib.sh'],
      // Only the files query carries the path: the lower-casing in its own filter is what catches it.
      ['case variant, files query only', files([archived, { filename: 'docs/a.md', previous_filename: '.Claude/hooks/lib.sh', status: 'renamed' }]), [archived.filename, 'docs/a.md'], '.Claude/hooks/lib.sh'],
    ];
    for (const [label, filesJson, viewFiles, expected] of cases) {
      const r = await gateWithFiles('gh pr merge 61 --merge', filesJson, prViewJson({ files: viewFiles }));
      expect(r.decision, label).toBe('deny');
      expect(r.reason, label).toContain('kit configuration');
      expect(r.reason, label).toContain(expected);
      const query = filesCalls().find((c) => c.args.some((a) => /pulls\/61\/files/.test(a)));
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

  // gh exits 0 yet prints no "<n> true" / "<n> kit …" line: the list was not read, so it is not clean.
  for (const [label, output] of [
    ['an HTML page', '<html>rate limited</html>' + String.fromCharCode(10)],
    ['an empty output', ''],
    ['a JSON page of the wrong shape', '{"message":"API rate limit exceeded","documentation_url":"https://docs.github.com"}' + String.fromCharCode(10)],
    // One valid page line covering every changed file plus garbage: the garbage line alone makes it unread.
    ['a mixed output (a valid page line plus garbage)', '2 true' + String.fromCharCode(10) + '<html>rate limited</html>' + String.fromCharCode(10)],
  ] as const) {
    it(`A pull request that renames a file out of the kit configuration is not merged: a file list read as ${label} with exit 0 denies`, async () => {
      const r = await gateWithFiles('gh pr merge 61 --merge', output, prViewJson(), 'raw');
      expect(r.decision, label).toBe('deny');
      expect(r.reason, label).toContain("GitHub's file list (renames and removals) could not be read");
    });
  }

  // Depends on shell-words.mjs recording assignments after an `env` wrapper (V1, parser side).
  it('V1: env GH_REPO=x before gh is a GH_* assignment', async () => {
    const r = await gate('env GH_REPO=x gh pr merge 61 --merge');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('GH_*');
  });
});
