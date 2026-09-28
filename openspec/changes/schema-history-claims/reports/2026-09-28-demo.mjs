// Demonstration of openspec change schema-history-claims (DIS-12) against the running system.
// Run from the repo root: node <this file>. Needs DATABASE_URL (shared DB, already migrated).
// Independent of the Vitest suite: lifecycle scenarios drive the real npm scripts against
// throwaway databases; table scenarios issue real SQL on the shared DB inside BEGIN/ROLLBACK.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(`${process.cwd()}/package.json`);
const { Client } = require('pg');
const SHARED = process.env.DATABASE_URL;
const log = (...a) => console.log(...a);
const results = [];
const record = (id, scenario, ok, detail) => {
  results.push({ id, scenario, ok, detail });
  log(`  => ${ok ? 'MATCHES' : 'DOES NOT MATCH'} spec: ${detail}`);
};

const L1 = ['edge', 'file', 'project', 'symbol'];
const HISTORY = ['cache_entry', 'claim', 'commit', 'evidence', 'file_commit', 'query_log'];
const ALL = [...L1, ...HISTORY].sort();
const L1_ENUMS = ['edge_kind', 'edge_resolution', 'file_kind', 'project_framework', 'project_language', 'symbol_kind'];
const HISTORY_ENUMS = ['claim_layer', 'claim_status', 'claim_type', 'evidence_verification', 'query_capability'];

function npm(script, url) {
  const env = { ...process.env };
  if (url === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = url;
  const r = spawnSync(`npm run --silent ${script}`, { env, shell: true, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`.trim().split('\n').filter((l) => l.trim()).map((l) => `      | ${l}`).join('\n');
  log(`    $ DATABASE_URL=<throwaway> npm run ${script}\n${out}\n      exit=${r.status}`);
  return r.status;
}

async function withClient(url, fn) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function snapshot(url) {
  return withClient(url, async (c) => ({
    columns: (await c.query(`SELECT c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) type,
        a.attnotnull nn, pg_get_expr(d.adbin, d.adrelid) dflt
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid AND c.relkind='r'
      JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attnum>0 AND NOT a.attisdropped AND c.relname<>'pgmigrations' ORDER BY 1, a.attnum`)).rows,
    constraints: (await c.query(`SELECT c.relname t, k.conname, pg_get_constraintdef(k.oid) def FROM pg_constraint k
      JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
      WHERE c.relname<>'pgmigrations' ORDER BY 1,2`)).rows,
    enums: Object.fromEntries((await c.query(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] l
      FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace AND n.nspname='public'
      GROUP BY 1 ORDER BY 1`)).rows.map((r) => [r.typname, r.l])),
    extensions: (await c.query(`SELECT extname FROM pg_extension WHERE extname<>'plpgsql' ORDER BY 1`)).rows.map((r) => r.extname),
  }));
}

const migrations = (url) => withClient(url, async (c) => (await c.query('SELECT name FROM pgmigrations ORDER BY id')).rows.map((r) => r.name));
const tablesOf = (s) => [...new Set(s.columns.map((c) => c.t))].sort();
const show = (xs) => (xs.length ? xs.join(', ') : '(none)');

// Column contracts parsed live from the spec markdown (not from the tests' transcription).
function contractFrom(path, tables) {
  const md = readFileSync(path, 'utf8');
  return md.split(/\r?\n/).filter((l) => new RegExp(`^\\| \`(${tables.join('|')})\` \\|`).test(l)).map((l) => {
    const [t, col, type, nul, dflt] = l.split('|').slice(1, 6).map((x) => x.trim().replaceAll('`', ''));
    const e = type.match(/^enum \((.*)\)$/);
    return { t, col, type, enumLabels: e ? e[1].split(',').map((x) => x.trim()) : null, nn: nul === 'NOT NULL',
      dflt: dflt === '—' ? null : dflt === 'generated' ? 'gen_random_uuid()' : dflt };
  });
}
const L1_CONTRACT = contractFrom('openspec/specs/graph-schema/spec.md', L1);
const HISTORY_CONTRACT = contractFrom('openspec/changes/schema-history-claims/specs/graph-schema/spec.md', HISTORY);

