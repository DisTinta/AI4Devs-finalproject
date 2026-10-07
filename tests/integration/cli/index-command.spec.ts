import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import type { IndexReport } from '@codemind/core';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/specs/cli-indexing/spec.md. Each `it` is the scenario it
// is named after. `fixtures/acme-shop` is copied (without `.git`) under a temporary directory `T`,
// the allowed root, and its history is built there once, never in `fixtures/`. The command runs with
// the real adapters; its transaction is a savepoint on the harness client (design D4), so every row
// is reverted when the test ends and the harness's "no commit by the code under test" check holds.

/** One indexing spawns a git process per blob plus the PHP parse: well above Vitest's 5 s default. */
const INDEXING_TIMEOUT_MS = 60_000;
const AWS_KEY_ID = /AKIA[A-Z0-9]{16}/;

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';
let ACME_SHOP = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve('fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-cli-'));
  ACME_SHOP = join(T, 'acme-shop');
  cpSync(resolve('fixtures/acme-shop'), ACME_SHOP, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: ACME_SHOP, manifest: resolve('fixtures/history/acme-shop.commits.mjs') });
  // acme-shop's history has no secret in a commit message: one empty commit adds exactly one commit
  // redaction event, so the commit-log check of the first scenario is not 0 == 0. The key is built
  // by concatenation so no literal key sits in the repository.
  const message = `chore: rotate ${'AKIA' + 'ABCDEFGHIJKLMNOP'}`;
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', message], {
    cwd: ACME_SHOP,
  });
  mkdirSync(join(T, 'no-repo'));
  mkdirSync(join(T, 'vacio'));
  execFileSync('git', ['init', '-q'], { cwd: join(T, 'vacio') });
}, 120_000);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

/** The outcome of one run of the command. */
interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
}

/** Runs `index` with the real adapters, `T` as the allowed root and the given transaction factory. */
async function runCli(argv: string[], options: { env?: Record<string, string>; openTransaction?: OpenTransaction } = {}): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const exit = await runIndexCommand(['index', ...argv], {
    env: { ALLOWED_REPOS_DIR: T, AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: 'postgres://injected-transaction', ...options.env },
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    openTransaction: options.openTransaction,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== '') };
}

/**
 * The command's transaction as a savepoint on the harness client: commit releases it, rollback rolls
 * back to it, release does nothing (the harness owns the client). Records each call in `log`.
 */
function savepointTransaction(client: Client, log: string[] = []): OpenTransaction {
  return async () => {
    log.push('open');
    await client.query('SAVEPOINT cli_index');
    return {
      client,
      commit: async () => {
        log.push('commit');
        await client.query('RELEASE SAVEPOINT cli_index');
      },
      rollback: async () => {
        log.push('rollback');
        await client.query('ROLLBACK TO SAVEPOINT cli_index');
      },
      release: async () => {
        log.push('release');
      },
    };
  };
}

/** The `{"error":{…}}` line of a failed run. */
function errorOf(result: Run): { code: string; message: string } {
  const errors = result.stderrLines
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as { error?: { code: string; message: string } })
    .filter((line) => line.error !== undefined);
  expect(errors).toHaveLength(1);
  return errors[0].error!;
}

