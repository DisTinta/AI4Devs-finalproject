// Demonstration of openspec change schema-indexes-stale (DIS-13) against the running system.
// Run from the repo root: node <this file>. Needs DATABASE_URL (shared DB, already migrated).
// Independent of the Vitest suite. Part A drives the real npm scripts against throwaway databases;
// its reference state (0001 + 0002 only) is built with node-pg-migrate's runner, using the options
// of migrate.ts. Part B issues real SQL on the shared DB, each scenario inside BEGIN/ROLLBACK.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { runner } from 'node-pg-migrate';

const require = createRequire(`${process.cwd()}/package.json`);
const { Client } = require('pg');
const SHARED = process.env.DATABASE_URL;
const MIGRATIONS_DIR = 'packages/adapters/store-postgres/migrations';
const SPEC = 'openspec/changes/schema-indexes-stale/specs/graph-schema/spec.md';
const log = (...a) => console.log(...a);
const results = [];
const record = (id, scenario, ok, detail) => {
  results.push({ id, scenario, ok, detail });
  log(`  => ${ok ? 'MATCHES' : 'DOES NOT MATCH'} spec: ${detail}`);
};
const show = (xs) => (xs.length ? xs.join(', ') : '(none)');

function npm(script, url) {
  const r = spawnSync(`npm run --silent ${script}`, { env: { ...process.env, DATABASE_URL: url }, shell: true, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`.trim().split('\n').filter((l) => l.trim()).map((l) => `      | ${l}`).join('\n');
  log(`    $ DATABASE_URL=<throwaway> npm run ${script}\n${out}\n      exit=${r.status}`);
  return r.status;
}

async function withClient(url, fn) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

// Same coverage as tests/integration/store/schema-snapshot.ts after this change.
async function snapshot(url) {
  return withClient(url, async (c) => {
    const q = async (sql) => (await c.query(sql)).rows;
    return {
      columns: await q(`SELECT c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) type, a.attnotnull nn,
          pg_get_expr(d.adbin, d.adrelid) dflt FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid AND c.relkind='r'
          JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attnum>0 AND NOT a.attisdropped AND c.relname<>'pgmigrations' ORDER BY 1, a.attnum`),
      constraints: await q(`SELECT c.relname t, k.conname, pg_get_constraintdef(k.oid) def FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' WHERE c.relname<>'pgmigrations' ORDER BY 1,2`),
      enums: await q(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] l FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
          JOIN pg_namespace n ON n.oid=t.typnamespace AND n.nspname='public' GROUP BY 1 ORDER BY 1`),
      extensions: (await q(`SELECT extname FROM pg_extension WHERE extname<>'plpgsql' ORDER BY 1`)).map((r) => r.extname),
      indexes: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename<>'pgmigrations' ORDER BY 1,2`),
      triggers: await q(`SELECT c.relname t, tg.tgname, pg_get_triggerdef(tg.oid) def FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' WHERE NOT tg.tgisinternal ORDER BY 1,2`),
      functions: await q(`SELECT p.proname, pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
          WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1`),
    };
  });
}
const tablesOf = (s) => [...new Set(s.columns.map((c) => c.t))].sort();
const summary = (s) =>
  `tables ${tablesOf(s).length}, enums ${s.enums.length}, indexes ${s.indexes.length}, triggers ${show(s.triggers.map((t) => t.tgname))}, functions ${show(s.functions.map((f) => f.proname))}, extensions ${show(s.extensions)}`;
const migrations = (url) => withClient(url, async (c) => (await c.query('SELECT name FROM pgmigrations ORDER BY id')).rows.map((r) => r.name));

async function throwaway() {
  const name = `codemind_demo_${randomUUID().replaceAll('-', '')}`;
  await withClient(SHARED, (c) => c.query(`CREATE DATABASE "${name}"`));
  const u = new URL(SHARED);
  u.pathname = `/${name}`;
  return { name, url: u.toString(), drop: () => withClient(SHARED, (c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)) };
}