// `'current'::claim_status` → `current`, so enum defaults compare with the spec's plain value.
const normDefault = (d) => (d === null ? null : d.replace(/^'(.*)'::[a-z_]+$/, '$1'));

// The spec writes PostgreSQL's alias; format_type() prints the canonical name of the same type.
const TYPE_ALIASES = { timestamptz: 'timestamp with time zone' };

function contractMismatches(s, contract) {
  const tables = [...new Set(contract.map((r) => r.t))];
  const actual = s.columns.filter((c) => tables.includes(c.t));
  const bad = [];
  for (const r of contract) {
    const a = actual.find((c) => c.t === r.t && c.col === r.col);
    if (!a) { bad.push(`${r.t}.${r.col} missing`); continue; }
    if (r.enumLabels) {
      if (JSON.stringify(s.enums[a.type]) !== JSON.stringify(r.enumLabels)) bad.push(`${r.t}.${r.col} enum ${a.type}=${s.enums[a.type]}`);
    } else if (a.type !== (TYPE_ALIASES[r.type] ?? r.type)) bad.push(`${r.t}.${r.col} type ${a.type}≠${r.type}`);
    if (a.nn !== r.nn) bad.push(`${r.t}.${r.col} notNull ${a.nn}≠${r.nn}`);
    if (normDefault(a.dflt) !== r.dflt) bad.push(`${r.t}.${r.col} default ${a.dflt}≠${r.dflt}`);
  }
  for (const a of actual) if (!contract.some((r) => r.t === a.t && r.col === a.col)) bad.push(`${a.t}.${a.col} extra`);
  return { specRows: contract.length, columns: actual.length, bad };
}

async function throwaway() {
  const name = `codemind_demo_${randomUUID().replaceAll('-', '')}`;
  await withClient(SHARED, (c) => c.query(`CREATE DATABASE "${name}"`));
  const u = new URL(SHARED);
  u.pathname = `/${name}`;
  return { name, url: u.toString(), drop: () => withClient(SHARED, (c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)) };
}

