// agent-harness → "A preflight checks the autonomous setup before a run"
// (openspec change autonomous-run-switch, design D13), plus the autonomous profile template (10.2).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, pathWithoutJq, REPO_ROOT, type Project } from './support/run-hook';
import { createCommandShims, type ShimRule } from './support/stubs';

const PROTECTION = JSON.stringify({
  required_pull_request_reviews: { required_approving_review_count: 0 },
  required_status_checks: { strict: false, contexts: ['scope', 'quality', 'verify', 'mutation', 'secrets'] },
  enforce_admins: { enabled: true },
});

interface Setup {
  env?: Record<string, string>;
  profileSettings?: unknown;
  localSettings?: unknown;
  noProfile?: boolean;
  gh?: Partial<Record<'auth' | 'runs' | 'protection', ShimRule>>;
  autoModeConfig?: string;
  dropCursorHooks?: boolean;
  dropGateRegistration?: boolean;
  dropVetPackage?: boolean;
  noJq?: boolean;
  argsOrder?: 'dest-first' | 'flag-first';
}

/** A complete installed kit in a temp dir (docs, ai-specs, hooks, settings, Cursor hooks). */
function kitProject(env: Record<string, string>): Project {
  const p = createProject({
    env,
    files: {
      'docs/base-standards.md': '# base\n',
      'docs/project-context.md': '# context\n',
      'CLAUDE.md': 'docs/base-standards.md\n',
      'AGENTS.md': 'docs/base-standards.md\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
      '.mcp.json': '{"mcpServers":{"context7":{},"playwright":{}}}\n',
      '.cursor/mcp.json': '{"mcpServers":{"context7":{}}}\n',
    },
  });
  mkdirSync(join(p.dir, 'ai-specs/skills/x'), { recursive: true });
  mkdirSync(join(p.dir, 'ai-specs/agents'), { recursive: true });
  mkdirSync(join(p.dir, '.claude/skills/enrich-us'), { recursive: true });
  cpSync(join(REPO_ROOT, '.claude/settings.json'), join(p.dir, '.claude/settings.json'));
  cpSync(join(REPO_ROOT, '.claude/doctor.sh'), join(p.dir, '.claude/doctor.sh'));
  cpSync(join(REPO_ROOT, '.cursor/hooks.json'), join(p.dir, '.cursor/hooks.json'));
  return p;
}