// Reference state: only the named migrations, through node-pg-migrate's runner with migrate.ts options.
async function migrateUpTo(url, ids) {
  const dir = mkdtempSync(join(tmpdir(), 'codemind-demo-'));
  try {
    for (const id of ids) for (const side of ['up', 'down']) copyFileSync(join(MIGRATIONS_DIR, `${id}.${side}.sql`), join(dir, `${id}.${side}.sql`));
    await runner({ databaseUrl: url, dir, migrationsTable: 'pgmigrations', direction: 'up', singleTransaction: true, count: Infinity,
      migrationLoaderStrategies: [{ extensions: ['.sql'], loader: 'sql' }], log: () => {} });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Index contract parsed live from the delta spec's markdown table.
function indexContractFromSpec() {
  const md = readFileSync(SPEC, 'utf8');
  const start = md.indexOf('| Table | Key columns (in order) |');
  return md.slice(start).split(/\r?\n/).slice(2).filter((l) => l.startsWith('| `')).map((l) => {
    const [t, cols, method, pred] = l.split('|').slice(1, 5).map((x) => x.trim());
    const [m, opc] = method.replaceAll('`', '').split(',').map((x) => x.trim());
    return { table: t.replaceAll('`', ''), columns: cols.replaceAll('`', '').split(',').map((x) => x.trim()),
      method: m, opclasses: opc ? [opc] : null, predicate: pred === '—' ? null : pred.replaceAll('`', '') };
  });
}
const keyOf = (i) => `${i.table}(${i.columns.join(', ')}) ${i.method}${i.opclasses ? ` ${i.opclasses}` : ''}${i.predicate ? ` WHERE ${i.predicate}` : ''}`;

async function secondaryIndexes(url) {
  return withClient(url, async (c) => (await c.query(`
    SELECT t.relname tbl,
      ARRAY(SELECT a.attname FROM unnest(ix.indkey::int2[]) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid=ix.indrelid AND a.attnum=k.attnum ORDER BY k.ord)::text[] cols,
      am.amname method,
      ARRAY(SELECT oc.opcname FROM unnest(ix.indclass::oid[]) WITH ORDINALITY o(oid, ord) JOIN pg_opclass oc ON oc.oid=o.oid ORDER BY o.ord)::text[] opc,
      pg_get_expr(ix.indpred, ix.indrelid) pred
    FROM pg_index ix JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_class t ON t.oid=ix.indrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace AND n.nspname='public' JOIN pg_am am ON am.oid=i.relam
    WHERE t.relname<>'pgmigrations' AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid=ix.indexrelid)`)).rows.map((r) => ({
    table: r.tbl, columns: r.cols, method: r.method, opclasses: r.method === 'btree' ? null : r.opc,
    predicate: r.pred === null ? null : r.pred.replace(/^\((.*)\)$/, '$1').replace(/::[a-z_]+/g, ''),
  })));
}

// ---------------------------------------------------------------------------------------------
async function partA() {
  log('\n=== Part A — lifecycle and indexes (npm scripts, throwaway databases) ===');
  const ref = await throwaway();
  let db = await throwaway();
  try {
    await migrateUpTo(ref.url, ['0001_graph-l1', '0002_history-claims']);
    const refSnap = await snapshot(ref.url);
    log(`\n    reference DB (0001 + 0002 only, via runner): ${summary(refSnap)}; pgmigrations: ${show(await migrations(ref.url))}`);

    log(`\n[A1] Roll back only the latest migration   (throwaway ${db.name})`);
    const m = npm('db:migrate', db.url);
    log(`    after migrate: ${summary(await snapshot(db.url))}`);
    const r = npm('db:rollback', db.url);
    const s1 = await snapshot(db.url);
    const mig1 = await migrations(db.url);
    const equal = JSON.stringify(s1) === JSON.stringify(refSnap);
    log(`    after rollback: ${summary(s1)}; pgmigrations: ${show(mig1)}; snapshot == reference: ${equal}`);
    record('A1', 'Roll back only the latest migration', m === 0 && r === 0 && equal && tablesOf(s1).length === 10
      && JSON.stringify(mig1) === JSON.stringify(['0001_graph-l1', '0002_history-claims']),
      `exit ${r}; 0003's indexes/trigger/function gone; ten tables kept; identical to the 0001+0002 reference`);

    log('\n[A2] Roll back the L1 graph migration   (continue: reach "only L1 applied", then roll back)');
    npm('db:rollback', db.url);
    log(`    pgmigrations: ${show(await migrations(db.url))}`);
    const r2 = npm('db:rollback', db.url);
    const s2 = await snapshot(db.url);
    log(`    after rollback: ${summary(s2)}`);
    record('A2', 'Roll back the L1 graph migration', r2 === 0 && s2.columns.length === 0 && s2.enums.length === 0, `exit ${r2}; L1 tables and enums gone`);
  } finally { await db.drop(); await ref.drop(); }

  db = await throwaway();
  try {
    log(`\n[A3] Roll back both migrations leaves an empty schema   (fresh throwaway ${db.name})`);
    npm('db:migrate', db.url);
    npm('db:rollback', db.url);
    log(`    precondition — pgmigrations: ${show(await migrations(db.url))}`);
    const a = npm('db:rollback', db.url);
    const b = npm('db:rollback', db.url);
    const s = await snapshot(db.url);
    log(`    after two rollbacks: ${summary(s)}`);
    record('A3', 'Roll back both migrations leaves an empty schema', a === 0 && b === 0 && s.columns.length === 0 && s.enums.length === 0 && s.extensions.includes('vector'),
      `exits ${a}/${b}; no table, no enum; vector kept`);
  } finally { await db.drop(); }

  db = await throwaway();
  try {
    log(`\n[A4] Roll back every migration leaves an empty schema   (fresh throwaway ${db.name})`);
    npm('db:migrate', db.url);
    const n = (await migrations(db.url)).length;
    const exits = [];
    for (let i = 0; i < n; i += 1) exits.push(npm('db:rollback', db.url));
    const s = await snapshot(db.url);
    const left = await migrations(db.url);
    log(`    ${n} rollbacks, exits ${exits.join('/')}; ${summary(s)}; pgmigrations: ${show(left)}`);
    record('A4', 'Roll back every migration leaves an empty schema',
      exits.every((e) => e === 0) && s.columns.length === 0 && s.enums.length === 0 && s.indexes.length === 0 && s.triggers.length === 0
      && s.functions.length === 0 && left.length === 0 && s.extensions.includes('vector'),
      `${n} calls, all exit 0; no table, enum, index, trigger or function; nothing recorded; vector kept`);
  } finally { await db.drop(); }

  db = await throwaway();
  try {
    log(`\n[A5] Apply, roll back and apply again   (fresh throwaway ${db.name})`);
    const e1 = npm('db:migrate', db.url);
    const first = await snapshot(db.url);
    const e2 = npm('db:rollback', db.url);
    const e3 = npm('db:migrate', db.url);
    const one = JSON.stringify(await snapshot(db.url)) === JSON.stringify(first);
    log(`    one rollback: second == first (incl. indexes, triggers, functions): ${one}`);
    const n = (await migrations(db.url)).length;
    const exits = [];
    for (let i = 0; i < n; i += 1) exits.push(npm('db:rollback', db.url));
    const e4 = npm('db:migrate', db.url);
    const full = JSON.stringify(await snapshot(db.url)) === JSON.stringify(first);
    log(`    full cycle (${n} rollbacks): second == first: ${full}; ${summary(first)}`);
    record('A5', 'Apply, roll back and apply again', [e1, e2, e3, e4, ...exits].every((e) => e === 0) && one && full,
      `identical after one rollback and after a full cycle, indexes/triggers/functions included`);

    log('\n[A6] Migrated schema has the query and vector indexes   (same DB, migrated)');
    const expected = indexContractFromSpec().map(keyOf).sort();
    const actual = (await secondaryIndexes(db.url)).map(keyOf).sort();
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k));
    log(`    spec rows parsed: ${expected.length}; secondary indexes in catalog: ${actual.length}`);
    actual.forEach((k) => log(`      ${k}`));
    log(`    missing: ${show(missing)}; extra: ${show(extra)}`);
    record('A6', 'Migrated schema has the query and vector indexes', expected.length === 17 && !missing.length && !extra.length,
      `${expected.length} spec rows, ${actual.length} indexes, 0 missing, 0 extra`);

    log('\n[A7] Every cascading foreign key is indexed');
    const fks = await withClient(db.url, async (c) => (await c.query(`
      SELECT c.relname || '.' || a.attname fk,
        EXISTS (SELECT 1 FROM pg_index ix WHERE ix.indrelid=k.conrelid AND ix.indkey[0]=k.conkey[1]) indexed
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
      JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
      WHERE k.contype='f' AND k.confdeltype='c' ORDER BY 1`)).rows);
    fks.forEach((f) => log(`      ${f.indexed ? 'indexed  ' : 'UNINDEXED'} ${f.fk}`));
    record('A7', 'Every cascading foreign key is indexed', fks.length > 0 && fks.every((f) => f.indexed), `${fks.length} cascading FKs, all lead an index`);
  } finally { await db.drop(); }
}

