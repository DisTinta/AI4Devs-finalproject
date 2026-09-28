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

export interface SchemaSnapshot {
  columns: ColumnShape[];
  constraints: { table: string; name: string; definition: string }[];
  enums: Record<string, string[]>;
  extensions: string[];
}

/** Ordered description of the `public` schema, excluding node-pg-migrate's bookkeeping table. */
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
    const constraints = await client.query<{ table: string; name: string; definition: string }>(`
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
    return {
      columns: columns.rows,
      constraints: constraints.rows,
      enums: Object.fromEntries(enums.rows.map((row) => [row.name, row.labels])),
      extensions: extensions.rows.map((row) => row.extname),
    };
  } finally {
    await client.end();
  }
}