// ---------------------------------------------------------------------------------------------
// Part A — lifecycle, real npm scripts, throwaway databases
// ---------------------------------------------------------------------------------------------
async function partA() {
  log('\n=== Part A — migration lifecycle (npm scripts, throwaway databases) ===');
  let db = await throwaway();
  try {
    log(`\n[A1] Migrate an empty database   (throwaway ${db.name})`);
    log(`    tables before: ${show(tablesOf(await snapshot(db.url)))}`);
    const s1 = npm('db:migrate', db.url);
    const snap1 = await snapshot(db.url);
    log(`    tables after: ${show(tablesOf(snap1))}`);
    record('A1', 'Migrate an empty database', s1 === 0 && JSON.stringify(tablesOf(snap1)) === JSON.stringify(ALL),
      `exit ${s1}; exactly the ten tables: ${JSON.stringify(tablesOf(snap1)) === JSON.stringify(ALL)}`);

    log('\n[A2] Migrated schema matches the history, claim, usage and cache column contract');
    const m = contractMismatches(snap1, HISTORY_CONTRACT);
    const pks = snap1.constraints.filter((k) => HISTORY.includes(k.t) && k.def.startsWith('PRIMARY KEY')).map((k) => `${k.t}: ${k.def}`);
    log(`    spec rows parsed: ${m.specRows}; catalog columns in the six tables: ${m.columns}; mismatches: ${show(m.bad)}`);
    log(`    enums: ${JSON.stringify(Object.fromEntries(HISTORY_ENUMS.map((e) => [e, snap1.enums[e]])))}`);
    log(`    primary keys: ${pks.join(' | ')}`);
    const pkOk = pks.length === 6 && pks.every((p) => (p.startsWith('file_commit') ? p.endsWith('(file_id, commit_id)') : p.endsWith('PRIMARY KEY (id)')));
    record('A2', 'Migrated schema matches the history, claim, usage and cache column contract',
      m.bad.length === 0 && m.specRows === 49 && pkOk, `${m.specRows} rows, ${m.bad.length} mismatches, PKs ok: ${pkOk}`);

    log('\n[A3] Migrate an up-to-date database');
    const before = JSON.stringify(snap1);
    const migBefore = await migrations(db.url);
    const s3 = npm('db:migrate', db.url);
    const same = JSON.stringify(await snapshot(db.url)) === before;
    const migSame = JSON.stringify(await migrations(db.url)) === JSON.stringify(migBefore);
    log(`    pgmigrations: ${show(await migrations(db.url))}; schema unchanged: ${same}`);
    record('A3', 'Migrate an up-to-date database', s3 === 0 && same && migSame, `exit ${s3}; unchanged ${same}`);

    log('\n[A4] Roll back only the latest migration');
    const s4 = npm('db:rollback', db.url);
    const snap4 = await snapshot(db.url);
    const mig4 = await migrations(db.url);
    const l1m = contractMismatches(snap4, L1_CONTRACT);
    log(`    tables: ${show(tablesOf(snap4))}; enums: ${show(Object.keys(snap4.enums))}; pgmigrations: ${show(mig4)}`);
    log(`    L1 contract after rollback: ${l1m.specRows} rows, mismatches: ${show(l1m.bad)}`);
    const a4ok = s4 === 0 && JSON.stringify(tablesOf(snap4)) === JSON.stringify(L1)
      && JSON.stringify(Object.keys(snap4.enums)) === JSON.stringify(L1_ENUMS) && l1m.bad.length === 0
      && JSON.stringify(mig4) === JSON.stringify(['0001_graph-l1']);
    record('A4', 'Roll back only the latest migration', a4ok, `exit ${s4}; L1 intact; only 0001_graph-l1 recorded`);

    log('\n[A5] Roll back the L1 graph migration   (state: only the L1 graph migration applied, from A4)');
    const s5 = npm('db:rollback', db.url);
    const snap5 = await snapshot(db.url);
    log(`    tables: ${show(tablesOf(snap5))}; enums: ${show(Object.keys(snap5.enums))}; pgmigrations: ${show(await migrations(db.url))}`);
    record('A5', 'Roll back the L1 graph migration',
      s5 === 0 && tablesOf(snap5).filter((t) => L1.includes(t)).length === 0 && L1_ENUMS.every((e) => !(e in snap5.enums)),
      `exit ${s5}; L1 tables and enums gone`);
  } finally { await db.drop(); }

  db = await throwaway();
  try {
    log(`\n[A6] Roll back both migrations leaves an empty schema   (fresh throwaway ${db.name})`);
    const m0 = npm('db:migrate', db.url);
    const r1 = npm('db:rollback', db.url);
    const r2 = npm('db:rollback', db.url);
    const s = await snapshot(db.url);
    log(`    tables: ${show(tablesOf(s))}; enums: ${show(Object.keys(s.enums))}; extensions: ${show(s.extensions)}`);
    record('A6', 'Roll back both migrations leaves an empty schema',
      m0 === 0 && r1 === 0 && r2 === 0 && s.columns.length === 0 && Object.keys(s.enums).length === 0 && s.extensions.includes('vector'),
      `rollbacks exit ${r1}/${r2}; no table, no enum; vector kept: ${s.extensions.includes('vector')}`);
  } finally { await db.drop(); }

  db = await throwaway();
  try {
    log(`\n[A7] Apply, roll back and apply again   (fresh throwaway ${db.name})`);
    const e1 = npm('db:migrate', db.url);
    const first = await snapshot(db.url);
    const e2 = npm('db:rollback', db.url);
    const e3 = npm('db:migrate', db.url);
    const second = await snapshot(db.url);
    const identical = JSON.stringify(first) === JSON.stringify(second);
    const c1 = contractMismatches(second, L1_CONTRACT);
    const c2 = contractMismatches(second, HISTORY_CONTRACT);
    log(`    second == first: ${identical}; L1 contract mismatches: ${show(c1.bad)}; history contract mismatches: ${show(c2.bad)}`);
    record('A7', 'Apply, roll back and apply again', e1 === 0 && e2 === 0 && e3 === 0 && identical && !c1.bad.length && !c2.bad.length,
      `exits ${e1}/${e2}/${e3}; identical ${identical}; both contracts hold`);
  } finally { await db.drop(); }
}