// ---------------------------------------------------------------------------------------------
async function partB() {
  log('\n=== Part B — stale invalidation (shared DB, BEGIN … ROLLBACK per scenario) ===');
  const c = new Client({ connectionString: SHARED });
  await c.connect();
  const PAST = '2000-01-01T00:00:00.000Z';
  const one = async (sql, p = []) => (await c.query(sql, p)).rows[0];
  const project = async () => (await one(`INSERT INTO project (name, root_path, language) VALUES ($1, '/demo', 'php') RETURNING id`, [`demo-${randomUUID()}`])).id;
  const file = async (p, hash) => (await one(`INSERT INTO file (project_id, path, kind, content_hash) VALUES ($1, $2, 'source', $3) RETURNING id`, [p, `app/${randomUUID()}.php`, hash])).id;
  const claim = async (p, files, status = 'current') => {
    const id = (await one(`INSERT INTO claim (project_id, subject, predicate, layer, type, status, updated_at) VALUES ($1,'s','p','L1','FACT',$2,$3) RETURNING id`, [p, status, PAST])).id;
    for (const f of files) await c.query(`INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification) VALUES ($1,$2,10,20,'cited')`, [id, f]);
    return id;
  };
  const state = async (id) => { const r = await one('SELECT status, updated_at FROM claim WHERE id = $1', [id]); return { status: r.status, updated_at: r.updated_at.toISOString() }; };
  const exec = async (sql, p) => { await c.query(sql, p); log(`    > ${sql}   [${p.map((x) => (String(x).length > 12 ? '<id>' : x)).join(', ')}]`); };
  let n = 0;
  const scenario = async (name, fn) => {
    n += 1; const id = `B${n}`; log(`\n[${id}] ${name}`);
    await c.query('BEGIN');
    try { await fn(id, name); } finally { await c.query('ROLLBACK'); }
  };
  const report = async (label, cl) => { const s = await state(cl); log(`    ${label}: status=${s.status} updated_at=${s.updated_at}`); return s; };

  await scenario("Changing a file's content hash marks the claims that cite it stale", async (id, name) => {
    const p = await project(); const f = await file(p, 'h1'); const cl = await claim(p, [f]);
    await report('before', cl);
    await exec('UPDATE file SET content_hash = $2 WHERE id = $1', [f, 'h2']);
    const s = await report('after', cl);
    record(id, name, s.status === 'stale' && s.updated_at > PAST, `stale; updated_at moved from ${PAST} to ${s.updated_at}`);
  });
  await scenario('Claims citing only other files stay current', async (id, name) => {
    const p = await project(); const a = await file(p, 'a1'); const b = await file(p, 'b1'); const cl = await claim(p, [a]);
    await exec('UPDATE file SET content_hash = $2 WHERE id = $1', [b, 'b2']);
    const s = await report('claim citing A after B changed', cl);
    record(id, name, s.status === 'current' && s.updated_at === PAST, 'still current, updated_at untouched');
  });
  await scenario('Updating other columns of a file leaves its claims current', async (id, name) => {
    const p = await project(); const f = await file(p, 'h1'); const cl = await claim(p, [f]);
    await exec('UPDATE file SET loc = $2, redacted = true WHERE id = $1', [f, 120]);
    const s = await report('after', cl);
    record(id, name, s.status === 'current' && s.updated_at === PAST, 'still current, updated_at untouched');
  });
  await scenario('Writing the same content hash again leaves claims current', async (id, name) => {
    const p = await project(); const f = await file(p, 'h1'); const cl = await claim(p, [f]);
    await exec('UPDATE file SET content_hash = $2 WHERE id = $1', [f, 'h1']);
    const s = await report('after', cl);
    record(id, name, s.status === 'current' && s.updated_at === PAST, 'still current, updated_at untouched');
  });
  await scenario('Setting a first content hash marks the claims that cite it stale', async (id, name) => {
    const p = await project(); const f = await file(p, null); const cl = await claim(p, [f]);
    await exec('UPDATE file SET content_hash = $2 WHERE id = $1', [f, 'h1']);
    const s = await report('after NULL → h1', cl);
    record(id, name, s.status === 'stale', 'stale');
  });
  await scenario('A claim already stale is not touched', async (id, name) => {
    const p = await project(); const f = await file(p, 'h1'); const cl = await claim(p, [f], 'stale');
    await exec('UPDATE file SET content_hash = $2 WHERE id = $1', [f, 'h2']);
    const s = await report('after', cl);
    record(id, name, s.status === 'stale' && s.updated_at === PAST, 'still stale, updated_at untouched');
  });
  await scenario('A claim citing several files becomes stale when one of them changes', async (id, name) => {
    const p = await project(); const a = await file(p, 'a1'); const b = await file(p, 'b1'); const cl = await claim(p, [a, b]);
    await exec('UPDATE file SET content_hash = $2 WHERE id = $1', [b, 'b2']);
    const s = await report('after only B changed', cl);
    record(id, name, s.status === 'stale', 'stale');
  });
  await c.end();
}

