// Conformance fixes of the verify-against-spec report (openspec change autonomous-run-switch,
// reports/2026-10-21-verify-against-spec.md, findings V10, V14, V15, V25-V28, V31): the cases the
// scenario tests did not exercise.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bashInput, createProject, editInput, pathWithoutJq, runHook, type Project } from './support/run-hook';
import { startRegistry, type Registry, type StubPackage } from './support/stubs';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const CHANGE = 'openspec/changes/foo-bar';

/** A git project on feature/DIS-9-foo-bar with one active change and the given spec-audit report. */
function changeProject(report: string | null, env: Record<string, string> = {}): Project {
  const files: Record<string, string> = {
    [`${CHANGE}/proposal.md`]: '# proposal\n',
    [`${CHANGE}/tasks.md`]: '- [ ] 1.1 something\n',
    [`${CHANGE}/specs/reports/spec.md`]: '# nested reports folder inside specs\n',
    [`${CHANGE}/specs/x/tasks.md`]: '# nested tasks.md inside specs\n',
    [`${CHANGE}/reports/x.md`]: 'notes\n',
    'openspec/changes/other-change/specs/reports/a.md': '# other\n',
    'tests/unit/a.spec.ts': 'export {};\n',
  };
  if (report !== null) files[`${CHANGE}/reports/2026-10-21-spec-audit.md`] = report;
  return createProject({
    env: { KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN', ...env },
    files,
    git: { branch: 'feature/DIS-9-foo-bar' },
  });
}

describe('Conformance: package vetting reads every value (V14)', { timeout: 120_000 }, () => {
  let registry: Registry;
  let project: Project | undefined;
  const good = (extra: Partial<StubPackage> = {}): StubPackage => ({
    created: ago(730),
    repository: { type: 'git', url: 'git+https://github.com/x/y.git' },
    versions: { '1.0.0': { published: ago(365) } },
    weeklyDownloads: 2_000_000,
    ...extra,
  });

  beforeAll(async () => {
    registry = await startRegistry({
      'bad-created': good({ created: 'not-a-date' }),
      'bad-published': good({ versions: { '1.0.0': { published: 'yesterday-ish' } } }),
      'no-published': good({ versions: { '1.0.0': { published: undefined as unknown as string } } }),
      'bad-downloads': good({ weeklyDownloads: 'many' as unknown as number }),
    });
  });
  afterAll(async () => registry.close());
  afterEach(() => project?.cleanup());

  it('denies a value that cannot be read, naming the check', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const cases: Array<[string, string]> = [
      ['npm i bad-created@1.0.0', 'first-publication date cannot be read'],
      ['npm i bad-published@1.0.0', 'publication date of the version cannot be read'],
      ['npm i no-published@1.0.0', 'publication date of the version cannot be read'],
      ['npm i bad-downloads@1.0.0', 'weekly downloads cannot be read'],
    ];
    for (const [command, expected] of cases) {
      const r = await runHook(project, 'block-dangerous-bash', bashInput(command), {
        env: { KIT_NPM_REGISTRY: registry.registryUrl, KIT_NPM_DOWNLOADS: registry.downloadsUrl },
      });
      expect(r.decision, `${command} ${r.reason}`).toBe('deny');
      expect(r.reason, command).toContain(expected);
    }
  });
});

describe('Conformance: the denial log stays one JSON line after redaction (V15)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const TOKEN = `ghp_${'A1b2C3d4E5'.repeat(3)}Z9y8X7`;

  it('redacts KEY=value, GitHub tokens and private keys inside the values', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const commands = [
      'export DB_PASSWORD=hunter2222',
      `curl -H "Authorization: ${TOKEN}"`,
      'printf "-----BEGIN RSA PRIVATE KEY-----"',
    ];
    for (const command of commands) {
      const r = await runHook(project, 'log-permission-denied', {
        hook_event_name: 'PermissionDenied',
        tool_name: 'Bash',
        tool_input: { command },
        reason: 'classifier_denied',
      });
      expect(r.exitCode).toBe(0);
    }
    const lines = readFileSync(join(project.dir, '.claude/autonomous-denials.log'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const entries = lines.map((l) => JSON.parse(l) as { tool_name: string; reason: string; tool_input: { command: string } });
    for (const e of entries) {
      expect(e.tool_name).toBe('Bash');
      expect(e.reason).toBe('classifier_denied');
      expect(e.tool_input.command).toContain('[REDACTED]');
    }
    const text = lines.join('\n');
    for (const secret of ['hunter2222', TOKEN, 'BEGIN RSA PRIVATE KEY']) expect(text).not.toContain(secret);
  });
});

describe('Conformance: kit configuration fails closed (V25)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  for (const [label, script] of [
    ['crashes', 'process.exit(3);\n'],
    ['prints something unreadable', 'process.stdout.write("maybe\\n");\n'],
  ]) {
    it(`treats the path as kit configuration when the check ${label}`, async () => {
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
      project.write('.claude/hooks/shell-words.mjs', script);
      const r = await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/README.md`));
      expect(r.decision).toBe('deny');
      expect(r.reason).toContain('could not be checked');
    });
  }

  it('leaves a non-autonomous run unchanged when the check crashes', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    project.write('.claude/hooks/shell-words.mjs', 'process.exit(3);\n');
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/README.md`))).decision).toBe('none');
  });
});