describe('A preflight checks the autonomous setup before a run', { timeout: 120_000 }, () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  function preflight(setup: Setup = {}) {
    const p = kitProject({ KIT_AUTONOMOUS_RUN: '1', AUTONOMOUS_MERGE_BASE: 'final-project-CRN', ...setup.env });
    cleanups.push(() => p.cleanup());
    const profile = mkdtempSync(join(tmpdir(), 'harness-profile-')).replace(/\\/g, '/');
    cleanups.push(() => rmSync(profile, { recursive: true, force: true }));
    writeFileSync(join(profile, 'settings.json'), JSON.stringify(setup.profileSettings ?? { permissions: { allow: [], deny: [] } }));
    if (setup.localSettings) writeFileSync(join(p.dir, '.claude/settings.local.json'), JSON.stringify(setup.localSettings));
    if (setup.dropCursorHooks) rmSync(join(p.dir, '.cursor/hooks.json'));
    if (setup.dropVetPackage) rmSync(join(p.dir, '.claude/hooks/vet-package.mjs'));
    if (setup.dropGateRegistration) {
      const s = readFileSync(join(p.dir, '.claude/settings.json'), 'utf8').replace(/autonomous-merge-gate/g, 'removed-gate');
      writeFileSync(join(p.dir, '.claude/settings.json'), s);
    }
    const shims = createCommandShims({
      claude: [{ prefix: ['auto-mode', 'config'], stdout: setup.autoModeConfig ?? '{"allow":["Merging a pull request into final-project-CRN with gh pr merge is pre-authorised"]}' }],
      gh: [
        setup.gh?.auth ?? { prefix: ['auth', 'status'], exitCode: 0 },
        setup.gh?.runs ?? { prefix: ['run', 'list'], stdout: '[{"status":"completed","conclusion":"success"}]' },
        setup.gh?.protection ?? { prefix: ['api'], stdout: PROTECTION },
      ],
      docker: [{ prefix: ['compose', 'ps'], exitCode: 0 }],
    });
    cleanups.push(() => shims.cleanup());
    const args = setup.argsOrder === 'flag-first' ? ['--autonomous', '--dest', p.dir] : [p.dir, '--autonomous'];
    if (!setup.noProfile) args.push('--config-dir', profile);
    const path = setup.noJq ? `${shims.path.split(process.platform === 'win32' ? ';' : ':')[0]}${process.platform === 'win32' ? ';' : ':'}${pathWithoutJq()}` : shims.path;
    const env = { ...process.env, PATH: path, CLAUDE_CONFIG_DIR: '' };
    const r = spawnSync('node', [join(REPO_ROOT, '.claude/hooks/invoke.cjs'), join(p.dir, '.claude/doctor.sh'), ...args], { env, encoding: 'utf8', cwd: p.dir });
    const out = stripVTControlCharacters(r.stdout + r.stderr);
    return { out, status: r.status, fails: out.split('\n').filter((l) => l.includes('FAIL')) };
  }

  it('A switch left off fails the preflight', () => {
    const r = preflight({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect(r.status).not.toBe(0);
    expect(r.fails.join('\n')).toContain('KIT_AUTONOMOUS_RUN');
  });

  it('An ask rule in the profile or the project fails the preflight', () => {
    const viaProfile = preflight({ profileSettings: { permissions: { ask: ['Bash(rmdir *)'] } } });
    expect(viaProfile.status).not.toBe(0);
    expect(viaProfile.fails.join('\n')).toMatch(/Bash\(rmdir \*\).*settings\.json|settings\.json.*Bash\(rmdir \*\)/);
    const viaLocal = preflight({ localSettings: { permissions: { ask: ['Bash(rmdir *)'] } } });
    expect(viaLocal.fails.join('\n')).toContain('settings.local.json');
  });

  it('A missing profile fails the preflight', () => {
    const r = preflight({ noProfile: true });
    expect(r.status).not.toBe(0);
    expect(r.fails.join('\n')).toContain('CLAUDE_CONFIG_DIR');
  });

  it('A missing merge authorisation or base fails the preflight', () => {
    const noBase = preflight({ env: { AUTONOMOUS_MERGE_BASE: '' } });
    expect(noBase.fails.join('\n')).toContain('AUTONOMOUS_MERGE_BASE');
    const noAuth = preflight({ autoModeConfig: '{"allow":[]}' });
    expect(noAuth.status).not.toBe(0);
    expect(noAuth.fails.join('\n')).toContain('merge authorisation');
  });

  it('GitHub problems fail the preflight', () => {
    expect(preflight({ gh: { auth: { prefix: ['auth', 'status'], exitCode: 1 } } }).fails.join('\n')).toContain('gh');
    expect(preflight({ gh: { runs: { prefix: ['run', 'list'], stdout: '[{"status":"completed","conclusion":"failure"}]' } } }).fails.join('\n')).toContain('CI');
    expect(preflight({ gh: { runs: { prefix: ['run', 'list'], stdout: '[{"status":"in_progress","conclusion":""}]' } } }).fails.join('\n')).toContain('CI');
    expect(preflight({ gh: { protection: { prefix: ['api'], exitCode: 1 } } }).fails.join('\n')).toContain('protect');
    const bypass = JSON.stringify({ ...JSON.parse(PROTECTION), enforce_admins: { enabled: false } });
    expect(preflight({ gh: { protection: { prefix: ['api'], stdout: bypass } } }).fails.join('\n')).toContain('administrators');
  });

  it('Missing hooks fail the preflight', () => {
    expect(preflight({ dropCursorHooks: true }).fails.join('\n')).toContain('.cursor/hooks.json');
    expect(preflight({ dropGateRegistration: true }).fails.join('\n')).toContain('autonomous-merge-gate');
  });

  it('A disabled spec protection gives a warning', () => {
    const r = preflight({ env: { KIT_SPEC_AUDIT_GATE: '0' } });
    expect(r.out).toMatch(/WARN.*KIT_SPEC_AUDIT_GATE/);
    expect(r.fails).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('A complete setup passes', () => {
    const r = preflight();
    expect(r.fails, r.out).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('fails without jq or vet-package.mjs, and accepts the flags in any order', () => {
    expect(preflight({ noJq: true }).fails.join('\n')).toContain('jq');
    expect(preflight({ dropVetPackage: true }).fails.join('\n')).toContain('vet-package.mjs');
    expect(preflight({ argsOrder: 'flag-first' }).status).toBe(0);
  });
});

describe('the autonomous profile template', () => {
  it('parses, has no ask rules, denies the bypass flags and keeps $defaults', () => {
    const tpl = JSON.parse(readFileSync(join(REPO_ROOT, 'ai-specs/templates/autonomous/claude-settings.json.tpl'), 'utf8')) as {
      permissions: { allow?: string[]; deny?: string[]; ask?: string[] };
      autoMode: Record<string, string[]>;
    };
    expect(tpl.permissions.ask ?? []).toEqual([]);
    for (const rule of ['Bash(*--dangerously-skip-permissions*)', 'Bash(*bypassPermissions*)', 'Bash(*--permission-mode*)']) {
      expect(tpl.permissions.deny).toContain(rule);
    }
    for (const list of Object.values(tpl.autoMode)) expect(list).toContain('$defaults');
    expect(tpl.autoMode.allow.join(' ')).toContain('gh pr merge');
    JSON.parse(readFileSync(join(REPO_ROOT, 'ai-specs/templates/autonomous/cursor-cli.json.tpl'), 'utf8'));
  });
});
