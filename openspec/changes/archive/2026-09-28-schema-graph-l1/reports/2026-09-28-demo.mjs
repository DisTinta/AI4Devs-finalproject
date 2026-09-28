// Demonstration of openspec change schema-graph-l1 against the running system.
// Run from the repo root: node <this file>. Needs DATABASE_URL (shared DB, already migrated).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(`${process.cwd()}/package.json`);
const { Client } = require('pg');
const SHARED = process.env.DATABASE_URL;
const log = (...a) => console.log(...a);

function npm(script, url) {
  const env = { ...process.env };
  if (url === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = url;
  const r = spawnSync(`npm run --silent ${script}`, { env, shell: true, encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`.trim().split('\n').filter((l) => l.trim()).map((l) => `      | ${l}`).join('\n');
  log(`    $ ${url === undefined ? '(DATABASE_URL unset) ' : 'DATABASE_URL=<throwaway> '}npm run ${script}\n${out}\n      exit=${r.status}`);
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

const tables = (s) => [...new Set(s.columns.map((c) => c.t))].sort().join(', ') || '(none)';

// Column contract parsed live from the spec's markdown table (not the test's transcription).
function contractFromSpec() {
  const md = readFileSync('openspec/changes/schema-graph-l1/specs/graph-schema/spec.md', 'utf8');
  const rows = md.split('\n').filter((l) => /^\| `(project|file|symbol|edge)` \|/.test(l));
  return rows.map((l) => {
    const [t, col, type, nul, dflt] = l.split('|').slice(1, 6).map((x) => x.trim().replaceAll('`', ''));
    const e = type.match(/^enum \((.*)\)$/);
    return { t, col, type, enumLabels: e ? e[1].split(',').map((x) => x.trim()) : null, nn: nul === 'NOT NULL',
      dflt: dflt === '—' ? null : dflt === 'generated' ? 'gen_random_uuid()' : dflt };
  });
}
const TYPE_ALIASES = { timestamptz: 'timestamp with time zone' };

function checkContract(s) {
  const expected = contractFromSpec();
  const problems = [];
  const actualKeys = new Set(s.columns.map((c) => `${c.t}.${c.col}`));
  for (const x of expected) {
    const a = s.columns.find((c) => c.t === x.t && c.col === x.col);
    if (!a) { problems.push(`missing ${x.t}.${x.col}`); continue; }
    if (x.enumLabels) {
      const labels = s.enums[a.type];
      if (JSON.stringify(labels) !== JSON.stringify(x.enumLabels)) problems.push(`${x.t}.${x.col} enum ${a.type}=${labels}`);
    } else if ((TYPE_ALIASES[x.type] ?? x.type) !== a.type) problems.push(`${x.t}.${x.col} type ${a.type} != ${x.type}`);
    if (a.nn !== x.nn) problems.push(`${x.t}.${x.col} nullability`);
    if (a.dflt !== x.dflt) problems.push(`${x.t}.${x.col} default ${a.dflt} != ${x.dflt}`);
    actualKeys.delete(`${x.t}.${x.col}`);
  }
  for (const extra of actualKeys) problems.push(`extra column ${extra}`);
  return { expected: expected.length, actual: s.columns.length, problems };
}

async function lifecycle() {
  log('\n== A. Lifecycle (real npm scripts, throwaway database) ==');
  const name = `codemind_demo_${randomUUID().replaceAll('-', '')}`;
  await withClient(SHARED, (c) => c.query(`CREATE DATABASE "${name}"`));
  const u = new URL(SHARED); u.pathname = `/${name}`; const url = u.toString();
  log(`  created throwaway database ${name}`);
  try {
    log('\n[A1] Migrate an empty database');
    log(`    tables before: ${tables(await snapshot(url))}`);
    npm('db:migrate', url);
    const first = await snapshot(url);
    log(`    tables after: ${tables(first)}`);

    log('\n[A2] Migrated schema matches the column contract (parsed from spec.md)');
    const r = checkContract(first);
    log(`    spec rows: ${r.expected} · actual columns: ${r.actual} · mismatches: ${r.problems.length ? r.problems.join('; ') : 'none'}`);
    for (const c of first.columns) log(`      ${c.t}.${c.col}: ${c.type}${c.nn ? ' NOT NULL' : ''}${c.dflt ? ` DEFAULT ${c.dflt}` : ''}`);
    log(`    enums: ${JSON.stringify(first.enums)}`);
    log(`    constraints (${first.constraints.length}):`);
    for (const k of first.constraints) log(`      ${k.t}.${k.conname}: ${k.def}`);

    log('\n[A3] Migrate an up-to-date database');
    npm('db:migrate', url);
    log(`    schema unchanged: ${JSON.stringify(await snapshot(url)) === JSON.stringify(first)}`);

    log('\n[A4] Roll back the L1 graph migration');
    npm('db:rollback', url);
    const rolled = await snapshot(url);
    log(`    tables: ${tables(rolled)} · enums: ${JSON.stringify(rolled.enums)} · extensions: ${JSON.stringify(rolled.extensions)}`);

    log('\n[A5] Apply, roll back and apply again');
    npm('db:migrate', url);
    const s1 = await snapshot(url);
    npm('db:rollback', url);
    npm('db:migrate', url);
    const s2 = await snapshot(url);
    const r2 = checkContract(s2);
    log(`    second == first: ${JSON.stringify(s2) === JSON.stringify(s1)} · contract mismatches: ${r2.problems.length || 'none'}`);
  } finally {
    await withClient(SHARED, (c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    log(`\n  dropped throwaway database ${name}`);
  }

  log('\n[A6] DATABASE_URL is missing on migrate');
  npm('db:migrate', undefined);
  log('\n[A7] DATABASE_URL is missing on rollback');
  npm('db:rollback', undefined);
}

// Each scenario runs in its own transaction on the shared DB and is rolled back.
async function scenario(label, fn) {
  const c = new Client({ connectionString: SHARED });
  await c.connect();
  log(`\n[${label}]`);
  const run = async (sql, params = []) => {
    const shown = sql.replace(/\s+/g, ' ').trim();
    try {
      const r = await c.query(sql, params);
      log(`    ${shown}\n      -> OK${r.rows.length ? ` ${JSON.stringify(r.rows)}` : ` (${r.rowCount} row)`}`);
      return r.rows;
    } catch (e) {
      log(`    ${shown}\n      -> REJECTED sqlstate=${e.code}${e.constraint ? ` constraint=${e.constraint}` : ''}: ${e.message}`);
      return null;
    }
  };
  try {
    await c.query('BEGIN');
    await fn(run);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end();
  }
}

const u = (p) => `${p}-${randomUUID().slice(0, 8)}`;
const P = (run, name = u('demo')) =>
  run(`INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/demo', 'typescript') RETURNING id`, [name]).then((r) => r[0].id);
const F = (run, pid, path = u('src/a.ts')) =>
  run(`INSERT INTO file (project_id, path, kind) VALUES ($1, $2, 'source') RETURNING id`, [pid, path]).then((r) => r[0].id);
const S = (run, fid, a = 1, b = 5) =>
  run(`INSERT INTO symbol (file_id, name, kind, start_line, end_line) VALUES ($1, 'handle', 'method', $2, $3) RETURNING id`, [fid, a, b]).then((r) => r?.[0]?.id);
const E = (run, cols, vals) =>
  run(`INSERT INTO edge (${cols}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals).then((r) => r?.[0]?.id);

async function constraints() {
  log('\n== B. Tables and constraints (shared DB, each scenario in BEGIN/ROLLBACK) ==');
  const base = 'project_id, source_symbol_id, target_symbol_id, kind, resolution, extractor';

  await scenario('B1 Defaults apply on a minimal insert', async (run) => {
    const r = await run(`INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/demo', 'php') RETURNING id, is_sample, node_count, edge_count, created_at`, [u('demo')]);
    await run(`INSERT INTO file (project_id, path, kind) VALUES ($1, 'README.md', 'doc') RETURNING id, redacted`, [r[0].id]);
  });
  await scenario('B2 Duplicate project name is rejected', async (run) => {
    const n = u('dup'); await P(run, n); await P(run, n).catch(() => {});
  });
  await scenario('B3 Unknown language is rejected', async (run) => {
    await run(`INSERT INTO project (name, root_path, language) VALUES ($1, '/repos/x', 'python')`, [u('demo')]);
  });
  await scenario('B4 Duplicate path within a project is rejected', async (run) => {
    const p = await P(run); await F(run, p, 'src/dup.ts'); await F(run, p, 'src/dup.ts').catch(() => {});
  });
  await scenario('B5 Same path in two projects is accepted', async (run) => {
    await F(run, await P(run), 'src/shared.ts'); await F(run, await P(run), 'src/shared.ts');
  });
  await scenario('B6 Deleting a project deletes its files', async (run) => {
    const p = await P(run); const f = await F(run, p);
    await run('DELETE FROM project WHERE id = $1', [p]);
    await run('SELECT count(*) AS files_left FROM file WHERE id = $1', [f]);
  });
  await scenario('B7 Invalid span is rejected', async (run) => { await S(run, await F(run, await P(run)), 10, 9); });
  await scenario('B8 Non-positive start line is rejected', async (run) => { await S(run, await F(run, await P(run)), 0, 3); });
  await scenario('B9 Deleting a file deletes its symbols', async (run) => {
    const f = await F(run, await P(run)); const s = await S(run, f);
    await run('DELETE FROM file WHERE id = $1', [f]);
    await run('SELECT count(*) AS symbols_left FROM symbol WHERE id = $1', [s]);
  });

  const graph = async (run) => { const p = await P(run); const f = await F(run, p); return { p, f, a: await S(run, f, 1, 5), b: await S(run, f, 10, 20) }; };
  await scenario('B10 Edge without resolution is rejected', async (run) => {
    const g = await graph(run); await E(run, base, [g.p, g.a, g.b, 'calls', null, 'ts-analyzer']);
  });
  await scenario('B11 Empty extractor is rejected', async (run) => {
    const g = await graph(run); await E(run, base, [g.p, g.a, g.b, 'calls', 'exact', '']);
  });
  await scenario('B12 Endpoint with both a symbol and a file is rejected', async (run) => {
    const g = await graph(run);
    await E(run, 'project_id, source_symbol_id, source_file_id, target_symbol_id, kind, resolution, extractor', [g.p, g.a, g.f, g.b, 'calls', 'exact', 'ts-analyzer']);
  });
  await scenario('B13 Endpoint with neither a symbol nor a file is rejected', async (run) => {
    const g = await graph(run);
    await E(run, 'project_id, source_symbol_id, kind, resolution, extractor', [g.p, g.a, 'calls', 'exact', 'ts-analyzer']);
  });
  await scenario('B14 Endpoint pointing to a missing row is rejected', async (run) => {
    const g = await graph(run); await E(run, base, [g.p, randomUUID(), g.b, 'calls', 'exact', 'ts-analyzer']);
  });
  await scenario('B15 File-to-symbol edge is accepted', async (run) => {
    const g = await graph(run);
    await E(run, 'project_id, source_file_id, target_symbol_id, kind, resolution, extractor', [g.p, g.f, g.b, 'describes', 'heuristic', 'docs-linker']);
  });
  await scenario('B16 Weight at the bounds is accepted', async (run) => {
    const g = await graph(run); const cols = 'project_id, source_file_id, target_symbol_id, kind, resolution, extractor, weight';
    await E(run, cols, [g.p, g.f, g.a, 'co_changed', 'exact', 'git-history', 0]);
    await E(run, cols, [g.p, g.f, g.b, 'co_changed', 'exact', 'git-history', 1]);
  });
  await scenario('B17 Weight outside 0..1 is rejected', async (run) => {
    const g = await graph(run); await E(run, `${base}, weight`, [g.p, g.a, g.b, 'co_changed', 'exact', 'git-history', 1.5]);
  });
  await scenario('B18 Deleting a symbol deletes its edges', async (run) => {
    const g = await graph(run); const e = await E(run, base, [g.p, g.a, g.b, 'calls', 'exact', 'ts-analyzer']);
    await run('DELETE FROM symbol WHERE id = $1', [g.b]);
    await run('SELECT count(*) AS edges_left FROM edge WHERE id = $1', [e]);
  });
  await scenario('B19 Deleting a file deletes its edges', async (run) => {
    const g = await graph(run); const f2 = await F(run, g.p);
    const e = await E(run, 'project_id, source_file_id, target_file_id, kind, resolution, extractor', [g.p, f2, g.f, 'imports', 'exact', 'ts-analyzer']);
    await run('DELETE FROM file WHERE id = $1', [f2]);
    await run('SELECT count(*) AS edges_left FROM edge WHERE id = $1', [e]);
  });
  await scenario('B20 Deleting a project deletes its edges even when the endpoints survive', async (run) => {
    const a = await P(run); const b = await P(run); const b1 = await F(run, b); const b2 = await F(run, b);
    const e = await E(run, 'project_id, source_file_id, target_file_id, kind, resolution, extractor', [a, b1, b2, 'imports', 'exact', 'ts-analyzer']);
    await run('DELETE FROM project WHERE id = $1', [a]);
    await run('SELECT (SELECT count(*) FROM edge WHERE id = $1) AS edges_left, (SELECT count(*) FROM file WHERE id IN ($2, $3)) AS project_b_files_left', [e, b1, b2]);
  });
}

await lifecycle();
await constraints();
