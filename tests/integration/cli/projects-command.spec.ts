import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { runProjectsCommand } from '../../../packages/cli/src/commands/projects';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { sampleGraph } from '../../support/sample-graph';
import { databaseUrl, describeWithDatabase, migrateSharedDatabase } from '../helpers/db';
import { unique } from '../helpers/factories';
import { inOwnSnapshot } from '../helpers/snapshot';

// Spec: openspec/changes/seed-load-and-projects/specs/cli-projects/spec.md → "Project listing". Each
// `it` is the scenario it is named after. The command reads through the real store adapter on a
// savepoint of a client of the test's own, in a REPEATABLE READ transaction that is always rolled
// back (`inOwnSnapshot`); each test first deletes every project there, so local data is never listed
// nor touched. The listing reads every project of the database: under READ COMMITTED (the harness
// transaction) it also listed projects other spec files committed after the DELETE (DIS-110,
// integration-test-races design D2, D8); inside the snapshot they are invisible.

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
  beforeAll(migrateSharedDatabase, 60_000);

  it('Sample and user projects are listed', async () => {
    const { indexedName, indexed, fresh, stored, freshName, before, result, after } = await inOwnSnapshot(async (client) => {
      // Arrange: the two samples (acme-shop and task-api), one indexed project and one never indexed.
      await client.query('DELETE FROM project');
      await loadSeed(client, { sql: SEED, projectNames: seedProjects(SEED).map((p) => p.name) });
      const store = createPostgresStore({ transaction: client });
      const name = unique('indexed');
      const indexedId = await store.createProject({ name, rootPath: '/repos/indexed', language: 'php', framework: 'laravel' });
      await store.saveGraph(indexedId, sampleGraph());
      const freshId = await store.createProject({ name: unique('fresh'), rootPath: '/repos/fresh', language: 'typescript' });
      const indexedProject = await store.getProject(indexedId);
      const freshProjectName = (await store.getProject(freshId)).name;
      const counts = await tableCounts(client);

      // Act
      const listed = await list(client);
      return {
        indexedName: name,
        indexed: indexedId,
        fresh: freshId,
        stored: indexedProject,
        freshName: freshProjectName,
        before: counts,
        result: listed,
        after: await tableCounts(client),
      };
    });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    const expected = new Map([
      ['acme-shop', 'acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample'],
      ['task-api', 'task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z sample'],
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
    expect(after).toEqual(before);
  });

  it('An empty database lists no projects', async () => {
    const result = await inOwnSnapshot(async (client) => {
      // Arrange
      await client.query('DELETE FROM project');

      // Act
      return list(client);
    });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('no projects\n');
    expect(result.stderr).toBe('');
  });
});
