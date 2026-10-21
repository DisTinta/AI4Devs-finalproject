// agent-harness → "The agent merges only in an autonomous run and under deterministic conditions"
// (openspec change autonomous-run-switch, design D4).
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';
import { createGhShim, prViewJson, type GhShim, type GhShimBehaviour } from './support/stubs';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };

describe('The agent merges only in an autonomous run and under deterministic conditions', { timeout: 180_000 }, () => {
  let project: Project | undefined;
  let shim: GhShim | undefined;
  afterEach(() => {
    project?.cleanup();
    shim?.cleanup();
    project = undefined;
    shim = undefined;
  });

  async function gate(command: string, behaviour: GhShimBehaviour = { prView: prViewJson() }, env: Record<string, string> = AUTONOMOUS, extra: Record<string, unknown> = {}) {
    project?.cleanup();
    shim?.cleanup();
    project = createProject({ env, git: { branch: 'feature/DIS-9-foo-bar' } });
    shim = createGhShim(behaviour);
    return runHook(project, 'autonomous-merge-gate', bashInput(command, { cwd: project.dir, ...extra }), { env: { PATH: shim.path } });
  }

  it('A pull request that meets every condition is merged', async () => {
    const r = await gate('gh pr merge 61 --merge');
    expect(r.decision, r.reason).toBe('allow');
    const calls = shim!.calls();
    expect(calls.some((c) => c.args.slice(0, 3).join(' ') === 'pr view 61')).toBe(true);
    expect(calls.some((c) => c.args[0] === 'api' && c.args.join(' ').includes('branches/final-project-CRN'))).toBe(true);
    const allSuccess = prViewJson({ checks: [1, 2, 3].map(() => ({ status: 'COMPLETED', conclusion: 'SUCCESS' })) });
    const three = await gate('gh pr merge 61 --merge', { prView: allSuccess });
    expect(three.decision, three.reason).toBe('allow');
  });

  it('Each unmet condition denies the merge', async () => {
    const cases: Array<[string, GhShimBehaviour, string, Record<string, string>?]> = [
      ['base', { prView: prViewJson({ baseRefName: 'main' }) }, 'main'],
      ['failed check', { prView: prViewJson({ checks: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] }) }, 'a check concluded FAILURE'],
      ['running check', { prView: prViewJson({ checks: [{ status: 'IN_PROGRESS' }] }) }, 'a check is still running (IN_PROGRESS)'],
      ['no checks', { prView: prViewJson({ checks: [] }) }, 'no checks'],
      ['conflict', { prView: prViewJson({ mergeable: 'CONFLICTING' }) }, 'CONFLICTING'],
      ['unknown', { prView: prViewJson({ mergeable: 'UNKNOWN' }) }, 'UNKNOWN'],
      ['truncated', { prView: prViewJson({ changedFiles: 150 }) }, 'incomplete'],
      ['no archive', { prView: prViewJson({ files: ['packages/core/src/a.ts'] }) }, 'archive'],
      ['kit file', { prView: prViewJson({ files: ['openspec/changes/archive/x/p.md', '.claude/settings.json'] }) }, '.claude'],
      ['unprotected', { prView: prViewJson(), protected: 'false' }, 'protected'],
      ['empty base', { prView: prViewJson() }, 'AUTONOMOUS_MERGE_BASE', { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: '' }],
    ];
    for (const [label, behaviour, expected, env] of cases) {
      const r = await gate('gh pr merge 61 --merge', behaviour, env ?? AUTONOMOUS);
      expect(r.decision, label).toBe('deny');
      expect(r.reason, label).toContain(expected);
    }
    const two = await gate('gh pr merge 61 --merge', { prView: prViewJson({ baseRefName: 'main', mergeable: 'CONFLICTING' }) });
    expect(two.reason).toContain('main');
    expect(two.reason).toContain('CONFLICTING');
  });

  it('The command form is restricted', async () => {
    for (const command of [
      'gh pr merge 61 --squash',
      'gh pr merge 61 -s',
      'gh pr merge 61 --merge --admin',
      'gh pr merge 61 --merge "--admin"',
      'gh pr merge 61 --merge --auto',
      'gh pr merge 61 -m -d',
      'gh pr checks 61 && gh pr merge 61 --merge',
      'gh pr merge 61 --merge &',
      'gh pr merge 61 --merge\ngh pr merge 62 --merge --admin',
    ]) {
      expect((await gate(command)).decision, command).toBe('deny');
    }
  });

  it('Other ways to merge are gated too', async () => {
    for (const command of [
      'bash -lc "gh pr merge 61 --merge --admin"',
      'pwsh -c "gh pr merge 61 --merge"',
      'gh -R DisTinta/repo pr merge 61 --squash',
      'GH_REPO=other/repo gh pr merge 61 --merge',
      'gh api -X PUT repos/DisTinta/repo/pulls/61/merge',
      'gh api -X PUT "repos/DisTinta/repo/pulls/61/merge"',
      'echo "$(gh pr merge 61 --admin)"',
    ]) {
      expect((await gate(command)).decision, command).toBe('deny');
    }
  });

  it('The selector is read without its quotes', async () => {
    for (const command of ['gh pr merge "61" --merge', 'gh pr merge 61 --merge -b "--admin text"']) {
      const r = await gate(command);
      expect(r.decision, `${command} ${r.reason}`).toBe('allow');
      expect(shim!.calls().some((c) => c.args.slice(0, 3).join(' ') === 'pr view 61')).toBe(true);
    }
  });

  it('Two positional words are denied', async () => {
    expect((await gate('gh pr merge 61 62 --merge')).decision).toBe('deny');
  });

  it('The state is read where the command runs', async () => {
    const other = mkdtempSync(join(tmpdir(), 'harness-clone-')).replace(/\\/g, '/');
    try {
      await gate(`cd ${other} && gh pr merge 61 --merge`);
      // A chained cd is not "the only command", so it is denied; the plain form below reads its cwd.
      const r = await gate('gh pr merge 61 --merge', { prView: prViewJson() }, AUTONOMOUS, { cwd: other });
      expect(r.decision).toBe('allow');
      expect(shim!.calls().every((c) => c.cwd.replace(/\\/g, '/').toLowerCase() === other.toLowerCase())).toBe(true);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('Mentioning the command in text is not a merge', async () => {
    for (const command of ['git commit -m "document gh pr merge"', 'gh pr create --title x --body "the author merges after the archive"']) {
      expect((await gate(command)).decision, command).toBe('none');
    }
  });

  it('GitHub cannot be queried', async () => {
    for (const behaviour of [
      { exitCode: 1 },
      { prView: prViewJson(), sleep: { pr: 20 } },
      { prView: prViewJson(), sleep: { api: 20 } },
      { prView: 'not json' },
      { prView: [] },
    ] as GhShimBehaviour[]) {
      expect((await gate('gh pr merge 61 --merge', behaviour)).decision, JSON.stringify(behaviour)).toBe('deny');
    }
  });

  it('Outside unattended mode the gate stays silent', async () => {
    expect((await gate('gh pr merge 61 --merge', { prView: prViewJson() }, { KIT_AUTONOMOUS_RUN: '0' })).decision).toBe('none');
  });

  it('a Cursor background agent with the switch off gets every merge denied', async () => {
    const r = await gate('gh pr merge 61 --merge', { prView: prViewJson() }, { KIT_AUTONOMOUS_RUN: '0' }, { is_background_agent: true });
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('KIT_AUTONOMOUS_RUN');
  });

  it('a crash inside the gate denies in unattended mode', async () => {
    const realJq = (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['jq'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0] ?? '').replace(/\\/g, '/');
    const bin = mkdtempSync(join(tmpdir(), 'harness-jq-')).replace(/\\/g, '/');
    try {
      // A jq that works, except on the filter that evaluates GitHub's answer.
      writeFileSync(join(bin, 'jq'), `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in *statusCheckRollup*) exit 5 ;; esac; done\nexec "${realJq}" "$@"\n`);
      chmodSync(join(bin, 'jq'), 0o755);
      project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
      shim = createGhShim({ prView: prViewJson() });
      const r = await runHook(project, 'autonomous-merge-gate', bashInput('gh pr merge 61 --merge', { cwd: project.dir }), {
        env: { PATH: `${bin}${delimiter}${shim.path}` },
      });
      expect(r.decision).toBe('deny');
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });

  it('deny() exits 2 when jq fails in unattended mode', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'harness-jq-')).replace(/\\/g, '/');
    try {
      writeFileSync(join(bin, 'jq'), '#!/usr/bin/env bash\nexit 5\n');
      chmodSync(join(bin, 'jq'), 0o755);
      project = createProject({ env: AUTONOMOUS });
      project.write('.claude/hooks/deny-probe.sh', '#!/usr/bin/env bash\nsource "$(dirname "${BASH_SOURCE[0]}")/lib.sh"\ndeny "probe"\n');
      const r = await runHook(project, 'deny-probe', {}, { env: { PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` } });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('probe');
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });

  it('passes the current branch, a branch selector and -R through', async () => {
    await gate('gh pr merge --merge');
    expect(shim!.calls().some((c) => c.args.join(' ') .startsWith('pr view --json'))).toBe(true);
    await gate('gh pr merge feature/x --merge');
    expect(shim!.calls().some((c) => c.args.slice(0, 3).join(' ') === 'pr view feature/x')).toBe(true);
    for (const command of ['gh -R o/r pr merge 61 --merge', 'gh pr merge 61 --merge -R o/r']) {
      await gate(command);
      const calls = shim!.calls();
      expect(calls.some((c) => c.args[0] === 'pr' && c.args.includes('-R') && c.args.includes('o/r')), command).toBe(true);
      expect(calls.some((c) => c.args[0] === 'api' && c.ghRepo === 'o/r'), command).toBe(true);
    }
  });
});
