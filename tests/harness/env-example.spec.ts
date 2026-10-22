// agent-harness → "Example environment files are readable and editable"
// (openspec change autonomous-run-switch, design D8).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, REPO_ROOT, runHook, type Project } from './support/run-hook';

const readInput = (filePath: string) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } });

describe('Example environment files are readable and editable', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('The example file is read and edited', async () => {
    project = createProject();
    expect((await runHook(project, 'block-secret-reads', readInput(`${project.dir}/.env.example`))).decision).toBe('none');
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/packages/api/.env.sample`))).decision).toBe('none');
    expect((await runHook(project, 'spec-audit-gate', editInput(`${project.dir}/packages/api/.env.sample`))).decision).toBe('none');
    // In any letter case, and through the search tools.
    expect((await runHook(project, 'block-secret-reads', readInput(`${project.dir}/config/.ENV.Example`))).decision).toBe('none');
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/packages/api/.Env.Sample`))).decision).toBe('none');
    for (const input of [{ tool_name: 'Glob', tool_input: { pattern: '**/.env.example' } }, { tool_name: 'Grep', tool_input: { pattern: 'X', path: `${project.dir}/.env.sample` } }]) {
      expect((await runHook(project, 'block-secret-reads', { hook_event_name: 'PreToolUse', ...input })).decision, JSON.stringify(input)).toBe('none');
    }
    // Unattended mode, inside an approved change (the spec-audit gate's own rule is met).
    project.cleanup();
    project = createProject({
      env: { KIT_AUTONOMOUS_RUN: '1' },
      files: {
        'openspec/changes/foo-bar/proposal.md': '# p\n',
        'openspec/changes/foo-bar/reports/2026-10-21-spec-audit.md': 'APPROVED\n',
        '.env.example': 'X=\n',
        'packages/api/.env.sample': 'X=\n',
      },
      git: { branch: 'feature/DIS-9-foo-bar' },
    });
    expect((await runHook(project, 'block-secret-reads', readInput(`${project.dir}/.env.example`))).decision).toBe('none');
    for (const hook of ['protect-specs-and-tests', 'spec-audit-gate']) {
      const r = await runHook(project, hook, editInput(`${project.dir}/packages/api/.env.sample`));
      expect(r.decision, `${hook} ${r.reason}`).toBe('none');
    }
  });

  it('An example file under PATH_SOURCE is still code for the spec-audit gate in unattended mode', async () => {
    for (const report of [null, 'CHANGES REQUIRED\n']) {
      project?.cleanup();
      const files: Record<string, string> = { 'openspec/changes/foo-bar/proposal.md': '# p\n', 'packages/api/.env.sample': 'X=\n' };
      if (report) files['openspec/changes/foo-bar/reports/2026-10-21-spec-audit.md'] = report;
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' }, files, git: { branch: 'feature/DIS-9-foo-bar' } });
      const r = await runHook(project, 'spec-audit-gate', editInput(`${project.dir}/packages/api/.env.sample`));
      expect(r.decision, String(report)).toBe('deny');
      expect(r.reason).toContain('Spec audit gate');
    }
  });

  it('Real environment and secret files stay denied', async () => {
    project = createProject();
    for (const path of ['.env', '.env.local', 'config/.env.production', 'secrets/api.key', 'secrets/x.env.example', '.secrets/api.key', '.env::$DATA', '.env.sh', '.env.md']) {
      expect((await runHook(project, 'block-secret-reads', readInput(`${project.dir}/${path}`))).decision, path).toBe('deny');
    }
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/secrets/x.env.example`))).decision).toBe('deny');
    // Review round 4: an alternate data stream names its file; .env.sh and .env.md are environment files.
    for (const path of ['.env::$DATA', '.env:$DATA', '.env.sh', '.env.md']) {
      expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/${path}`))).decision, path).toBe('deny');
    }
  });

  it('keeps today\'s edit decisions for other secret-looking files with the switch off', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    for (const path of ['.npmrc', 'credentials.json', 'secrets/api.key']) {
      expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/${path}`))).decision, path).toBe('none');
    }
  });

  it('the settings deny list matches no example file but every real .env', () => {
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8')) as { permissions: { deny: string[] } };
    const globs = settings.permissions.deny
      .map((rule) => /^Read\((.*)\)$/.exec(rule)?.[1])
      .filter((g): g is string => Boolean(g));
    const toRegex = (glob: string) =>
      new RegExp(
        `^${glob
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*\//g, '<globstar>')
          .replace(/\*/g, '[^/]*')
          .replace(/<globstar>/g, '(?:.*/)?')}$`,
      );
    const denied = (path: string) => globs.some((g) => toRegex(g).test(path));
    for (const path of ['.env.example', 'packages/api/.env.example', '.env.sample']) expect(denied(path), path).toBe(false);
    for (const path of ['.env', 'packages/api/.env', '.env.local', 'x/.env.production', '.env.test.local']) expect(denied(path), path).toBe(true);
    for (const path of ['config/credentials.json', 'id_rsa', 'k/service-account-1.json']) expect(denied(path), path).toBe(true);
  });
});
