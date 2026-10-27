import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';
import { afterAll, expect, it } from 'vitest';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import type { StoredResponse } from '@codemind/core';
import { indexedCommitOf } from '../../../packages/cli/src/cache/seed-header';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runVerify } from '../../../packages/cli/src/verify';
import type { VerifyDeps } from '../../../packages/cli/src/verify';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';

// Spec: openspec/changes/verify-smoke/specs/verify-smoke/spec.md. Each `it` is the scenario it is
// named after. The versioned seed and golden file are the subject under test (as in
// `cache-build.spec.ts`), so they are loaded with `loadSeed` and `saveCacheEntry` inside the harness
// transaction, reverted when the test ends; `verify`'s own transaction is a savepoint on the harness
// client that records `commit`. The fingerprint seams return the files' own values, so the suite
// never depends on the versioned files being fresh: that is the `verify` CI job's (design C10, A4).

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SEED_PATH = resolve(WORKSPACE_ROOT, 'seeds/graph-dump.sql');
const GOLDEN_PATH = resolve(WORKSPACE_ROOT, 'seeds/cache/acme-shop.json');
const SEED = readFileSync(SEED_PATH, 'utf8');
const GOLDEN_TEXT = readFileSync(GOLDEN_PATH, 'utf8');
const GOLDEN = JSON.parse(GOLDEN_TEXT) as {
  answerFingerprint: string;
  entries: Array<{ questionNormalized: string; response: StoredResponse & { statements: Array<{ type: string }> } }>;
};
const HEADER = {
  analyzer: /^-- analyzer-fingerprint: (\S+)$/m.exec(SEED)![1],
  contract: /^-- contract-fingerprint: (\S+)$/m.exec(SEED)![1],
};
/** The seed's `project.indexed_commit` for acme-shop. */
const SEED_COMMIT = indexedCommitOf(SEED, 'acme-shop')!;
const ACME_ID = seedProjects(SEED).find((project) => project.name === 'acme-shop')!.id;
const ENV = { DATABASE_URL: databaseUrl };
/** Loading the seed, then three questions over it. */
const TIMEOUT_MS = 60_000;
const MATCHING = [
  '✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?',
  '✓ acme-shop Q3 ¿Cómo se validan los cupones?',
  '✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?',
  'acme-shop: 3/3 golden answers match',
];

/** Temporary golden directories, removed at the end. */
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stdoutLines: string[];
  stderrLines: string[];
  log: string[];
}

function savepointTransaction(client: Client, log: string[]): OpenTransaction {
  return async () => {
    log.push('open');
    await client.query('SAVEPOINT verify');
    return {
      client,
      commit: async () => {
        log.push('commit');
        await client.query('RELEASE SAVEPOINT verify');
      },
      rollback: async () => {
        log.push('rollback');
        await client.query('ROLLBACK TO SAVEPOINT verify');
      },
      release: async () => void log.push('release'),
    };
  };
}

async function verify(client: Client | undefined, seams: Partial<VerifyDeps> = {}): Promise<Run> {
  const log: string[] = [];
  let stdout = '';
  let stderr = '';
  const exit = await runVerify({
    env: ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    seedFingerprints: () => HEADER,
    answerFingerprint: () => GOLDEN.answerFingerprint,
    ...(client === undefined ? {} : { openTransaction: savepointTransaction(client, log) }),
    ...seams,
  });
  const nonEmpty = (text: string): string[] => text.split('\n').filter((line) => line !== '');
  return { exit, stdout, stderr, stdoutLines: nonEmpty(stdout), stderrLines: nonEmpty(stderr), log };
}

