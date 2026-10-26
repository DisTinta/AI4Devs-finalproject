// agent-harness → "The autonomous run is a manual switch that leaves the default behaviour intact"
// (openspec change autonomous-run-switch).
import { afterEach, describe, expect, it } from 'vitest';
import { bashInput, createProject, editInput, runHook, type Project } from './support/run-hook';

const MIGRATION = 'packages/adapters/store-postgres/migrations/0099_x.sql';

describe('The autonomous run is a manual switch that leaves the default behaviour intact', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('With the switch off the hooks keep their decisions', async () => {
    project = createProject({
      env: { KIT_AUTONOMOUS_RUN: '0' },
      files: {
        'tests/unit/a.spec.ts': 'export {};\n',
        'openspec/specs/llm-adapter/spec.md': '# spec\n',
      },
      git: { branch: 'feature/DIS-9-foo-bar' },
    });
    const p = project;
    const shell = (c: string) => runHook(p, 'block-dangerous-bash', bashInput(c));
    const edit = (f: string) => runHook(p, 'protect-specs-and-tests', editInput(`${p.dir}/${f}`));

    expect((await shell('git reset --hard')).decision).toBe('ask');
    expect((await shell('npm install left-pad@1.3.0')).decision).toBe('ask');
    expect((await shell('psql -c "DROP TABLE x"')).decision).toBe('ask');
    expect((await edit('tests/unit/a.spec.ts')).decision).toBe('ask');
    expect((await edit('openspec/specs/llm-adapter/spec.md')).decision).toBe('ask');
    expect((await edit('docs/base-standards.md')).decision).toBe('ask');

    p.write(MIGRATION, 'select 1;\n');
    p.git('add', MIGRATION);
    expect((await runHook(p, 'docs-gate', bashInput('git commit -m "add migration"'))).decision).toBe('ask');
  });

  it('With the switch off denials and silences are unchanged', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const p = project;
    const shell = async (c: string) => (await runHook(p, 'block-dangerous-bash', bashInput(c))).decision;

    for (const denied of [
      'rm -rf packages',
      'git commit -m "$(rm -rf packages)"',
      'git rm -r --cached x',
      'docker rm -f c',
      'git push --force',
      'chmod 777 x',
      'NODE_ENV=production npm run x',
    ]) {
      expect(await shell(denied), denied).toBe('deny');
    }
    for (const silent of ['npm test', 'npx vitest run', 'npm install --omit dev']) {
      expect(await shell(silent), silent).toBe('none');
    }
  });

  it('The session start warns when the switch is on', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' }, git: {} });
    const result = await runHook(project, 'session-context', { hook_event_name: 'SessionStart', source: 'startup' });
    const context = String((result.json?.hookSpecificOutput as Record<string, unknown> | undefined)?.additionalContext ?? '');
    const first = context.split('\n')[0] ?? '';
    expect(first).toContain('autonomous run: ON');
    expect(first).toContain('KIT_AUTONOMOUS_RUN');
    // additionalContext only reaches the model; systemMessage is what the user sees.
    expect(String(result.json?.systemMessage ?? '')).toContain('autonomous run: ON');
  });

  it('The session start shows no warning to the user when every switch is at its default', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0', KIT_PROTECT_SPECS: '1', KIT_SPEC_AUDIT_GATE: '1' }, git: {} });
    const result = await runHook(project, 'session-context', { hook_event_name: 'SessionStart', source: 'startup' });
    expect(result.json?.systemMessage).toBeUndefined();
  });

  it('The session start shows the user the protect-specs and spec-audit-gate warnings', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0', KIT_PROTECT_SPECS: '0', KIT_SPEC_AUDIT_GATE: '0' }, git: {} });
    const result = await runHook(project, 'session-context', { hook_event_name: 'SessionStart', source: 'startup' });
    const message = String(result.json?.systemMessage ?? '');
    expect(message).toContain('protect-specs: OFF');
    expect(message).toContain('spec-audit-gate: OFF');
    expect(message).not.toContain('autonomous run: ON');
  });

  it('A Cursor background agent runs unattended but not autonomous', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0', AUTONOMOUS_MERGE_BASE: 'final-project-CRN' } });
    const input = (command: string) => ({ hook_event_name: 'beforeShellExecution', command, cwd: project!.dir, is_background_agent: true });
    const reset = await runHook(project, 'block-dangerous-bash', input('git reset --hard'), { client: 'cursor' });
    expect(reset.json?.permission).toBe('deny');
    const merge = await runHook(project, 'autonomous-merge-gate', input('gh pr merge 61 --merge'), { client: 'cursor' });
    expect(merge.json?.permission).toBe('deny');
    expect(String(merge.json?.agent_message)).toContain('KIT_AUTONOMOUS_RUN');
  });
});