// ---------------------------------------------------------------------------------------------
// Part B — table scenarios, real SQL on the shared DB, each scenario in BEGIN … ROLLBACK
// ---------------------------------------------------------------------------------------------
async function partB() {
  log('\n=== Part B — table scenarios (shared DB, BEGIN … ROLLBACK per scenario) ===');
  const c = new Client({ connectionString: SHARED });
  await c.connect();
  let n = 0;
  const q = async (sql, params = []) => (await c.query(sql, params)).rows;
  // Runs a statement that must fail; savepoint keeps the scenario's transaction usable.
  const attempt = async (sql, params = []) => {
    await c.query('SAVEPOINT a');
    try {
      const r = await c.query(sql, params);
      await c.query('RELEASE SAVEPOINT a');
      log(`    > ${sql.replace(/\s+/g, ' ')}\n      ACCEPTED (rowCount ${r.rowCount})`);
      return { ok: true };
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT a');
      log(`    > ${sql.replace(/\s+/g, ' ')}\n      REJECTED ${e.code}${e.constraint ? ` [${e.constraint}]` : ''}: ${e.message}`);
      return { ok: false, code: e.code, constraint: e.constraint };
    }
  };
  const scenario = async (name, fn) => {
    n += 1;
    const id = `B${n}`;
    log(`\n[${id}] ${name}`);
    await c.query('BEGIN');
    try { await fn(id, name); } finally { await c.query('ROLLBACK'); }
  };
  const project = async () => (await q(`INSERT INTO project (name, root_path, language) VALUES ($1, '/demo', 'php') RETURNING id`, [`demo-${randomUUID()}`]))[0].id;
  const file = async (p) => (await q(`INSERT INTO file (project_id, path, kind) VALUES ($1, $2, 'source') RETURNING id`, [p, `app/${randomUUID()}.php`]))[0].id;
  const commit = async (p, sha = randomUUID().replaceAll('-', '')) => (await q(`INSERT INTO commit (project_id, sha) VALUES ($1, $2) RETURNING id`, [p, sha]))[0].id;
  const claim = async (p, layer = 'L1', type = 'FACT', prov = null) =>
    (await q(`INSERT INTO claim (project_id, subject, predicate, layer, type, provenance) VALUES ($1, 's', 'p', $2, $3, $4) RETURNING id`, [p, layer, type, prov]))[0].id;
  const count = async (t, col, v) => Number((await q(`SELECT count(*) FROM ${t} WHERE ${col} = $1`, [v]))[0].count);
  const PROV = JSON.stringify({ model: 'demo-model', promptHash: 'sha256:0', inputEvidence: [], at: '2026-09-28T00:00:00Z' });

  await scenario('Defaults apply on a minimal claim, query log and cache entry', async (id, name) => {
    const p = await project();
    const [cl] = await q(`INSERT INTO claim (project_id, subject, predicate, layer, type) VALUES ($1,'Order','has','L1','FACT') RETURNING id, status, created_at, updated_at`, [p]);
    const [ql] = await q(`INSERT INTO query_log (project_id, question, capability) VALUES ($1,'Why?','explain') RETURNING id, cache_hit, created_at`, [p]);
    const [ce] = await q(`INSERT INTO cache_entry (project_id, question_normalized) VALUES ($1,'why') RETURNING id, hit_count, created_at`, [p]);
    log(`    claim: ${JSON.stringify(cl)}\n    query_log: ${JSON.stringify(ql)}\n    cache_entry: ${JSON.stringify(ce)}`);
    record(id, name, !!cl.id && cl.status === 'current' && !!cl.created_at && !!cl.updated_at && !!ql.id && ql.cache_hit === false
      && !!ql.created_at && !!ce.id && ce.hit_count === 0 && !!ce.created_at, 'generated ids, status current, cache_hit false, hit_count 0, timestamps set');
  });

  await scenario('Duplicate sha within a project is rejected', async (id, name) => {
    const p = await project();
    await commit(p, 'a1b2c3');
    const r = await attempt(`INSERT INTO commit (project_id, sha) VALUES ($1, 'a1b2c3')`, [p]);
    record(id, name, !r.ok && r.code === '23505', `${r.code} ${r.constraint}`);
  });
  await scenario('Same sha in two projects is accepted', async (id, name) => {
    await commit(await project(), 'a1b2c3');
    const r = await attempt(`INSERT INTO commit (project_id, sha) VALUES ($1, 'a1b2c3')`, [await project()]);
    record(id, name, r.ok, 'second insert accepted');
  });
  await scenario('Deleting a project deletes its commits', async (id, name) => {
    const p = await project();
    await commit(p); await commit(p);
    log(`    commits before: ${await count('commit', 'project_id', p)}`);
    await q('DELETE FROM project WHERE id = $1', [p]);
    const after = await count('commit', 'project_id', p);
    log(`    DELETE project → commits after: ${after}`);
    record(id, name, after === 0, `commits after delete: ${after}`);
  });

  await scenario('Duplicate file and commit pair is rejected', async (id, name) => {
    const p = await project(); const f = await file(p); const k = await commit(p);
    await q('INSERT INTO file_commit (file_id, commit_id) VALUES ($1, $2)', [f, k]);
    const r = await attempt('INSERT INTO file_commit (file_id, commit_id) VALUES ($1, $2)', [f, k]);
    record(id, name, !r.ok && r.code === '23505' && r.constraint === 'file_commit_pkey', `${r.code} ${r.constraint}`);
  });
  await scenario('File-commit pointing to a missing commit is rejected', async (id, name) => {
    const f = await file(await project());
    const r = await attempt('INSERT INTO file_commit (file_id, commit_id) VALUES ($1, $2)', [f, randomUUID()]);
    record(id, name, !r.ok && r.code === '23503' && r.constraint === 'file_commit_commit_id_fkey', `${r.code} ${r.constraint}`);
  });
  await scenario('File-commit pointing to a missing file is rejected', async (id, name) => {
    const k = await commit(await project());
    const r = await attempt('INSERT INTO file_commit (file_id, commit_id) VALUES ($1, $2)', [randomUUID(), k]);
    record(id, name, !r.ok && r.code === '23503' && r.constraint === 'file_commit_file_id_fkey', `${r.code} ${r.constraint}`);
  });
  await scenario('Deleting a file deletes its file-commit rows', async (id, name) => {
    const p = await project(); const f = await file(p); const k = await commit(p);
    await q('INSERT INTO file_commit (file_id, commit_id) VALUES ($1, $2)', [f, k]);
    await q('DELETE FROM file WHERE id = $1', [f]);
    const rows = await count('file_commit', 'file_id', f); const commits = await count('commit', 'id', k);
    log(`    DELETE file → file_commit rows: ${rows}; commit still there: ${commits}`);
    record(id, name, rows === 0 && commits === 1, `file_commit ${rows}, commit ${commits}`);
  });
  await scenario('Deleting a commit deletes its file-commit rows', async (id, name) => {
    const p = await project(); const f = await file(p); const k = await commit(p);
    await q('INSERT INTO file_commit (file_id, commit_id) VALUES ($1, $2)', [f, k]);
    await q('DELETE FROM commit WHERE id = $1', [k]);
    const rows = await count('file_commit', 'commit_id', k); const files = await count('file', 'id', f);
    log(`    DELETE commit → file_commit rows: ${rows}; file still there: ${files}`);
    record(id, name, rows === 0 && files === 1, `file_commit ${rows}, file ${files}`);
  });

  await scenario('Fact from the inferred layer is rejected', async (id, name) => {
    const p = await project();
    const r = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, provenance) VALUES ($1,'s','p','L2','FACT',$2)`, [p, PROV]);
    record(id, name, !r.ok && r.code === '23514' && r.constraint === 'fact_only_from_l1', `${r.code} ${r.constraint}`);
  });
  await scenario('Inferred claim without provenance is rejected', async (id, name) => {
    const p = await project();
    const r = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, provenance) VALUES ($1,'s','p','L2','INFERENCE',NULL)`, [p]);
    record(id, name, !r.ok && r.code === '23514' && r.constraint === 'l2_requires_provenance', `${r.code} ${r.constraint}`);
  });
  await scenario('Fact from the observed layer without provenance is accepted', async (id, name) => {
    const r = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, provenance) VALUES ($1,'s','p','L1','FACT',NULL)`, [await project()]);
    record(id, name, r.ok, 'accepted');
  });
  await scenario('Inference from the inferred layer with provenance is accepted', async (id, name) => {
    const r = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, provenance) VALUES ($1,'s','p','L2','INFERENCE',$2)`, [await project(), PROV]);
    record(id, name, r.ok, 'accepted');
  });
  await scenario('Invalid claim type is rejected', async (id, name) => {
    const r = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type) VALUES ($1,'s','p','L1','GUESS')`, [await project()]);
    record(id, name, !r.ok && r.code === '22P02', `${r.code}`);
  });
  await scenario('Confidence at the bounds is accepted', async (id, name) => {
    const p = await project();
    const r0 = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, confidence) VALUES ($1,'s','p','L1','FACT',0)`, [p]);
    const r1 = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, confidence) VALUES ($1,'s','p','L1','FACT',1)`, [p]);
    record(id, name, r0.ok && r1.ok, 'both accepted');
  });
  await scenario('Confidence outside 0..1 is rejected', async (id, name) => {
    const r = await attempt(`INSERT INTO claim (project_id, subject, predicate, layer, type, confidence) VALUES ($1,'s','p','L1','FACT',1.5)`, [await project()]);
    record(id, name, !r.ok && r.code === '23514' && r.constraint === 'claim_confidence_range', `${r.code} ${r.constraint}`);
  });
  await scenario('Deleting a project deletes its claims', async (id, name) => {
    const p = await project();
    await claim(p); await claim(p, 'L2', 'INFERENCE', PROV);
    await q('DELETE FROM project WHERE id = $1', [p]);
    const after = await count('claim', 'project_id', p);
    log(`    DELETE project → claims after: ${after}`);
    record(id, name, after === 0, `claims after delete: ${after}`);
  });

  const evidenceSql = `INSERT INTO evidence (claim_id, file_id, start_line, end_line, verification) VALUES ($1, $2, $3, $4, $5)`;
  await scenario('Invalid evidence span is rejected', async (id, name) => {
    const p = await project();
    const r = await attempt(evidenceSql, [await claim(p), await file(p), 10, 9, 'cited']);
    record(id, name, !r.ok && r.code === '23514' && r.constraint === 'evidence_span_valid', `${r.code} ${r.constraint}`);
  });
  await scenario('Non-positive evidence start line is rejected', async (id, name) => {
    const p = await project();
    const r = await attempt(evidenceSql, [await claim(p), await file(p), 0, 5, 'cited']);
    record(id, name, !r.ok && r.code === '23514' && r.constraint === 'evidence_start_line_positive', `${r.code} ${r.constraint}`);
  });
  await scenario('Evidence without verification is rejected', async (id, name) => {
    const p = await project();
    const r = await attempt(evidenceSql, [await claim(p), await file(p), 1, 5, null]);
    record(id, name, !r.ok && r.code === '23502', `${r.code}`);
  });
  await scenario('Deleting a claim deletes its evidence', async (id, name) => {
    const p = await project(); const cl = await claim(p); const f = await file(p);
    await q(evidenceSql, [cl, f, 1, 5, 'cited']); await q(evidenceSql, [cl, f, 7, 9, 'entailed']);
    await q('DELETE FROM claim WHERE id = $1', [cl]);
    const after = await count('evidence', 'claim_id', cl);
    log(`    DELETE claim → evidence after: ${after}`);
    record(id, name, after === 0, `evidence after delete: ${after}`);
  });
  await scenario('Deleting a cited file deletes the evidence but keeps the claim', async (id, name) => {
    const p = await project(); const cl = await claim(p); const f = await file(p);
    await q(evidenceSql, [cl, f, 1, 5, 'cited']);
    await q('DELETE FROM file WHERE id = $1', [f]);
    const ev = await count('evidence', 'file_id', f); const cls = await count('claim', 'id', cl);
    log(`    DELETE file → evidence: ${ev}; claim still there: ${cls}`);
    record(id, name, ev === 0 && cls === 1, `evidence ${ev}, claim ${cls}`);
  });

  const logSql = `INSERT INTO query_log (project_id, question, capability) VALUES ($1, 'How is the price computed?', $2)`;
  await scenario('Planned drift capability is accepted', async (id, name) => {
    const r = await attempt(logSql, [await project(), 'drift']);
    record(id, name, r.ok, 'accepted');
  });
  await scenario('Unknown capability is rejected', async (id, name) => {
    const r = await attempt(logSql, [await project(), 'summarise']);
    record(id, name, !r.ok && r.code === '22P02', `${r.code}`);
  });
  await scenario('Deleting a project deletes its query log', async (id, name) => {
    const p = await project();
    await q(logSql, [p, 'explain']); await q(logSql, [p, 'impact']);
    await q('DELETE FROM project WHERE id = $1', [p]);
    const after = await count('query_log', 'project_id', p);
    log(`    DELETE project → query_log after: ${after}`);
    record(id, name, after === 0, `query_log after delete: ${after}`);
  });

  await scenario('Cache entry without a normalized question is rejected', async (id, name) => {
    const r = await attempt('INSERT INTO cache_entry (project_id, question_normalized) VALUES ($1, NULL)', [await project()]);
    record(id, name, !r.ok && r.code === '23502', `${r.code}`);
  });
  await scenario('Deleting a project deletes its cache entries', async (id, name) => {
    const p = await project();
    await q(`INSERT INTO cache_entry (project_id, question_normalized) VALUES ($1, 'a'), ($1, 'b')`, [p]);
    await q('DELETE FROM project WHERE id = $1', [p]);
    const after = await count('cache_entry', 'project_id', p);
    log(`    DELETE project → cache_entry after: ${after}`);
    record(id, name, after === 0, `cache_entry after delete: ${after}`);
  });

  await c.end();
}

async function state() {
  return withClient(SHARED, async (c) => {
    const counts = {};
    for (const t of ALL) counts[t] = Number((await c.query(`SELECT count(*) FROM "${t}"`)).rows[0].count);
    return {
      migrations: (await c.query('SELECT name FROM pgmigrations ORDER BY id')).rows.map((r) => r.name),
      counts,
      databases: (await c.query('SELECT datname FROM pg_database ORDER BY 1')).rows.map((r) => r.datname),
    };
  });
}

const before = await state();
log(`STATE BEFORE: ${JSON.stringify(before)}`);
await partA();
await partB();
const after = await state();
log(`\nSTATE AFTER: ${JSON.stringify(after)}`);
log(`STATE RESTORED (identical): ${JSON.stringify(before) === JSON.stringify(after)}`);
const failed = results.filter((r) => !r.ok);
log(`\nSUMMARY: ${results.length} scenarios exercised, ${results.length - failed.length} match the spec, ${failed.length} do not`);
for (const f of failed) log(`  FAILED ${f.id} ${f.scenario}: ${f.detail}`);
process.exit(failed.length ? 1 : 0);
