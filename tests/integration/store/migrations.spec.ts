import { copyFileSync, existsSync, mkdtempSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ColumnShape, appliedMigrations, createThrowawayDatabase, snapshotSchema } from './schema-snapshot';
import { MIGRATIONS_DIR, migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';
import { databaseUrl, describeWithDatabase, repoRoot, runCommand, runNpmScript } from './support';

const SCRIPT_TIMEOUT_MS = 60_000;
const LIFECYCLE_TIMEOUT_MS = 120_000;

const L1_TABLES = ['edge', 'file', 'project', 'symbol'];

// Transcribed by hand from the "L1 column contract" table of
// openspec/changes/schema-graph-l1/specs/graph-schema/spec.md. Enum columns use the type names of
// design.md D4; their allowed values are checked through EXPECTED_ENUMS.
const col = (table: string, column: string, type: string, notNull: boolean, dflt: string | null = null): ColumnShape => ({
  table,
  column,
  type,
  notNull,
  default: dflt,
});
const EXPECTED_COLUMNS: ColumnShape[] = [
  col('project', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('project', 'name', 'text', true),
  col('project', 'root_path', 'text', true),
  col('project', 'language', 'project_language', true),
  col('project', 'framework', 'project_framework', false),
  col('project', 'is_sample', 'boolean', true, 'false'),
  col('project', 'indexed_commit', 'text', false),
  col('project', 'node_count', 'integer', true, '0'),
  col('project', 'edge_count', 'integer', true, '0'),
  col('project', 'indexed_at', 'timestamp with time zone', false),
  col('project', 'created_at', 'timestamp with time zone', true, 'now()'),
  col('file', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('file', 'project_id', 'uuid', true),
  col('file', 'path', 'text', true),
  col('file', 'kind', 'file_kind', true),
  col('file', 'loc', 'integer', false),
  col('file', 'content_hash', 'text', false),
  col('file', 'redacted', 'boolean', true, 'false'),
  col('file', 'embedding', 'vector(1536)', false),
  col('symbol', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('symbol', 'file_id', 'uuid', true),
  col('symbol', 'name', 'text', true),
  col('symbol', 'kind', 'symbol_kind', true),
  col('symbol', 'start_line', 'integer', true),
  col('symbol', 'end_line', 'integer', true),
  col('symbol', 'signature', 'text', false),
  col('symbol', 'embedding', 'vector(1536)', false),
  col('edge', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('edge', 'project_id', 'uuid', true),
  col('edge', 'source_symbol_id', 'uuid', false),
  col('edge', 'source_file_id', 'uuid', false),
  col('edge', 'target_symbol_id', 'uuid', false),
  col('edge', 'target_file_id', 'uuid', false),
  col('edge', 'kind', 'edge_kind', true),
  col('edge', 'resolution', 'edge_resolution', true),
  col('edge', 'extractor', 'text', true),
  col('edge', 'weight', 'double precision', false),
];
const EXPECTED_ENUMS: Record<string, string[]> = {
  edge_kind: ['calls', 'imports', 'extends', 'implements', 'tested_by', 'co_changed', 'describes'],
  edge_resolution: ['exact', 'heuristic'],
  file_kind: ['source', 'test', 'doc', 'config'],
  project_framework: ['laravel', 'fastify', 'none'],
  project_language: ['php', 'typescript'],
  symbol_kind: ['class', 'interface', 'method', 'function', 'route'],
};

const byTableAndColumn = (a: ColumnShape, b: ColumnShape) =>
  a.table.localeCompare(b.table) || a.column.localeCompare(b.column);

function expectColumnContract(columns: ColumnShape[]): void {
  expect([...columns].sort(byTableAndColumn)).toEqual([...EXPECTED_COLUMNS].sort(byTableAndColumn));
}

function tablesOf(columns: ColumnShape[]): string[] {
  return [...new Set(columns.map((c) => c.table))].sort();
}

describe('graph-schema: fail clearly without a connection string', () => {
  it(
    'DATABASE_URL is missing on migrate',
    () => {
      const result = runNpmScript('db:migrate', { DATABASE_URL: undefined });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('DATABASE_URL');
    },
    SCRIPT_TIMEOUT_MS,
  );

  it(
    'DATABASE_URL is missing on rollback',
    () => {
      const result = runNpmScript('db:rollback', { DATABASE_URL: undefined });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('DATABASE_URL');
    },
    SCRIPT_TIMEOUT_MS,
  );

  // A whitespace-only value is a set-but-meaningless variable: treat it exactly like unset.
  it(
    'DATABASE_URL is missing on migrate (blank value)',
    () => {
      const result = runNpmScript('db:migrate', { DATABASE_URL: '   ' });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('DATABASE_URL is not set');
    },
    SCRIPT_TIMEOUT_MS,
  );
});

// The runner starts its CLI only when it is the entry module. A false negative in that check would
// exit 0 without migrating, so the check must survive a path that reaches the file through a link
// (symlink, or a Windows junction, which needs no privilege).
describe('graph-schema: migration runner entry point', () => {
  it(
    'CLI runs when invoked through a linked path',
    () => {
      const linkParent = mkdtempSync(join(tmpdir(), 'codemind-entry-'));
      const link = join(linkParent, 'src');
      try {
        symlinkSync(resolve(repoRoot, 'packages/adapters/store-postgres/src'), link, 'junction');

        const result = runCommand(`npx tsx "${join(link, 'migrate.ts')}" up`, { DATABASE_URL: undefined });

        // Reaching the DATABASE_URL check proves main() ran; a skipped CLI exits 0 silently.
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('DATABASE_URL is not set');
      } finally {
        // Remove the link itself, never recursively: a recursive delete could follow it into src/.
        if (existsSync(link)) unlinkSync(link);
        rmdirSync(linkParent);
      }
    },
    SCRIPT_TIMEOUT_MS,
  );
});

// Every test gets its own empty throwaway database: the shared DATABASE_URL database is never
// migrated or rolled back from this file.
describeWithDatabase('graph-schema: migration lifecycle', () => {
  let throwaway: { url: string; drop: () => Promise<void> };

  const migrate = () => runNpmScript('db:migrate', { DATABASE_URL: throwaway.url });
  const rollback = () => runNpmScript('db:rollback', { DATABASE_URL: throwaway.url });

  beforeEach(async () => {
    throwaway = await createThrowawayDatabase(databaseUrl as string);
  });

  afterEach(async () => {
    await throwaway.drop();
  });

  it(
    'Migrate an empty database',
    async () => {
      const result = migrate();

      expect(result.status, result.stderr).toBe(0);
      expect(tablesOf((await snapshotSchema(throwaway.url)).columns)).toEqual(L1_TABLES);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Migrated schema matches the column contract',
    async () => {
      expect(migrate().status).toBe(0);

      const schema = await snapshotSchema(throwaway.url);
      expectColumnContract(schema.columns);
      expect(schema.enums).toEqual(EXPECTED_ENUMS);
      // "Every id is a uuid primary key generated by the database when omitted."
      const primaryKeys = schema.constraints
        .filter((c) => c.definition.startsWith('PRIMARY KEY'))
        .map((c) => `${c.table}: ${c.definition}`);
      expect(primaryKeys).toEqual(L1_TABLES.map((table) => `${table}: PRIMARY KEY (id)`));
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Migrate an up-to-date database',
    async () => {
      expect(migrate().status).toBe(0);
      const before = await snapshotSchema(throwaway.url);
      const appliedBefore = await appliedMigrations(throwaway.url);

      const result = migrate();

      expect(result.status, result.stderr).toBe(0);
      expect(await snapshotSchema(throwaway.url)).toEqual(before);
      expect(await appliedMigrations(throwaway.url)).toEqual(appliedBefore);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  // Characterisation, not a spec scenario: rollback with nothing applied is a no-op that exits 0,
  // symmetric with "Migrate an up-to-date database" (node-pg-migrate prints "No migrations to run!").
  it(
    'Roll back a database with nothing applied',
    async () => {
      const before = await snapshotSchema(throwaway.url);

      const result = rollback();

      expect(result.status, result.stderr).toBe(0);
      expect(await snapshotSchema(throwaway.url)).toEqual(before);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Roll back the L1 graph migration',
    async () => {
      expect(migrate().status).toBe(0);

      const result = rollback();

      expect(result.status, result.stderr).toBe(0);
      const schema = await snapshotSchema(throwaway.url);
      expect(schema.columns).toEqual([]);
      expect(schema.enums).toEqual({});
      // The vector extension is shared with later migrations (DIS-12/13): rollback keeps it.
      expect(schema.extensions).toContain('vector');
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Apply, roll back and apply again',
    async () => {
      expect(migrate().status).toBe(0);
      const first = await snapshotSchema(throwaway.url);

      expect(rollback().status).toBe(0);
      expect(migrate().status).toBe(0);
      const second = await snapshotSchema(throwaway.url);

      expect(second).toEqual(first);
      expectColumnContract(second.columns);
      expect(second.enums).toEqual(EXPECTED_ENUMS);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  // Non-normative note of the spec ("Fail clearly without a connection string"): a run that fails
  // part-way leaves no partial changes. 0001 is valid and 0002 fails, so with one transaction for
  // the whole run nothing of 0001 may survive.
  it(
    'A failing later migration leaves no partial changes',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'codemind-migrations-'));
      try {
        for (const file of ['0001_graph-l1.up.sql', '0001_graph-l1.down.sql']) {
          copyFileSync(join(MIGRATIONS_DIR, file), join(dir, file));
        }
        writeFileSync(join(dir, '0002_broken.up.sql'), 'CREATE TABLE broken_probe (id integer);\nSELECT 1 / 0;\n');
        writeFileSync(join(dir, '0002_broken.down.sql'), 'DROP TABLE broken_probe;\n');

        await expect(migrateUp(throwaway.url, dir)).rejects.toThrow(/division by zero/);

        expect(await appliedMigrations(throwaway.url)).toEqual([]);
        expect((await snapshotSchema(throwaway.url)).columns).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    LIFECYCLE_TIMEOUT_MS,
  );
});
