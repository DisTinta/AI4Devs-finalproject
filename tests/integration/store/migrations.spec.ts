import { copyFileSync, existsSync, mkdtempSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ColumnShape,
  type IndexShape,
  type SchemaSnapshot,
  appliedMigrations,
  createThrowawayDatabase,
  secondaryIndexShapes,
  snapshotSchema,
  unindexedCascadingForeignKeys,
} from './schema-snapshot';
import { MIGRATIONS_DIR, migrateUp } from '../../../packages/adapters/store-postgres/src/migrate';
import { databaseUrl, describeWithDatabase, repoRoot, runCommand, runNpmScript } from './support';

const SCRIPT_TIMEOUT_MS = 60_000;
const LIFECYCLE_TIMEOUT_MS = 120_000;

const L1_TABLES = ['edge', 'file', 'project', 'symbol'];
/** The migrations applied in the "only L1 graph + history" reference state. */
const HISTORY_MIGRATIONS = ['0001_graph-l1', '0002_history-claims'];
/** Every migration, in order: what a fully migrated database records. */
const ALL_MIGRATIONS = [...HISTORY_MIGRATIONS, '0003_indexes-stale'];
const HISTORY_TABLES = ['cache_entry', 'claim', 'commit', 'evidence', 'file_commit', 'query_log'];
const ALL_TABLES = [...L1_TABLES, ...HISTORY_TABLES].sort();

