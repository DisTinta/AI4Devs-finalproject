import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * A uniquely named database on the server of `serverUrl`, so migrate/rollback runs never touch the
 * shared database other test files use. Requires CREATEDB (the compose / CI user is a superuser).
 * Created and dropped through the `pg` client, never through a shell command.
 */
export async function createThrowawayDatabase(serverUrl: string): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `codemind_migrations_${randomUUID().replaceAll('-', '')}`;
  await withAdminClient(serverUrl, (client) => client.query(`CREATE DATABASE "${name}"`));
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () => withAdminClient(serverUrl, (client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)),
  };
}

async function withAdminClient(serverUrl: string, work: (client: Client) => Promise<unknown>): Promise<void> {
  const client = new Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

/** Rows of node-pg-migrate's bookkeeping table, in run order (excluded from `snapshotSchema`). */
export async function appliedMigrations(databaseUrl: string): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id');
    return rows.map((row) => row.name);
  } finally {
    await client.end();
  }
}

export interface ColumnShape {
  table: string;
  column: string;
  type: string;
  notNull: boolean;
  default: string | null;
}

/** A named schema object attached to a table (index or trigger), with its full SQL definition. */
export interface TableObject {
  table: string;
  name: string;
  definition: string;
}

export interface SchemaSnapshot {
  columns: ColumnShape[];
  constraints: TableObject[];
  enums: Record<string, string[]>;
  extensions: string[];
  /** Every index, including those behind primary keys and unique constraints (`pg_indexes.indexdef`). */
  indexes: TableObject[];
  /** User triggers only; the internal triggers behind foreign keys are covered by `constraints`. */
  triggers: TableObject[];
  /** Functions of this schema; the ones an extension installs in `public` (pgvector's) are excluded. */
  functions: { name: string; definition: string }[];
}

/**
 * Ordered description of the `public` schema, excluding node-pg-migrate's bookkeeping table:
 * columns, constraints, enums, extensions, indexes, triggers and non-extension functions.
 */
