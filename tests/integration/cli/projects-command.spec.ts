import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { expect, it } from 'vitest';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runProjectsCommand } from '../../../packages/cli/src/commands/projects';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { sampleGraph } from '../../support/sample-graph';
import { databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/seed-load-and-projects/specs/cli-projects/spec.md → "Project listing". Each
// `it` is the scenario it is named after. The command reads through the real store adapter on a
// savepoint of the harness client; each test first deletes every project inside the harness
// transaction, so local data is never listed nor touched.

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');

function savepointTransaction(client: Client, log: string[]): OpenTransaction {
  return async () => {
    await client.query('SAVEPOINT projects_command');
    return {
      client,
      commit: async () => {
        log.push('commit');
        await client.query('RELEASE SAVEPOINT projects_command');
      },
      rollback: async () => {
        log.push('rollback');
        await client.query('ROLLBACK TO SAVEPOINT projects_command');
      },
      release: async () => undefined,
    };
  };
}

async function list(client: Client): Promise<{ exit: number; stdout: string; stderr: string; log: string[] }> {
  const log: string[] = [];
  let stdout = '';
  let stderr = '';
  const exit = await runProjectsCommand(['projects'], {
    env: { DATABASE_URL: databaseUrl },
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    openTransaction: savepointTransaction(client, log),
  });
  return { exit, stdout, stderr, log };
}

/** Every row count of the tables a listing could touch, to check it changed nothing. */
async function tableCounts(client: Client): Promise<Record<string, string>> {
  const { rows } = await client.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM project) AS project, (SELECT count(*) FROM file) AS file,
            (SELECT count(*) FROM symbol) AS symbol, (SELECT count(*) FROM edge) AS edge,
            (SELECT count(*) FROM commit) AS commit, (SELECT count(*) FROM file_commit) AS file_commit`,
  );
  return rows[0];
}

describeWithDatabase('projects (integration)', () => {
  const db = useTransactionPerTest();

  it('Sample and user projects are listed', async () => {
    // Arrange: the acme-shop sample, one indexed project and one never indexed.
    await db().query('DELETE FROM project');
    await loadSeed(db(), { sql: SEED, projectNames: seedProjects(SEED).map((p) => p.name) });
    const store = createPostgresStore({ transaction: db() });
    const indexedName = unique('indexed');
    const indexed = await store.createProject({ name: indexedName, rootPath: '/repos/indexed', language: 'php', framework: 'laravel' });
    await store.saveGraph(indexed, sampleGraph());
    const fresh = await store.createProject({ name: unique('fresh'), rootPath: '/repos/fresh', language: 'typescript' });
    const stored = await store.getProject(indexed);
    const freshName = (await store.getProject(fresh)).name;
    const before = await tableCounts(db());

    // Act
    const result = await list(db());

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    const expected = new Map([
      ['acme-shop', 'acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample'],
      [
        indexedName,
        `${indexedName}  ${indexed}  php/laravel  ${stored.nodeCount} nodes · ${stored.edgeCount} edges  ${stored.indexedAt?.toISOString()}`,
      ],
      [freshName, `${freshName}  ${fresh}  typescript/-  0 nodes · 0 edges  not indexed`],
    ]);
    const names = [...expected.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(result.stdout).toBe(names.map((name) => `${expected.get(name)}\n`).join(''));
    expect(stored.indexedAt).toBeInstanceOf(Date);
    expect(result.log).toEqual(['rollback']);
    expect(await tableCounts(db())).toEqual(before);
  });

  it('An empty database lists no projects', async () => {
    // Arrange
    await db().query('DELETE FROM project');

    // Act
    const result = await list(db());

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('no projects\n');
    expect(result.stderr).toBe('');
  });
});
