// agent-harness → "Denials of an autonomous run are logged locally"
// (openspec change autonomous-run-switch, design D10).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, runHook, type Project } from './support/run-hook';

const TOKEN = `ghp_${'A1b2C3d4E5'.repeat(3)}Z9y8X7`;
const denial = (command: string) => ({
  hook_event_name: 'PermissionDenied',
  tool_name: 'Bash',
  tool_input: { command },
  reason: 'classifier_denied',
  classifier_verdict: 'deny',
});

describe('Denials of an autonomous run are logged locally', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const log = (p: Project) => join(p.dir, '.claude/autonomous-denials.log');

  it('A classifier denial is logged', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const r = await runHook(project, 'log-permission-denied', denial('gh pr merge 61 --merge'));
    expect(r.exitCode).toBe(0);
    const lines = readFileSync(log(project), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry.tool_name).toBe('Bash');
    expect(entry.reason).toBe('classifier_denied');
    expect(JSON.stringify(entry.tool_input)).toContain('gh pr merge 61 --merge');
    expect(typeof entry.ts).toBe('string');
    expect(entry.classifier_verdict).toBe('deny');
    expect(lines[0]).toContain('"classifier_verdict":"deny"');
    // An event without a classifier verdict logs no such key.
    const plain: Record<string, unknown> = { ...denial('gh pr merge 62 --merge') };
    delete plain.classifier_verdict;
    await runHook(project, 'log-permission-denied', plain);
    const second = JSON.parse(readFileSync(log(project), 'utf8').trim().split('\n')[1]) as Record<string, unknown>;
    expect(second).not.toHaveProperty('classifier_verdict');
  });

  it('Secrets in a denied input are redacted', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    await runHook(project, 'log-permission-denied', denial(`curl -H "Authorization: ${TOKEN}" x`));
    const text = readFileSync(log(project), 'utf8');
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain(TOKEN);
  });

  it('An unwritable log does not block', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    mkdirSync(log(project), { recursive: true });
    const r = await runHook(project, 'log-permission-denied', denial('x'));
    expect(r.exitCode).toBe(0);
    expect(r.decision).toBe('none');
  });

  it('Nothing is logged outside an autonomous run', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const r = await runHook(project, 'log-permission-denied', denial('x'));
    expect(r.exitCode).toBe(0);
    expect(existsSync(log(project))).toBe(false);
    // A log left by an earlier autonomous run is not changed either.
    const earlier = '{"ts":"2026-10-20T10:00:00Z","tool_name":"Bash","reason":"classifier_denied","tool_input":{"command":"y"}}\n';
    writeFileSync(log(project), earlier);
    expect((await runHook(project, 'log-permission-denied', denial('x'))).exitCode).toBe(0);
    expect(readFileSync(log(project), 'utf8')).toBe(earlier);
  });
});