// Transcribed by hand from the "L1 column contract" table of openspec/specs/graph-schema/spec.md.
// Enum columns use the type names of design.md D4 (schema-graph-l1); their allowed values are
// checked through L1_ENUMS.
const col = (table: string, column: string, type: string, notNull: boolean, dflt: string | null = null): ColumnShape => ({
  table,
  column,
  type,
  notNull,
  default: dflt,
});
const L1_COLUMNS: ColumnShape[] = [
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
const L1_ENUMS: Record<string, string[]> = {
  edge_kind: ['calls', 'imports', 'extends', 'implements', 'tested_by', 'co_changed', 'describes'],
  edge_resolution: ['exact', 'heuristic'],
  file_kind: ['source', 'test', 'doc', 'config'],
  project_framework: ['laravel', 'fastify', 'none'],
  project_language: ['php', 'typescript'],
  symbol_kind: ['class', 'interface', 'method', 'function', 'route'],
};

// Transcribed by hand from the "History, claim, usage and cache column contract" table of
// openspec/specs/graph-schema/spec.md. Enum type names and label order come from design.md D2 of
// openspec/changes/archive/2026-09-28-schema-history-claims.
const HISTORY_COLUMNS: ColumnShape[] = [
  col('commit', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('commit', 'project_id', 'uuid', true),
  col('commit', 'sha', 'text', true),
  col('commit', 'message', 'text', false),
  col('commit', 'author_hash', 'text', false),
  col('commit', 'committed_at', 'timestamp with time zone', false),
  col('commit', 'pr_number', 'integer', false),
  col('file_commit', 'file_id', 'uuid', true),
  col('file_commit', 'commit_id', 'uuid', true),
  col('file_commit', 'lines_added', 'integer', false),
  col('file_commit', 'lines_removed', 'integer', false),
  col('claim', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('claim', 'project_id', 'uuid', true),
  col('claim', 'subject', 'text', true),
  col('claim', 'predicate', 'text', true),
  col('claim', 'object', 'text', false),
  col('claim', 'layer', 'claim_layer', true),
  col('claim', 'type', 'claim_type', true),
  col('claim', 'confidence', 'double precision', false),
  col('claim', 'status', 'claim_status', true, "'current'::claim_status"),
  col('claim', 'provenance', 'jsonb', false),
  col('claim', 'created_at', 'timestamp with time zone', true, 'now()'),
  col('claim', 'updated_at', 'timestamp with time zone', true, 'now()'),
  col('evidence', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('evidence', 'claim_id', 'uuid', true),
  col('evidence', 'file_id', 'uuid', true),
  col('evidence', 'start_line', 'integer', true),
  col('evidence', 'end_line', 'integer', true),
  col('evidence', 'verification', 'evidence_verification', true),
  col('evidence', 'excerpt', 'text', false),
  col('query_log', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('query_log', 'project_id', 'uuid', true),
  col('query_log', 'question', 'text', true),
  col('query_log', 'capability', 'query_capability', true),
  col('query_log', 'input_tokens', 'integer', false),
  col('query_log', 'output_tokens', 'integer', false),
  col('query_log', 'baseline_tokens', 'integer', false),
  col('query_log', 'cost_usd', 'numeric(10,6)', false),
  col('query_log', 'latency_ms', 'integer', false),
  col('query_log', 'cache_hit', 'boolean', true, 'false'),
  col('query_log', 'created_at', 'timestamp with time zone', true, 'now()'),
  col('cache_entry', 'id', 'uuid', true, 'gen_random_uuid()'),
  col('cache_entry', 'project_id', 'uuid', true),
  col('cache_entry', 'question_normalized', 'text', true),
  col('cache_entry', 'question_embedding', 'vector(1536)', false),
  col('cache_entry', 'response', 'jsonb', false),
  col('cache_entry', 'hit_count', 'integer', true, '0'),
  col('cache_entry', 'created_at', 'timestamp with time zone', true, 'now()'),
  col('cache_entry', 'last_hit_at', 'timestamp with time zone', false),
];
const HISTORY_ENUMS: Record<string, string[]> = {
  claim_layer: ['L1', 'L2'],
  claim_status: ['current', 'stale'],
  claim_type: ['FACT', 'INFERENCE', 'UNKNOWN'],
  evidence_verification: ['none', 'cited', 'entailed', 'broken'],
  query_capability: ['explain', 'impact', 'drift'],
};
const ALL_ENUMS: Record<string, string[]> = { ...L1_ENUMS, ...HISTORY_ENUMS };

// Transcribed by hand from the "Query and vector indexes" table of
// openspec/specs/graph-schema/spec.md (key columns in order, method,
// opclass for HNSW, predicate; none unique, none with INCLUDE columns). Sorted like
// secondaryIndexShapes(): by table, then columns.
const btree = (table: string, columns: string[], predicate: string | null = null): IndexShape => ({
  table,
  columns,
  included: [],
  unique: false,
  method: 'btree',
  opclasses: null,
  predicate,
});
const hnswCosine = (table: string, column: string): IndexShape => ({
  table,
  columns: [column],
  included: [],
  unique: false,
  method: 'hnsw',
  opclasses: ['vector_cosine_ops'],
  predicate: null,
});
const EXPECTED_INDEXES: IndexShape[] = [
  btree('cache_entry', ['project_id']),
  hnswCosine('cache_entry', 'question_embedding'),
  btree('claim', ['project_id']),
  btree('claim', ['project_id', 'status'], "status = 'stale'"),
  btree('edge', ['project_id']),
  btree('edge', ['source_file_id', 'kind'], 'source_file_id IS NOT NULL'),
  btree('edge', ['source_symbol_id', 'kind'], 'source_symbol_id IS NOT NULL'),
  btree('edge', ['target_file_id', 'kind'], 'target_file_id IS NOT NULL'),
  btree('edge', ['target_symbol_id', 'kind'], 'target_symbol_id IS NOT NULL'),
  btree('evidence', ['claim_id']),
  btree('evidence', ['file_id']),
  hnswCosine('file', 'embedding'),
  btree('file', ['project_id', 'content_hash']),
  btree('file_commit', ['commit_id']),
  btree('query_log', ['project_id']),
  hnswCosine('symbol', 'embedding'),
  btree('symbol', ['file_id']),
];

const byTableAndColumn = (a: ColumnShape, b: ColumnShape) =>
  a.table.localeCompare(b.table) || a.column.localeCompare(b.column);

/** The columns of `columns` that belong to `tables`, so each contract checks only its own tables. */
function onlyTables(columns: ColumnShape[], tables: string[]): ColumnShape[] {
  return columns.filter((c) => tables.includes(c.table));
}

/** Asserts that the columns of the contract's tables equal the contract, no more and no less. */
function expectColumnContract(columns: ColumnShape[], contract: ColumnShape[]): void {
  const tables = [...new Set(contract.map((c) => c.table))];
  expect([...onlyTables(columns, tables)].sort(byTableAndColumn)).toEqual([...contract].sort(byTableAndColumn));
}

/** The enum types of `schema` whose names appear in `expected` (labels as found). */
function enumsOf(schema: SchemaSnapshot, expected: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(schema.enums).filter(([name]) => name in expected));
}

/** Primary keys of `tables`, as `table: definition`, in table order. */
function primaryKeysOf(schema: SchemaSnapshot, tables: string[]): string[] {
  return schema.constraints
    .filter((c) => tables.includes(c.table) && c.definition.startsWith('PRIMARY KEY'))
    .map((c) => `${c.table}: ${c.definition}`);
}

function tablesOf(columns: ColumnShape[]): string[] {
  return [...new Set(columns.map((c) => c.table))].sort();
}

/**
 * Applies only the named migrations (`NNNN_name`, as recorded in pgmigrations) to `url`, by copying
 * their files to a temporary directory and running the real runner over it.
 */
async function migrateUpTo(url: string, ids: string[]): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'codemind-migrate-up-to-'));
  try {
    for (const id of ids) {
      for (const side of ['up', 'down']) copyFileSync(join(MIGRATIONS_DIR, `${id}.${side}.sql`), join(dir, `${id}.${side}.sql`));
    }
    await migrateUp(url, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

  /**
   * Runs `db:rollback` until nothing is applied; returns the number of calls. Each must exit 0 and
   * revert exactly one migration, and there can be at most one call per known migration, so a
   * rollback that exits 0 without reverting anything fails at once instead of looping to the timeout.
   */
  const rollbackAll = async (): Promise<number> => {
    let calls = 0;
    let applied = (await appliedMigrations(throwaway.url)).length;
    while (applied > 0) {
      expect(calls, 'more rollbacks than known migrations').toBeLessThan(ALL_MIGRATIONS.length);
      const result = rollback();
      expect(result.status, result.stderr).toBe(0);
      calls += 1;
      const remaining = (await appliedMigrations(throwaway.url)).length;
      expect(remaining, 'db:rollback must revert exactly one migration').toBe(applied - 1);
      applied = remaining;
    }
    return calls;
  };

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
      expect(tablesOf((await snapshotSchema(throwaway.url)).columns)).toEqual(ALL_TABLES);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Migrated schema matches the column contract',
    async () => {
      expect(migrate().status).toBe(0);

      const schema = await snapshotSchema(throwaway.url);
      expectColumnContract(schema.columns, L1_COLUMNS);
      expect(enumsOf(schema, L1_ENUMS)).toEqual(L1_ENUMS);
      // "Every id is a uuid primary key generated by the database when omitted."
      expect(primaryKeysOf(schema, L1_TABLES)).toEqual(L1_TABLES.map((table) => `${table}: PRIMARY KEY (id)`));
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Migrated schema matches the history, claim, usage and cache column contract',
    async () => {
      expect(migrate().status).toBe(0);

      const schema = await snapshotSchema(throwaway.url);
      expectColumnContract(schema.columns, HISTORY_COLUMNS);
      expect(enumsOf(schema, HISTORY_ENUMS)).toEqual(HISTORY_ENUMS);
      expect(primaryKeysOf(schema, HISTORY_TABLES)).toEqual(
        HISTORY_TABLES.map((table) =>
          table === 'file_commit' ? 'file_commit: PRIMARY KEY (file_id, commit_id)' : `${table}: PRIMARY KEY (id)`,
        ),
      );
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Migrated schema has the query and vector indexes',
    async () => {
      expect(migrate().status).toBe(0);

      expect(await secondaryIndexShapes(throwaway.url)).toEqual(EXPECTED_INDEXES);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  // Generic on purpose: a future cascading FK without an index fails here without editing the test.
  it(
    'Every cascading foreign key is indexed',
    async () => {
      expect(migrate().status).toBe(0);

      expect(await unindexedCascadingForeignKeys(throwaway.url)).toEqual([]);
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

  // Proves rollback reverts ONE migration per call (count: 1). The snapshot must EQUAL a database
  // migrated with 0001 + 0002 only: an index left behind by 0003's down section would survive here,
  // while a full rollback would drop it together with its table.
  it(
    'Roll back only the latest migration',
    async () => {
      const reference = await createThrowawayDatabase(databaseUrl as string);
      try {
        await migrateUpTo(reference.url, HISTORY_MIGRATIONS);
        expect(migrate().status).toBe(0);

        const result = rollback();

        expect(result.status, result.stderr).toBe(0);
        const schema = await snapshotSchema(throwaway.url);
        expect(schema).toEqual(await snapshotSchema(reference.url));
        expect(tablesOf(schema.columns)).toEqual(ALL_TABLES);
        expect(schema.enums).toEqual(ALL_ENUMS);
        expect(await appliedMigrations(throwaway.url)).toEqual(HISTORY_MIGRATIONS);
      } finally {
        await reference.drop();
      }
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Roll back the L1 graph migration',
    async () => {
      expect(migrate().status).toBe(0);
      // Reach "only the L1 graph migration is applied".
      expect(rollback().status).toBe(0);
      expect(rollback().status).toBe(0);
      expect(await appliedMigrations(throwaway.url)).toEqual(['0001_graph-l1']);

      const result = rollback();

      expect(result.status, result.stderr).toBe(0);
      const schema = await snapshotSchema(throwaway.url);
      expect(onlyTables(schema.columns, L1_TABLES)).toEqual([]);
      expect(enumsOf(schema, L1_ENUMS)).toEqual({});
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Roll back both migrations leaves an empty schema',
    async () => {
      expect(migrate().status).toBe(0);
      // Reach "only the L1 graph migration and the history migration are applied".
      expect(rollback().status).toBe(0);
      expect(await appliedMigrations(throwaway.url)).toEqual(HISTORY_MIGRATIONS);

      const first = rollback();
      const second = rollback();

      expect(first.status, first.stderr).toBe(0);
      expect(second.status, second.stderr).toBe(0);
      const schema = await snapshotSchema(throwaway.url);
      expect(schema.columns).toEqual([]);
      expect(schema.enums).toEqual({});
      // The vector extension is shared database infrastructure: rollback keeps it.
      expect(schema.extensions).toContain('vector');
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  it(
    'Roll back every migration leaves an empty schema',
    async () => {
      expect(migrate().status).toBe(0);
      const applied = (await appliedMigrations(throwaway.url)).length;

      const calls = await rollbackAll();

      expect(calls).toBe(applied);
      const schema = await snapshotSchema(throwaway.url);
      expect(schema.columns).toEqual([]);
      expect(schema.enums).toEqual({});
      expect(schema.indexes).toEqual([]);
      expect(schema.triggers).toEqual([]);
      expect(schema.functions).toEqual([]);
      expect(await appliedMigrations(throwaway.url)).toEqual([]);
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

      // The snapshot covers indexes, triggers and functions too.
      expect(second).toEqual(first);
      expectColumnContract(second.columns, L1_COLUMNS);
      expectColumnContract(second.columns, HISTORY_COLUMNS);
      expect(tablesOf(second.columns)).toEqual(ALL_TABLES);
      expect(second.enums).toEqual(ALL_ENUMS);
    },
    LIFECYCLE_TIMEOUT_MS,
  );

  // Same scenario, full cycle: one rollback reverts only the latest migration (previous test), so the
  // earlier ones' own down-then-up only enter the identity comparison when every migration is rolled back.
  it(
    'Apply, roll back and apply again (full cycle through 0001)',
    async () => {
      expect(migrate().status).toBe(0);
      const first = await snapshotSchema(throwaway.url);
      expect(await appliedMigrations(throwaway.url)).toEqual(ALL_MIGRATIONS);

      await rollbackAll();
      expect(await appliedMigrations(throwaway.url)).toEqual([]);
      expect(migrate().status).toBe(0);
      const second = await snapshotSchema(throwaway.url);

      expect(second).toEqual(first);
      expectColumnContract(second.columns, L1_COLUMNS);
      expectColumnContract(second.columns, HISTORY_COLUMNS);
      expect(tablesOf(second.columns)).toEqual(ALL_TABLES);
      expect(second.enums).toEqual(ALL_ENUMS);
      expect(await appliedMigrations(throwaway.url)).toEqual(ALL_MIGRATIONS);
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