/** Loads the versioned seed, then, unless told not to, the versioned golden answers, as `db:seed` does. */
async function loadVersioned(client: Client, options: { golden?: boolean } = {}): Promise<void> {
  await loadSeed(client, { sql: SEED, projectNames: seedProjects(SEED).map((project) => project.name) });
  if (options.golden === false) return;
  const store = createPostgresStore({ transaction: client });
  for (const entry of GOLDEN.entries) await store.saveCacheEntry(ACME_ID, entry.questionNormalized, entry.response);
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

describeWithDatabase('verify (integration)', () => {
  const db = useTransactionPerTest();

  it(
    'Every golden answer matches',
    async () => {
      // Arrange
      await loadVersioned(db());

      // Act
      const result = await verify(db());

      // Assert
      expect(result.exit).toBe(0);
      expect(result.stdout).toBe(MATCHING.map((line) => `${line}\n`).join(''));
      expect(result.stderr).toBe('');
    },
    TIMEOUT_MS,
  );

  it(
    'An altered golden answer is reported field by field',
    async () => {
      // Arrange
      await loadVersioned(db());
      const altered = JSON.parse(GOLDEN_TEXT) as typeof GOLDEN;
      const q3 = altered.entries.find((entry) => entry.questionNormalized.includes('cupones'))!;
      // The golden type of the first statement is whatever the last `cache:build` produced; flip it.
      const original = q3.response.statements[0].type;
      const flipped = original === 'FACT' ? 'INFERENCE' : 'FACT';
      q3.response.statements[0].type = flipped;
      const cacheDir = mkdtempSync(join(tmpdir(), 'codemind-verify-golden-'));
      dirs.push(cacheDir);
      writeFileSync(join(cacheDir, 'acme-shop.json'), `${JSON.stringify(altered, null, 2)}\n`);

      // Act
      const result = await verify(db(), { cacheDir });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdoutLines).toEqual([
        MATCHING[0],
        '✗ acme-shop Q3 ¿Cómo se validan los cupones?',
        `    statements[0].type: expected "${flipped}", got "${original}"`,
        MATCHING[2],
        'acme-shop: 2/3 golden answers match',
      ]);
      expect(result.stderr).toBe('');
    },
    TIMEOUT_MS,
  );

  it(
    'A missing cache entry is reported as a cache miss',
    async () => {
      // Arrange
      await loadVersioned(db(), { golden: false });

      // Act
      const result = await verify(db());

      // Assert
      expect(result.exit).toBe(1);
      const miss = '    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed';
      expect(result.stdoutLines).toEqual([
        MATCHING[0].replace('✓', '✗'),
        miss,
        MATCHING[1].replace('✓', '✗'),
        miss,
        MATCHING[2].replace('✓', '✗'),
        miss,
        'acme-shop: 0/3 golden answers match',
      ]);
      expect(result.stderr).toBe('');
    },
    TIMEOUT_MS,
  );

  it(
    'A database without the current seed is reported',
    async () => {
      // Arrange: each case runs inside its own savepoint, rolled back before the next one
      const cases: Array<(client: Client) => Promise<void>> = [
        // A migrated database with no project named acme-shop (a local `make up` leaves a committed one).
        async (client) => void (await client.query(`DELETE FROM project WHERE name = 'acme-shop'`)),
        // A sample acme-shop with an id other than the seed's.
        async (client) => {
          await client.query(`DELETE FROM project WHERE name = 'acme-shop'`);
          await client.query(
            `INSERT INTO project (name, root_path, language, framework, is_sample, indexed_commit)
             SELECT 'acme-shop', 'fixtures/acme-shop', 'php', 'laravel', true, $1`,
            [SEED_COMMIT],
          );
        },
        // A non-sample acme-shop with the seed's id.
        async (client) => {
          await client.query(`DELETE FROM project WHERE name = 'acme-shop'`);
          await client.query(
            `INSERT INTO project (id, name, root_path, language, framework, is_sample, indexed_commit)
             VALUES ($1, 'acme-shop', 'fixtures/acme-shop', 'php', 'laravel', false, $2)`,
            [ACME_ID, SEED_COMMIT],
          );
        },
        // The sample acme-shop with the seed's id and another indexed commit.
        async (client) => {
          await loadVersioned(client);
          await client.query(`UPDATE project SET indexed_commit = $2 WHERE id = $1`, [ACME_ID, 'f'.repeat(40)]);
        },
      ];

      for (const arrange of cases) {
        await db().query('SAVEPOINT verify_case');
        await arrange(db());
        const before = await snapshot(db());

        // Act
        const result = await verify(db());

        // Assert
        expect(result.exit).toBe(1);
        expect(result.stdout).toBe('');
        expect(errorOf(result)).toEqual({
          code: 'SEED_NOT_LOADED',
          message: '"acme-shop" is not loaded from the current seed: run npm run db:seed',
          details: { project: 'acme-shop' },
        });
        expect(await snapshot(db())).toEqual(before);
        expect(result.log).toEqual(['open', 'rollback', 'release']);
        await db().query('ROLLBACK TO SAVEPOINT verify_case');
      }
    },
    TIMEOUT_MS,
  );

  it(
    'Verify leaves the database as it was',
    async () => {
      // Arrange
      await loadVersioned(db());
      const before = await snapshot(db());
      expect(before.hits).toEqual(GOLDEN.entries.map(() => 0));

      // Act
      const result = await verify(db());

      // Assert
      expect(result.exit).toBe(0);
      expect(await snapshot(db())).toEqual(before);
      expect(result.log).toEqual(['open', 'rollback', 'release']);
    },
    TIMEOUT_MS,
  );

  it(
    'No request reaches a model even when one is configured',
    async () => {
      // Arrange
      await loadVersioned(db());
      let requests = 0;
      const server = createServer((_request, response) => {
        requests += 1;
        response.writeHead(500).end();
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const { port } = server.address() as AddressInfo;
      const configured = { ...ENV, LLM_BASE_URL: `http://127.0.0.1:${port}/v1`, LLM_API_KEY: 'k3y', LLM_MODEL: 'qwen2.5-coder' };
      const invalid = { ...ENV, LLM_BASE_URL: 'ftp://x', DAILY_BUDGET_USD: 'abc', CACHE_BUILD_TIMEOUT_MS: 'abc' };

      try {
        // Act
        const plain = await verify(db());
        const withModel = await verify(db(), { env: configured });
        const withInvalid = await verify(db(), { env: invalid });

        // Assert
        for (const result of [withModel, withInvalid]) {
          expect(result.exit).toBe(0);
          expect(result.stdout).toBe(plain.stdout);
          expect(result.stderr).toBe('');
        }
        expect(plain.stdout).toBe(MATCHING.map((line) => `${line}\n`).join(''));
        expect(requests).toBe(0);
      } finally {
        await new Promise<void>((done) => server.close(() => done()));
      }
    },
    TIMEOUT_MS,
  );
});

it(
  'An unreachable database is reported without its URL by verify',
  async () => {
    // Arrange: the default opener, on a port where nothing listens
    const env = { DATABASE_URL: 'postgres://u:s3cret@127.0.0.1:1/db' };

    // Act
    const result = await verify(undefined, { env });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
    for (const secret of ['s3cret', 'u:', '127.0.0.1:1', 'postgres://']) expect(result.stdout + result.stderr).not.toContain(secret);
  },
  TIMEOUT_MS,
);

/** The rows `verify` could reach: acme-shop's project row, its claims and query log, and its cache hits. */
async function snapshot(client: Client): Promise<{ projects: unknown[]; claims: number; queries: number; hits: number[] }> {
  const projects = await client.query(`SELECT id, name, is_sample, indexed_commit FROM project WHERE name = 'acme-shop' ORDER BY id`);
  const claims = await client.query<{ n: string }>(`SELECT count(*) AS n FROM claim WHERE project_id = $1`, [ACME_ID]);
  const queries = await client.query<{ n: string }>(`SELECT count(*) AS n FROM query_log WHERE project_id = $1`, [ACME_ID]);
  const hits = await client.query<{ hit_count: number }>(
    `SELECT hit_count FROM cache_entry WHERE project_id = $1 ORDER BY question_normalized`,
    [ACME_ID],
  );
  return {
    projects: projects.rows,
    claims: Number(claims.rows[0].n),
    queries: Number(queries.rows[0].n),
    hits: hits.rows.map((row) => row.hit_count),
  };
}
