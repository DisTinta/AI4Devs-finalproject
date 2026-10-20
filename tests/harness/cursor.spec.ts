// agent-harness → "Cursor runs the same hooks with the same decisions"
// (openspec change autonomous-run-switch, design D11).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, REPO_ROOT, runHook, type Project } from './support/run-hook';

const TOKEN = `ghp_${'A1b2C3d4E5'.repeat(3)}Z9y8X7`;
const cursor = { client: 'cursor' as const };

describe('Cursor runs the same hooks with the same decisions', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it("A dangerous command is denied in Cursor's format", async () => {
    project = createProject();
    const r = await runHook(project, 'block-dangerous-bash', { hook_event_name: 'beforeShellExecution', command: 'rm -rf packages', cwd: project.dir }, cursor);
    expect(r.json?.permission).toBe('deny');
    expect(r.json?.user_message).toBeTruthy();
    expect(r.json?.agent_message).toBeTruthy();
  });

  it('A shell confirmation stays a confirmation in Cursor', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const r = await runHook(project, 'block-dangerous-bash', { hook_event_name: 'beforeShellExecution', command: 'git reset --hard', cwd: project.dir }, cursor);
    expect(r.json?.permission).toBe('ask');
  });

  it("A secret file read is denied in Cursor's format", async () => {
    project = createProject();
    const r = await runHook(project, 'block-secret-reads', { hook_event_name: 'beforeReadFile', file_path: `${project.dir}/.env`, content: '' }, cursor);
    expect(r.json?.permission).toBe('deny');
  });

  it("A prompt with a secret is stopped in Cursor's format", async () => {
    project = createProject();
    const r = await runHook(project, 'block-secrets', { hook_event_name: 'beforeSubmitPrompt', prompt: `use ${TOKEN}` }, cursor);
    expect(r.json?.continue).toBe(false);
    expect(r.json?.user_message).toBeTruthy();
  });

  it('A protected edit outside unattended mode warns in Cursor', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' }, files: { 'tests/unit/a.spec.ts': 'export {};\n' } });
    const r = await runHook(project, 'protect-specs-and-tests', { hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: `${project.dir}/tests/unit/a.spec.ts` } }, cursor);
    expect(r.json?.permission).toBe('allow');
    expect(String(r.json?.agent_message)).toContain('MODIFY an existing test');
    expect(r.json?.user_message).toBeTruthy();
  });

  it('The session start carries the autonomous warning in Cursor', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' }, git: {} });
    const r = await runHook(project, 'session-context', { hook_event_name: 'sessionStart', session_id: 's1', is_background_agent: false }, cursor);
    expect(String(r.json?.additional_context ?? '').split('\n')[0]).toContain('autonomous run: ON');
  });

  it('A red suite at stop becomes a follow-up in Cursor', async () => {
    const stop = (loop: number) => ({ hook_event_name: 'stop', status: 'completed', loop_count: loop });
    const changed = (p: Project) => {
      p.write('tests/unit/a.spec.ts', 'export const changed = 1;\n');
    };
    project = createProject({ env: { CMD_TEST: 'false', PATH_TESTS: 'tests' }, files: { 'tests/unit/a.spec.ts': 'export {};\n' }, git: {} });
    changed(project);
    const red = await runHook(project, 'verify-tests', stop(0), cursor);
    expect(String(red.json?.followup_message ?? '')).toContain('test suite fails');
    expect((await runHook(project, 'verify-tests', stop(1), cursor)).stdout.trim()).toBe('');
    project.cleanup();
    project = createProject({ env: { CMD_TEST: 'true', PATH_TESTS: 'tests' }, files: { 'tests/unit/a.spec.ts': 'export {};\n' }, git: {} });
    changed(project);
    expect((await runHook(project, 'verify-tests', stop(0), cursor)).stdout.trim()).toBe('');
  });

  it('The Cursor hook file only points to existing hooks', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, '.cursor/hooks.json'), 'utf8')) as {
      version: number;
      hooks: Record<string, Array<{ command: string; timeout?: number }>>;
    };
    expect(config.version).toBe(1);
    const entries = Object.values(config.hooks).flat();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.timeout, entry.command).toBeGreaterThan(0);
      const scripts = entry.command.split(/\s+/).filter((w) => /\.(sh|cjs|mjs)$/.test(w));
      expect(scripts.length, entry.command).toBeGreaterThan(0);
      for (const s of scripts) expect(existsSync(join(REPO_ROOT, s)), s).toBe(true);
    }
  });
});
