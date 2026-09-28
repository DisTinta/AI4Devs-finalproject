import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ColumnShape, createThrowawayDatabase, snapshotSchema } from './schema-snapshot';
import { databaseUrl, describeWithDatabase, runNpmScript } from './support';

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
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Migrate an up-to-date database',
    async () => {
      expect(migrate().status).toBe(0);
      const before = await snapshotSchema(throwaway.url);

      const result = migrate();

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
      expect(schema.extensions).not.toContain('vector');
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
});
