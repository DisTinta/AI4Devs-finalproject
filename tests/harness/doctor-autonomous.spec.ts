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
  /** Raw text for `.claude/settings.local.json` (to write a file that is not valid JSON). */
  localSettingsRaw?: string;
  /** Keys removed from sdd-harness.env altogether (not just emptied). */
  dropEnvKeys?: string[];
  gh?: Partial<Record<'auth' | 'runs' | 'protection', ShimRule>> & { api?: ShimRule[] };
  autoModeConfig?: string;
  dropCursorHooks?: boolean;
  dropGateRegistration?: boolean;
  dropVetPackage?: boolean;
  dropPathsMjs?: boolean;
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
    if (setup.localSettingsRaw !== undefined) writeFileSync(join(p.dir, '.claude/settings.local.json'), setup.localSettingsRaw);
    if (setup.dropEnvKeys) {
      const envPath = join(p.dir, '.claude/sdd-harness.env');
      const kept = readFileSync(envPath, 'utf8').split('\n').filter((l) => !setup.dropEnvKeys!.some((k) => l.startsWith(`${k}=`)));
      writeFileSync(envPath, kept.join('\n'));
    }
    if (setup.dropCursorHooks) rmSync(join(p.dir, '.cursor/hooks.json'));
    if (setup.dropVetPackage) rmSync(join(p.dir, '.claude/hooks/vet-package.mjs'));
    if (setup.dropPathsMjs) rmSync(join(p.dir, '.claude/hooks/paths.mjs'));
    if (setup.dropGateRegistration) {
      const s = readFileSync(join(p.dir, '.claude/settings.json'), 'utf8').replace(/autonomous-merge-gate/g, 'removed-gate');
      writeFileSync(join(p.dir, '.claude/settings.json'), s);
    }
    const shims = createCommandShims({
      claude: [{ prefix: ['auto-mode', 'config'], stdout: setup.autoModeConfig ?? '{"allow":["Merging a pull request into final-project-CRN with gh pr merge is pre-authorised"]}' }],
      gh: [
        setup.gh?.auth ?? { prefix: ['auth', 'status'], exitCode: 0 },
        setup.gh?.runs ?? { prefix: ['run', 'list'], stdout: '[{"status":"completed","conclusion":"success"}]' },
        ...(setup.gh?.api ?? []),
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

  /** Expects a FAIL line containing `text`, a non-zero exit, and a run that reached the Summary. */
  function expectFail(r: ReturnType<typeof preflight>, text: string | RegExp) {
    if (typeof text === 'string') expect(r.fails.join('\n'), r.out).toContain(text);
    else expect(r.fails.join('\n'), r.out).toMatch(text);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toContain('Summary:');
  }

  const API = 'repos/{owner}/{repo}';
  const BASE = 'final-project-CRN';
  const notProtected: ShimRule = { prefix: ['api', `${API}/branches/${BASE}/protection`], stdout: '{"message":"Branch not protected","status":"404"}', exitCode: 1 };
  const rulesOf = (types: string[]): ShimRule => ({
    prefix: ['api', `${API}/rules/branches/${BASE}`],
    stdout: JSON.stringify(types.map((type) => ({ type, ruleset_id: 7, ruleset_source: 'o/r' }))),
  });
  const ruleset = (bypass: unknown[] | undefined): ShimRule => ({
    prefix: ['api', `${API}/rulesets/7`],
    stdout: JSON.stringify({ id: 7, ...(bypass ? { bypass_actors: bypass } : {}) }),
  });

  it('A switch left off fails the preflight', () => {
    const r = preflight({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    expect(r.status).not.toBe(0);
    expect(r.fails.join('\n')).toContain('KIT_AUTONOMOUS_RUN');
  });

  it('An ask rule in the profile or the project fails the preflight', () => {
    const viaProfile = preflight({ profileSettings: { permissions: { ask: ['Bash(rmdir *)'] } } });
    expectFail(viaProfile, /Bash\(rmdir \*\).*settings\.json|settings\.json.*Bash\(rmdir \*\)/);
    const viaLocal = preflight({ localSettings: { permissions: { ask: ['Bash(rmdir *)'] } } });
    expectFail(viaLocal, /Bash\(rmdir \*\).*settings\.local\.json/);
  });

  it('never stops before the summary: a missing env key, an invalid settings file, a gh run list error', () => {
    expectFail(preflight({ dropEnvKeys: ['AUTONOMOUS_MERGE_BASE'] }), 'AUTONOMOUS_MERGE_BASE');
    const noAllowlist = preflight({ dropEnvKeys: ['KIT_SECRET_ALLOWLIST'] });
    expect(noAllowlist.fails, noAllowlist.out).toEqual([]);
    expect(noAllowlist.out).toContain('Summary:');
    expect(noAllowlist.status).toBe(0);
    expectFail(preflight({ localSettingsRaw: '{ "permissions": ' }), /settings\.local\.json is not valid JSON/);
    const runError = preflight({ gh: { runs: { prefix: ['run', 'list'], exitCode: 1 } } });
    expectFail(runError, 'successful (none)');
    expect(runError.out).toContain('requires a pull request');
  });

  it('A missing profile fails the preflight', () => {
    const r = preflight({ noProfile: true });
    expect(r.status).not.toBe(0);
    expect(r.fails.join('\n')).toContain('CLAUDE_CONFIG_DIR');
  });

  it('A missing merge authorisation or base fails the preflight', () => {
    const noBase = preflight({ env: { AUTONOMOUS_MERGE_BASE: '' } });
    expectFail(noBase, 'AUTONOMOUS_MERGE_BASE');
    expect(noBase.out).toContain('gh authenticated');
    expect(noBase.fails.join('\n')).toMatch(/CI run.*AUTONOMOUS_MERGE_BASE|AUTONOMOUS_MERGE_BASE.*CI run/);
    expectFail(preflight({ autoModeConfig: '{"allow":[]}' }), 'merge authorisation');
    // Both strings present, but in different rules: no rule authorises merging into the base.
    const split = preflight({
      autoModeConfig: JSON.stringify({ allow: ['Merging with gh pr merge is pre-authorised', 'Pushing to final-project-CRN is allowed'] }),
    });
    expectFail(split, 'merge authorisation');
  });

  it('GitHub problems fail the preflight', () => {
    expectFail(preflight({ gh: { auth: { prefix: ['auth', 'status'], exitCode: 1 } } }), 'gh');
    expectFail(preflight({ gh: { runs: { prefix: ['run', 'list'], stdout: '[{"status":"completed","conclusion":"failure"}]' } } }), 'CI run');
    expectFail(preflight({ gh: { runs: { prefix: ['run', 'list'], stdout: '[{"status":"in_progress","conclusion":""}]' } } }), 'CI run');
    expectFail(preflight({ gh: { runs: { prefix: ['run', 'list'], stdout: '[]' } } }), 'successful (none)');
    expectFail(preflight({ gh: { protection: { prefix: ['api'], exitCode: 1 } } }), 'is not protected');
    const p = JSON.parse(PROTECTION) as Record<string, unknown>;
    const bypass = JSON.stringify({ ...p, enforce_admins: { enabled: false } });
    expectFail(preflight({ gh: { protection: { prefix: ['api'], stdout: bypass } } }), 'administrators');
    const noPr = JSON.stringify({ ...p, required_pull_request_reviews: undefined });
    expectFail(preflight({ gh: { protection: { prefix: ['api'], stdout: noPr } } }), 'does not require a pull request');
    const noChecks = JSON.stringify({ ...p, required_status_checks: { strict: false, contexts: [] } });
    expectFail(preflight({ gh: { protection: { prefix: ['api'], stdout: noChecks } } }), 'does not require CI checks');
  });

  it('A ruleset protection fails when it has bypass actors or lacks a rule', () => {
    const both = ['pull_request', 'required_status_checks'];
    const clean = preflight({ gh: { api: [notProtected, rulesOf(both), ruleset([])] } });
    expect(clean.fails, clean.out).toEqual([]);
    expect(clean.status).toBe(0);
    const actor = { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' };
    expectFail(preflight({ gh: { api: [notProtected, rulesOf(both), ruleset([actor])] } }), 'bypass');
    expectFail(preflight({ gh: { api: [notProtected, rulesOf(both), ruleset(undefined)] } }), 'bypass');
    expectFail(preflight({ gh: { api: [notProtected, rulesOf(['required_status_checks']), ruleset([])] } }), 'does not require a pull request');
    expectFail(preflight({ gh: { api: [notProtected, rulesOf(['pull_request']), ruleset([])] } }), 'does not require CI checks');
  });

  it('A protection the gh account cannot read is reported as such', () => {
    // GitHub answers 404 "Not Found" when the active account lacks admin access, and prints the body.
    const hidden = preflight({ gh: { protection: { prefix: ['api'], stdout: '{"message":"Not Found","status":"404"}', exitCode: 1 } } }).fails;
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toContain('admin access');
    const unprotected = preflight({ gh: { protection: { prefix: ['api'], stdout: '{"message":"Branch not protected","status":"404"}', exitCode: 1 } } }).fails;
    expect(unprotected.join('\n')).toContain('is not protected');
  });

  it('Missing hooks fail the preflight', () => {
    expectFail(preflight({ dropCursorHooks: true }), '.cursor/hooks.json');
    expectFail(preflight({ dropGateRegistration: true }), 'autonomous-merge-gate');
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

  it('fails without jq, vet-package.mjs or paths.mjs, and accepts the flags in any order', () => {
    expect(preflight({ noJq: true }).fails.join('\n')).toContain('jq');
    expect(preflight({ dropVetPackage: true }).fails.join('\n')).toContain('vet-package.mjs');
    // The file-tool hooks read every path fact from paths.mjs: without it an unattended run denies them all.
    const noPaths = preflight({ dropPathsMjs: true });
    expect(noPaths.fails.join('\n'), noPaths.out).toContain('paths.mjs');
    expect(noPaths.status, noPaths.out).not.toBe(0);
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
