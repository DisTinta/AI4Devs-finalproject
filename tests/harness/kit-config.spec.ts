// agent-harness → "The kit configuration and the local switch stay untouched in an autonomous run"
// — the shell half (openspec change autonomous-run-switch, design D5).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';

const AUTONOMOUS = { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' };

describe('The kit configuration and the local switch stay untouched in an autonomous run', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  async function decisions(p: Project, commands: string[], extra: Record<string, unknown> = {}) {
    const out: Record<string, string> = {};
    for (const c of commands) out[c] = (await runHook(p, 'block-dangerous-bash', bashInput(c, { cwd: p.dir, ...extra }))).decision;
    return out;
  }

  it('Editing kit configuration is denied (shell half)', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const d = await decisions(project, [
      "sed -i 's/x/y/' .cursor/hooks.json",
      'mv .claude/hooks/autonomous-merge-gate.sh /tmp/',
      'git -C .claude add settings.json',
      `sed -i 's/x/y/' "$CLAUDE_PROJECT_DIR/.claude/hooks/lib.sh"`,
      'cd "$CLAUDE_PROJECT_DIR" && git add .claude/settings.json',
    ]);
    for (const [c, v] of Object.entries(d)) expect(v, c).toBe('deny');
    const inHooks = await runHook(project, 'block-dangerous-bash', bashInput("sed -i 's/a/b/' lib.sh", { cwd: `${project.dir}/.claude/hooks` }));
    expect(inHooks.decision).toBe('deny');
  });

  it('Staging or reverting kit configuration is denied', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const d = await decisions(project, [
      'git add .claude/settings.json',
      'git add ".claude/settings.json"',
      'git add .claude',
      "sh -c 'git add -A'",
      'echo "git add -A" | sh',
      'git restore .cursor/hooks.json',
      'git checkout HEAD -- .cursor',
    ]);
    for (const [c, v] of Object.entries(d)) expect(v, c).toBe('deny');
  });

  it('Whole-tree or glob staging is denied', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    for (const c of ['git add -A', 'git add -u', 'git add :/', "git add '*.env'", 'git commit -am "wip"', 'git commit .']) {
      const r = await runHook(project, 'block-dangerous-bash', bashInput(c, { cwd: project.dir }));
      expect(r.decision, c).toBe('deny');
      expect(r.reason, c).toMatch(/explicit paths|could also revert/);
    }
    // An attached message is not a whole-tree flag.
    expect((await decisions(project, ['git commit -m"add x"']))['git commit -m"add x"']).toBe('none');
  });

  it('A stash or restore that could reach the switch is denied', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    for (const c of ['git stash', 'git stash push', 'git stash push -- .', 'git restore "."', 'git restore :/', "git restore '*.env'", 'git checkout HEAD -- .', 'git checkout -- .']) {
      const r = await runHook(project, 'block-dangerous-bash', bashInput(c, { cwd: project.dir }));
      expect(r.decision, c).toBe('deny');
      expect(r.reason, c).toMatch(/git stash push -- <paths>|git restore -- <paths>/);
    }
  });

  it('A forced branch change is denied', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const d = await decisions(project, ['git checkout -f main', 'git switch --discard-changes main']);
    for (const [c, v] of Object.entries(d)) expect(v, c).toBe('deny');
  });

  it('A permission bypass is denied', async () => {
    project = createProject({ env: AUTONOMOUS });
    const d = await decisions(project, [
      'claude -p --agent spec-auditor --dangerously-skip-permissions',
      'claude -p --permission-mode bypassPermissions "x"',
    ]);
    for (const [c, v] of Object.entries(d)) expect(v, c).toBe('deny');
  });

  it('Pushing or merging into the base directly is denied', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const d = await decisions(project, [
      'git push origin HEAD:final-project-CRN',
      'git push origin +HEAD:final-project-CRN',
      'git push origin final-project-CRN',
      'git push --all origin',
      'gh api -X DELETE repos/DisTinta/repo/branches/final-project-CRN/protection',
      'gh api --method=DELETE repos/DisTinta/repo/branches/final-project-CRN/protection',
      'gh api repos/DisTinta/repo/branches/final-project-CRN/protection/enforce_admins -f x=y',
    ]);
    for (const [c, v] of Object.entries(d)) expect(v, c).toBe('deny');
    project.git('checkout', '-q', '-b', 'final-project-CRN');
    const onBase = await decisions(project, ['git push', 'git merge feature/DIS-9-x']);
    for (const [c, v] of Object.entries(onBase)) expect(v, c).toBe('deny');
  });

  it('Explicit source paths stay free', async () => {
    project = createProject({ env: AUTONOMOUS, git: { branch: 'feature/DIS-9-foo-bar' } });
    const d = await decisions(project, ['git stash push -- src/x.ts', 'git add packages/core/src/a.ts', 'git push -u origin feature/DIS-9-foo-bar']);
    for (const [c, v] of Object.entries(d)) expect(v, c).toBe('none');
  });

  it('Outside an autonomous run kit files can be committed', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' }, git: {} });
    const r = await runHook(project, 'block-dangerous-bash', bashInput('git add .claude/hooks/lib.sh', { cwd: project.dir }));
    expect(r.decision).toBe('none');
  });
});
