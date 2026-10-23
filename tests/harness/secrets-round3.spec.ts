// Verify-against-spec report 2026-10-22 (openspec change autonomous-run-switch), findings R3-3, R3-4
// and R3-6: secret names are matched case-insensitively, glob wildcards cannot dodge them, a source
// file named *.env.ts is not an environment file, and Cursor's Grep gets the same decision.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, editInput, REPO_ROOT, runHook, type Project } from './support/run-hook';

const read = (filePath: string) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } });
const grep = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
const glob = (input: Record<string, unknown>) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: input });

describe('Secret files and the search tools, round 3', { timeout: 300_000 }, () => {
  let project: Project | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('Secret files are not reached through search tools', async () => {
    project = createProject();
    const dir = project.dir;

    // R3-3: any letter case, and wildcards standing in for the letters of a secret name.
    const denied = [
      read(`${dir}/.ENV.prod`),
      read(`${dir}/config/.Env.Local`),
      read(`${dir}/SECRETS/api.key`),
      read(`${dir}/Credentials.JSON`),
      grep({ path: `${dir}/SECRETS` }),
      grep({ path: `${dir}/.ENV.ci` }),
      grep({ path: dir, glob: '?env.prod' }),
      grep({ path: dir, glob: '[.]env.prod' }),
      grep({ glob: '**/.ENV*' }),
      glob({ pattern: '?env.prod' }),
      glob({ pattern: '[.]env.prod' }),
      glob({ pattern: '.e?v.local' }),
      glob({ pattern: '**/.ENV*' }),
      glob({ pattern: '**/[.]e[n]v' }),
      glob({ pattern: '**/*.ENV' }),
      glob({ pattern: '**/SECRETS/*' }),
      glob({ pattern: '**/secre?s/**' }),
      glob({ pattern: '{src,config}/.env.{prod,ci}' }),
      glob({ pattern: '**/cred*.json' }),
      glob({ pattern: '**/id_*' }),
      glob({ pattern: '**/.npm*' }),
      // <name>.env.<suffix> stays an environment file unless the suffix is a source extension.
      read(`${dir}/prod.env.local`),
      read(`${dir}/config/app.env.production`),
      read(`${dir}/x.env.bak`),
      glob({ pattern: '*.env.*' }),
      glob({ pattern: '**/*.env.local' }),
      glob({ pattern: '**/prod.env.local' }),
      grep({ path: `${dir}/prod.env.local` }),
    ];
    for (const input of denied) {
      const r = await runHook(project, 'block-secret-reads', input);
      expect(r.decision, JSON.stringify(input.tool_input)).toBe('deny');
    }

    // R3-6: a TypeScript file named *.env.ts is not an environment file; broad globs stay free.
    const free = [
      read(`${dir}/src/config.env.ts`),
      read(`${dir}/.ENV.EXAMPLE`),
      glob({ pattern: 'src/**/*.env.ts' }),
      glob({ pattern: '**/*.env.ts', path: dir }),
      grep({ path: dir, glob: '*.env.ts' }),
      glob({ pattern: '**/.env.example' }),
      glob({ pattern: '**/.env.{example,sample}' }),
      glob({ pattern: '.env.sample' }),
      glob({ pattern: '**/*.ts' }),
      glob({ pattern: '**/*.{ts,tsx}' }),
      glob({ pattern: '**/*.json' }),
      glob({ pattern: '**/*.yml' }),
      glob({ pattern: '**/*.*' }),
      glob({ pattern: '*' }),
      glob({ pattern: 'src/**/environment.ts' }),
      grep({ path: dir, glob: '*.md', pattern: 'env|secret' }),
      read(`${dir}/x.env.example`),
      read(`${dir}/src/types/app.env.d.ts`),
      glob({ pattern: '**/*.env.{ts,tsx,js,py}' }),
    ];
    for (const input of free) {
      const r = await runHook(project, 'block-secret-reads', input);
      expect(r.decision, JSON.stringify(input.tool_input)).toBe('none');
    }

    // The same rule for edits: <name>.env.<suffix> is denied, a source file named *.env.ts is not.
    for (const path of ['prod.env.local', 'config/app.env.production', '.ENV.prod']) {
      expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/${path}`))).decision, path).toBe('deny');
    }
    expect((await runHook(project, 'protect-specs-and-tests', editInput(`${dir}/src/config.env.ts`))).decision).toBe('none');
  });

  it('Secret files are not reached through Cursor\'s Grep either (R3-4)', async () => {
    project = createProject();
    const dir = project.dir;
    const cursorGrep = (input: Record<string, unknown>) => ({ hook_event_name: 'preToolUse', tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
    const cases: Array<[Record<string, unknown>, 'deny' | 'none']> = [
      [{ path: `${dir}/.env.ci` }, 'deny'],
      [{ path: `${dir}/secrets` }, 'deny'],
      [{ path: dir, glob: '.env.*' }, 'deny'],
      [{ path: dir, glob: '?env.prod' }, 'deny'],
      [{ path: `${dir}/.env.example` }, 'none'],
      [{ path: dir, glob: '*.ts' }, 'none'],
    ];
    for (const [input, expected] of cases) {
      const claude = await runHook(project, 'block-secret-reads', grep(input));
      const cursor = await runHook(project, 'block-secret-reads', cursorGrep(input), { client: 'cursor' });
      expect(claude.decision, JSON.stringify(input)).toBe(expected);
      expect(cursor.decision, JSON.stringify(input)).toBe(expected);
      if (expected === 'deny') expect(cursor.json?.permission).toBe('deny');
    }

    // .cursor/hooks.json runs the secret-read hook for Grep, with the same timeout as for reads.
    const config = JSON.parse(readFileSync(join(REPO_ROOT, '.cursor/hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ command: string; matcher?: string; timeout: number }>>;
    };
    const readEntry = config.hooks.beforeReadFile.find((e) => e.command.endsWith('block-secret-reads.sh'));
    const grepEntry = config.hooks.preToolUse.find((e) => e.command.endsWith('block-secret-reads.sh'));
    expect(grepEntry?.matcher).toBe('Grep');
    expect(grepEntry?.timeout).toBe(readEntry?.timeout);
  });
});