async function sharedState() {
  return withClient(SHARED, async (c) => {
    const q = async (s) => (await c.query(s)).rows;
    const counts = {};
    for (const t of (await q("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'pgmigrations' ORDER BY 1")).map((r) => r.tablename)) {
      counts[t] = Number((await q(`SELECT count(*) FROM "${t}"`))[0].count);
    }
    return {
      migrations: (await q('SELECT name FROM pgmigrations ORDER BY id')).map((r) => r.name),
      counts,
      indexes: Number((await q("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename<>'pgmigrations'"))[0].count),
      databases: (await q('SELECT datname FROM pg_database ORDER BY 1')).map((r) => r.datname),
    };
  });
}

const before = await sharedState();
log(`STATE BEFORE: ${JSON.stringify(before)}`);
await partA();
await partB();
const after = await sharedState();
log(`\nSTATE AFTER: ${JSON.stringify(after)}`);
log(`STATE RESTORED (identical): ${JSON.stringify(before) === JSON.stringify(after)}`);
const failed = results.filter((r) => !r.ok);
log(`\nSUMMARY: ${results.length} scenarios exercised, ${results.length - failed.length} match the spec, ${failed.length} do not`);
for (const f of failed) log(`  FAILED ${f.id} ${f.scenario}: ${f.detail}`);
process.exit(failed.length ? 1 : 0);