export async function snapshotSchema(databaseUrl: string): Promise<SchemaSnapshot> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const columns = await client.query<ColumnShape>(`
      SELECT c.relname AS "table", a.attname AS "column", format_type(a.atttypid, a.atttypmod) AS "type",
             a.attnotnull AS "notNull", pg_get_expr(d.adbin, d.adrelid) AS "default"
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relname <> 'pgmigrations'
      ORDER BY c.relname, a.attnum`);
    const constraints = await client.query<TableObject>(`
      SELECT c.relname AS "table", k.conname AS "name", pg_get_constraintdef(k.oid) AS "definition"
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname <> 'pgmigrations'
      ORDER BY c.relname, k.conname`);
    const enums = await client.query<{ name: string; labels: string[] }>(`
      SELECT t.typname AS "name", array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS "labels"
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname`);
    const extensions = await client.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname`,
    );
    const indexes = await client.query<TableObject>(`
      SELECT tablename AS "table", indexname AS "name", indexdef AS "definition"
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
      ORDER BY tablename, indexname`);
    const triggers = await client.query<TableObject>(`
      SELECT c.relname AS "table", t.tgname AS "name", pg_get_triggerdef(t.oid) AS "definition"
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE NOT t.tgisinternal AND c.relname <> 'pgmigrations'
      ORDER BY c.relname, t.tgname`);
    const functions = await client.query<{ name: string; definition: string }>(`
      SELECT p.proname AS "name", pg_get_functiondef(p.oid) AS "definition"
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
      ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`);
    return {
      columns: columns.rows,
      constraints: constraints.rows,
      enums: Object.fromEntries(enums.rows.map((row) => [row.name, row.labels])),
      extensions: extensions.rows.map((row) => row.extname),
      indexes: indexes.rows,
      triggers: triggers.rows,
      functions: functions.rows,
    };
  } finally {
    await client.end();
  }
}

/** Contract shape of a secondary index: what the spec fixes, independent of its name and formatting. */
export interface IndexShape {
  table: string;
  /** Key columns, in order (`INCLUDE` columns are not key columns: see `included`). */
  columns: string[];
  /** `INCLUDE` (non-key) columns, in order; empty when there are none. */
  included: string[];
  unique: boolean;
  method: string;
  /**
   * Key-column operator classes. Null for a btree index whose key columns all use their type's
   * default class; otherwise every key column's class, in order.
   */
  opclasses: string[] | null;
  /** Partial-index predicate without outer parentheses and type casts, or null. */
  predicate: string | null;
}

/**
 * Type casts as PostgreSQL prints them: quoted names, multi-word types and array suffixes included
 * (`::claim_status`, `::character varying`, `::"MyType"`, `::text[]`).
 */
const TYPE_CAST = /::(?:"[^"]+"|[a-z_][a-z0-9_]*(?: varying| precision| with(?:out)? time zone)?)(?:\[\])*/g;

/** `(status = 'stale'::claim_status)` → `status = 'stale'`: outer parentheses and every cast removed. */
function normalisePredicate(predicate: string | null): string | null {
  if (predicate === null) return null;
  return predicate.replace(/^\((.*)\)$/, '$1').replace(TYPE_CAST, '');
}

/**
 * Secondary indexes of the `public` schema (not backing a primary key or unique constraint), as
 * `IndexShape`s ordered by table, then columns, then predicate, so the order never depends on the
 * catalog's.
 */
export async function secondaryIndexShapes(databaseUrl: string): Promise<IndexShape[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{
      table: string;
      columns: string[];
      included: string[];
      unique: boolean;
      method: string;
      opclasses: string[];
      allDefaultOpclasses: boolean;
      predicate: string | null;
    }>(`
      SELECT t.relname AS "table",
             -- indkey lists the key columns first (indnkeyatts of them), then the INCLUDE columns.
             ARRAY(SELECT a.attname FROM unnest(ix.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
                   WHERE k.ord <= ix.indnkeyatts
                   ORDER BY k.ord)::text[] AS "columns",
             ARRAY(SELECT a.attname FROM unnest(ix.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
                   WHERE k.ord > ix.indnkeyatts
                   ORDER BY k.ord)::text[] AS "included",
             ix.indisunique AS "unique",
             am.amname AS "method",
             -- indclass has one entry per key column only.
             ARRAY(SELECT oc.opcname FROM unnest(ix.indclass::oid[]) WITH ORDINALITY o(oid, ord)
                   JOIN pg_opclass oc ON oc.oid = o.oid
                   ORDER BY o.ord)::text[] AS "opclasses",
             NOT EXISTS (SELECT 1 FROM unnest(ix.indclass::oid[]) o(oid)
                         JOIN pg_opclass oc ON oc.oid = o.oid
                         WHERE NOT oc.opcdefault) AS "allDefaultOpclasses",
             pg_get_expr(ix.indpred, ix.indrelid) AS "predicate"
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
      JOIN pg_am am ON am.oid = i.relam
      WHERE t.relname <> 'pgmigrations'
        -- "Secondary" = not backing a primary key, unique or exclusion constraint. A foreign key's
        -- conindid is the REFERENCED unique index, so FKs must not count here.
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint k WHERE k.conindid = ix.indexrelid AND k.contype IN ('p', 'u', 'x')
        )
      ORDER BY t.relname, i.relname`);
    return rows
      .map((row) => ({
        table: row.table,
        columns: row.columns,
        included: row.included,
        unique: row.unique,
        method: row.method,
        opclasses: row.method === 'btree' && row.allDefaultOpclasses ? null : row.opclasses,
        predicate: normalisePredicate(row.predicate),
      }))
      .sort(
        (a, b) =>
          a.table.localeCompare(b.table) ||
          a.columns.join().localeCompare(b.columns.join()) ||
          (a.predicate ?? '').localeCompare(b.predicate ?? ''),
      );
  } finally {
    await client.end();
  }
}

/**
 * Foreign-key columns declared `ON DELETE CASCADE` that are not the first key column of any index on
 * their table, as `table.column`, ordered.
 *
 * Limits, accepted while every cascading FK has one column: a composite FK is checked on its first
 * column only, and any index leading with that column counts, whatever its predicate.
 */
export async function unindexedCascadingForeignKeys(databaseUrl: string): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ fk: string }>(`
      SELECT c.relname || '.' || a.attname AS "fk"
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND k.confdeltype = 'c'
        AND NOT EXISTS (SELECT 1 FROM pg_index ix WHERE ix.indrelid = k.conrelid AND ix.indkey[0] = k.conkey[1])
      ORDER BY 1`);
    return rows.map((row) => row.fk);
  } finally {
    await client.end();
  }
}