describe('Conformance: free paths match whole segments (V26)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const edit = (p: Project, path: string) => runHook(p, 'protect-specs-and-tests', editInput(`${p.dir}/${path}`));

  it('a reports or tasks.md name nested in another folder of a change is not free', async () => {
    // No correction round: the change's own artifacts are protected, so only free paths pass.
    project = changeProject('CHANGES REQUIRED\n', { AUTONOMOUS_AUDIT_ROUNDS: '0' });
    for (const path of [`${CHANGE}/specs/reports/spec.md`, `${CHANGE}/specs/x/tasks.md`, 'openspec/changes/other-change/specs/reports/a.md']) {
      expect((await edit(project, path)).decision, path).toBe('deny');
    }
    for (const path of [`${CHANGE}/tasks.md`, `${CHANGE}/reports/x.md`]) {
      expect((await edit(project, path)).decision, path).toBe('none');
    }
  });
});

describe('Conformance: a test outside the repository is not the branch\'s own (V27)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  let outside: string | undefined;
  afterEach(() => {
    project?.cleanup();
    if (outside) rmSync(outside, { recursive: true, force: true });
  });

  it('gets no decision, like every file outside the repository', async () => {
    project = changeProject('APPROVED\n');
    outside = mkdtempSync(join(tmpdir(), 'harness-outside-')).replace(/\\/g, '/');
    const file = `${outside}/tests/unit/z.spec.ts`;
    // An existing file under a `tests/` folder outside the repository.
    mkdirSync(`${outside}/tests/unit`, { recursive: true });
    writeFileSync(file, 'export {};\n');
    const r = await runHook(project, 'protect-specs-and-tests', editInput(file));
    expect(r.decision, r.reason).toBe('none');
    expect(r.reason).not.toContain('created by this branch');
  });
});

describe('Conformance: the kit contract edit names the alternative (V31)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('denies in unattended mode with the hand-edit alternative', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
    const r = await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/.claude/sdd-harness.env`));
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('The contract is edited by hand by the author; stop and report what needs changing.');
    project.cleanup();
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    const bg = await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/.claude/sdd-harness.env`, 'Edit', { is_background_agent: true }));
    expect(bg.decision).toBe('deny');
    expect(bg.reason).toContain('edited by hand by the author');
    project.cleanup();
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${project.dir}/.claude/sdd-harness.env`))).decision).toBe('ask');
  });
});

describe('Conformance: the spec-audit gate needs a readable APPROVED (V10)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const code = (p: Project) => runHook(p, 'spec-audit-gate', editInput(`${p.dir}/packages/core/src/x.ts`, 'Write'));

  for (const [label, report] of [
    ['no verdict line', '# Spec audit\n\nStill reviewing.\n'],
    ['only a fenced verdict', '# Spec audit\n\n```\nAPPROVED\n```\n'],
  ]) {
    it(`denies code in unattended mode when the report has ${label}`, async () => {
      project = changeProject(report);
      const r = await code(project);
      expect(r.decision).toBe('deny');
      expect(r.reason).toContain('no APPROVED verdict');
    });
  }

  it('keeps the attended rule: any report lets code through', async () => {
    project = changeProject('# Spec audit\n\nStill reviewing.\n', { KIT_AUTONOMOUS_RUN: '0' });
    expect((await code(project)).decision).toBe('none');
  });
});

describe('Conformance: the allowlist runs as written (V28)', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());
  const prompt = (text: string) => ({ hook_event_name: 'UserPromptSubmit', prompt: text });

  it('keeps an escaped dot literal', async () => {
    project = createProject({ env: { KIT_SECRET_ALLOWLIST: 'DB_PASSWORD=SENTINEL\\.[a-z0-9-]+' } });
    expect((await runHook(project, 'block-secrets', prompt('fixture DB_PASSWORD=SENTINEL.hdr-demo'))).decision).toBe('none');
    expect((await runHook(project, 'block-secrets', prompt('fixture DB_PASSWORD=SENTINELxhdr-demo'))).decision).toBe('block');
  });
});

describe('Conformance: without jq the edit and read guards deny in unattended mode', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('denies in protect-specs-and-tests, spec-audit-gate and block-secret-reads', async () => {
    project = changeProject('APPROVED\n');
    const path = pathWithoutJq();
    const cases: Array<[string, Record<string, unknown>]> = [
      ['protect-specs-and-tests', editInput(`${project.dir}/README.md`)],
      ['spec-audit-gate', editInput(`${project.dir}/packages/core/src/x.ts`, 'Write')],
      ['block-secret-reads', { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `${project.dir}/notes.md` } }],
    ];
    for (const [hook, input] of cases) {
      const r = await runHook(project, hook, input, { env: { PATH: path } });
      expect(r.exitCode, hook).toBe(2);
      expect(r.stderr, hook).toContain('jq is required');
    }
  });
});