/** The structured log lines of a run. */
function logLines(result: Run): Record<string, unknown>[] {
  return result.stderrLines.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Asserts that no output of `result` names the real path of `T`, raw or JSON-escaped. */
function expectNoRealRoot(result: Run): void {
  const real = realpathSync(T);
  const output = result.stdout + result.stderr;
  for (const form of [real, JSON.stringify(real).slice(1, -1), basename(real)]) expect(output).not.toContain(form);
}

function gitInCopy(...args: string[]): string {
  return execFileSync('git', args, { cwd: ACME_SHOP, encoding: 'utf8' }).trim();
}

describeWithDatabase('cli index on acme-shop', () => {
  const db = useTransactionPerTest();

  it(
    'acme-shop is indexed and its report printed',
    async () => {
      // Act
      const result = await runCli(['acme-shop', '--name', unique('acme-shop'), '--language', 'php'], { openTransaction: savepointTransaction(db()) });

      // Assert: exit, progress, report text against what was stored.
      expect(result.exit).toBe(0);
      expect(result.stderrLines.filter((line) => line.startsWith('['))).toEqual([
        '[1/6] confine',
        '[2/6] read',
        '[3/6] redact',
        '[4/6] analyze',
        '[5/6] history',
        '[6/6] save',
      ]);
      const projectId = /^Indexed project (\S+)$/m.exec(result.stdout)?.[1];
      expect(projectId).toBeDefined();
      const project = await createPostgresStore({ transaction: db() }).getProject(projectId!);
      expect(project.indexedCommit).toBe(gitInCopy('rev-parse', 'HEAD'));
      expect(result.stdout).toContain(`  commit:      ${gitInCopy('rev-parse', 'HEAD')}\n`);
      expect(result.stdout).toContain('  framework:   laravel (detected)\n');
      const count = async (sql: string): Promise<number> => (await db().query(sql, [projectId])).rows[0].n as number;
      const files = await count('SELECT count(*)::int AS n FROM file WHERE project_id = $1');
      const symbols = await count('SELECT count(*)::int AS n FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1');
      const commits = await count('SELECT count(*)::int AS n FROM commit WHERE project_id = $1');
      const exact = await count(`SELECT count(*)::int AS n FROM edge WHERE project_id = $1 AND resolution = 'exact'`);
      expect(result.stdout).toContain(`  files:       ${files} (0 deleted)\n`);
      expect(result.stdout).toContain(`  symbols:     ${symbols}\n`);
      expect(result.stdout).toContain(`  commits:     ${commits}\n`);
      expect(result.stdout).toContain(`  edges:       ${project.edgeCount} total / ${exact} exact / ${project.edgeCount - exact} heuristic\n`);
      // Structured log: the planted key's file event, and one commit line per commit event.
      expect(logLines(result)).toContainEqual({
        level: 'info',
        event: 'secret_redacted',
        source: 'file',
        file: 'config/services.php',
        line: 21,
        column: 44,
        rule: 'aws-access-key-id',
      });
      // The copy's history holds exactly one commit redaction event: the empty commit added above.
      expect(logLines(result).filter((line) => line.source === 'commit')).toEqual([
        { level: 'info', event: 'secret_redacted', source: 'commit', commit: gitInCopy('rev-parse', 'HEAD'), line: 1, column: 15, rule: 'aws-access-key-id' },
      ]);
      expect(result.stdout).not.toMatch(AWS_KEY_ID);
      expect(result.stderr).not.toMatch(AWS_KEY_ID);
    },
    INDEXING_TIMEOUT_MS,
  );

  it(
    'An explicit framework wins and --json prints the full report',
    async () => {
      // Act
      const result = await runCli(['acme-shop', '--name', unique('acme-shop-json'), '--language', 'php', '--framework', 'none', '--json'], {
        openTransaction: savepointTransaction(db()),
      });

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stdout.endsWith('\n')).toBe(true);
      expect(result.stdout.trimEnd().split('\n')).toHaveLength(1);
      const report = JSON.parse(result.stdout) as IndexReport;
      expect(Object.keys(report).sort()).toEqual(
        [
          'commitEvents',
          'commits',
          'diagnostics',
          'edges',
          'events',
          'fileCommits',
          'files',
          'filesDeleted',
          'framework',
          'frameworkSource',
          'indexedCommit',
          'projectId',
          'skipped',
          'symbols',
        ].sort(),
      );
      expect(report.framework).toBe('none');
      expect(report.frameworkSource).toBe('explicit');
      // One commit log line per commit redaction event of the report itself (at least the planted one).
      expect(report.commitEvents.length).toBeGreaterThan(0);
      expect(logLines(result).filter((line) => line.source === 'commit')).toHaveLength(report.commitEvents.length);
      const project = await createPostgresStore({ transaction: db() }).getProject(report.projectId);
      expect(project.framework).toBe('none');
    },
    INDEXING_TIMEOUT_MS,
  );

  it(
    'A taken name rolls back and keeps the first project',
    async () => {
      // Arrange
      const name = unique('taken');
      const first = await runCli(['acme-shop', '--name', name, '--language', 'php'], { openTransaction: savepointTransaction(db()) });
      expect(first.exit).toBe(0);
      const firstId = /^Indexed project (\S+)$/m.exec(first.stdout)![1];
      const log: string[] = [];

      // Act
      const second = await runCli(['acme-shop', '--name', name, '--language', 'php'], { openTransaction: savepointTransaction(db(), log) });

      // Assert
      expect(second.exit).toBe(1);
      expect(errorOf(second).code).toBe('PROJECT_NAME_TAKEN');
      expect(second.stdout).toBe('');
      expect(log).toEqual(['open', 'rollback', 'release']);
      const { rows } = await db().query('SELECT count(*)::int AS n FROM project WHERE name = $1', [name]);
      expect(rows[0].n).toBe(1);
      const kept = await createPostgresStore({ transaction: db() }).getProject(firstId);
      expect(kept.name).toBe(name);
    },
    2 * INDEXING_TIMEOUT_MS,
  );

  it(
    'An allowed root that does not exist is detected inside the transaction',
    async () => {
      // Arrange
      const log: string[] = [];

      // Act
      const result = await runCli(['acme-shop', '--name', unique('missing-root'), '--language', 'php'], {
        env: { ALLOWED_REPOS_DIR: join(T, 'inexistente') },
        openTransaction: savepointTransaction(db(), log),
      });

      // Assert
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'INDEXING_DISABLED', message: 'indexing disabled (fixtures-only mode)', details: {} });
      expect(log).toEqual(['open', 'rollback', 'release']);
      expect(result.stdout).toBe('');
    },
    INDEXING_TIMEOUT_MS,
  );

  it(
    'A directory that is not a repository is reported by the path as typed',
    async () => {
      // Act
      const result = await runCli(['no-repo', '--name', unique('no-repo'), '--language', 'php'], { openTransaction: savepointTransaction(db()) });

      // Assert
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'NOT_A_GIT_REPOSITORY', message: '"no-repo" is not the root of a git repository', details: {} });
      expectNoRealRoot(result);
    },
    INDEXING_TIMEOUT_MS,
  );

  it(
    'A repository without commits is reported by the path as typed',
    async () => {
      // Act
      const result = await runCli(['vacio', '--name', unique('vacio'), '--language', 'php'], { openTransaction: savepointTransaction(db()) });

      // Assert
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'EMPTY_REPOSITORY', message: '"vacio" has no commits', details: {} });
      expectNoRealRoot(result);
    },
    INDEXING_TIMEOUT_MS,
  );
});

describe('cli index without a database', () => {
  it('An unreachable database is reported without its URL', async () => {
    // Arrange: nothing listens on port 1, and the default transaction factory is used.
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';

    // Act
    const result = await runCli(['acme-shop', '--name', 'unreachable', '--language', 'php'], { env: { DATABASE_URL: url } });

    // Assert
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
    const output = result.stdout + result.stderr;
    for (const leak of [url, 's3cret', 'u:', '127.0.0.1:1']) expect(output).not.toContain(leak);
  }, 30_000);
});
