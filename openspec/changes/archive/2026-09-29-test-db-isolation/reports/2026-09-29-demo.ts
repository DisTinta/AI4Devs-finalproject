// show-spec-working driver for openspec change test-db-isolation (DIS-22). It exercises the harness
// through its real interface (child Vitest runs, the public helpers, tsc), independently of the
// repo's own specs. The harness imports Vitest, so the driver runs inside Vitest through its own
// config (the file is not a *.spec/*.test, so the repo's `npx vitest run` never collects it).
// Run from the repository root with a migrated database:
//   DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npx vitest run \
//     --config openspec/changes/archive/2026-09-29-test-db-isolation/reports/2026-09-29-demo.vitest.config.ts
// The transcript is written next to this file as 2026-09-29-demo-output.txt.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../../../../../packages/adapters/store-postgres/src/migrate';
import { Client } from 'pg';
import { beginTestTransaction, connect, databaseUrl, endTestTransaction } from '../../../../../tests/integration/helpers/db';
import { createThrowawayDatabase } from '../../../../../tests/integration/store/schema-snapshot';
import { createEdge, createFile, createProject, createSymbol } from '../../../../../tests/integration/helpers/factories';

const repoRoot = process.cwd();
const helpersDir = resolve(repoRoot, 'tests/integration/helpers').replace(/\\/g, '/');
const work = mkdtempSync(join(tmpdir(), 'test-db-isolation-demo-'));
const results: { scenario: string; ok: boolean; observed: string }[] = [];
const transcript: string[] = [];

function log(line: string): void {
  transcript.push(line);
}

function check(scenario: string, ok: boolean, observed: string): void {
  results.push({ scenario, ok, observed });
  log(`${ok ? 'PASS' : 'FAIL'}  ${scenario}\n      observed: ${observed}`);
}

function run(command: string, env: Record<string, string | undefined>): { status: number | null; out: string } {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  delete childEnv.FORCE_COLOR;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const result = spawnSync(command, { cwd: repoRoot, env: childEnv, shell: true, encoding: 'utf8', timeout: 180_000 });
  return { status: result.status, out: (result.stdout ?? '') + (result.stderr ?? '') };
}

function summary(out: string): string {
  return out
    .split('\n')
    .filter((line) => /Test Files|Tests {2}|WARNING: DATABASE_URL|must be set in CI|committed or ended early/.test(line))
    .map((line) => line.trim())
    .filter((line, index, all) => all.indexOf(line) === index)
    .join(' | ');
}

async function countElsewhere(table: string, id: string): Promise<number> {
  const other = await connect();
  try {
    const { rows } = await other.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE id = $1`, [id]);
    return rows[0].n;
  } finally {
    await other.end();
  }
}

const ENDED_EARLY = 'Harness transaction was committed or ended early';

async function endError(transaction: Awaited<ReturnType<typeof beginTestTransaction>>): Promise<string | null> {
  try {
    await endTestTransaction(transaction);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

async function main(): Promise<void> {
  // ---- Requirement: Single database availability gate --------------------------------------------
  const pair =
    'npx vitest run tests/integration/helpers/harness.spec.ts tests/integration/store/graph-schema-constraints.spec.ts';
  log(`\n$ env -u DATABASE_URL -u CI ${pair}`);
  const local = run(pair, { DATABASE_URL: undefined, CI: undefined });
  check(
    'Database tests are skipped locally without a database',
    local.status === 0 &&
      local.out.includes('WARNING: DATABASE_URL is not set') &&
      /Test Files\s+2 skipped \(2\)/.test(local.out) &&
      !/\d+ (passed|failed)/.test(local.out),
    `exit ${local.status}; ${summary(local.out)}`,
  );

  log(`\n$ env -u DATABASE_URL CI=true ${pair}`);
  const ci = run(pair, { DATABASE_URL: undefined, CI: 'true' });
  check(
    'Database tests fail in CI without a database',
    ci.status !== 0 && ci.out.includes('DATABASE_URL must be set in CI'),
    `exit ${ci.status}; ${summary(ci.out)}`,
  );

  log('\n$ npx vitest run tests/integration/helpers/harness.spec.ts   (DATABASE_URL set)');
  const configured = run('npx vitest run tests/integration/helpers/harness.spec.ts', {});
  check(
    'Database tests run when a database is configured',
    configured.status === 0 && /Tests\s+\d+ passed \(\d+\)/.test(configured.out) && !/skipped/.test(configured.out),
    `exit ${configured.status}; ${summary(configured.out)}`,
  );

  // ---- Requirement: One reverted transaction per test (through useTransactionPerTest) -----------
  const observedFile = join(work, 'observed.json').replace(/\\/g, '/');
  writeFileSync(
    join(work, 'hook.spec.ts'),
    `import { writeFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, it } from 'vitest';
import { connect, describeWithDatabase, useTransactionPerTest } from '${helpersDir}/db';
import { createProject } from '${helpersDir}/factories';

const seen: Record<string, unknown> = {};
describeWithDatabase('demo: useTransactionPerTest', () => {
  const db = useTransactionPerTest();
  beforeAll(() => {
    try {
      db();
      seen.outsideTest = 'no error';
    } catch (error) {
      seen.outsideTest = (error as Error).message;
    }
  });
  it('reads back', async () => {
    const project = await createProject(db(), { root_path: '/repos/demo' });
    const { rows } = await db().query('SELECT id, root_path FROM project WHERE id = $1', [project.id]);
    seen.readBack = { written: project.id, read: rows };
  });
  it('invisible elsewhere', async () => {
    const project = await createProject(db());
    const other = await connect();
    const { rows } = await other.query('SELECT count(*)::int AS n FROM project WHERE id = $1', [project.id]);
    await other.end();
    seen.invisible = { id: project.id, countElsewhere: rows[0].n };
  });
  it('writes, then ends', async () => {
    seen.writtenThenEnded = (await createProject(db())).id;
  });
  describe('nested', () => {
    let seededId = '';
    beforeEach(async () => {
      seededId = (await createProject(db())).id;
    });
    it('sees the nested seed', async () => {
      const { rows } = await db().query('SELECT id FROM project WHERE id = $1', [seededId]);
      const other = await connect();
      const elsewhere = await other.query('SELECT count(*)::int AS n FROM project WHERE id = $1', [seededId]);
      await other.end();
      seen.nested = { id: seededId, readInTest: rows.length, countElsewhere: elsewhere.rows[0].n };
    });
  });
  it('dump', () => writeFileSync('${observedFile}', JSON.stringify(seen)));
});
`,
  );
  log('\n$ npx vitest run --root <tmp>   (hook.spec.ts: uses useTransactionPerTest + createProject)');
  const hook = run(`npx vitest run --root "${work}"`, {});
  log(`      child: exit ${hook.status}; ${summary(hook.out)}`);
  const seen = JSON.parse(readFileSync(join(work, 'observed.json'), 'utf8')) as {
    outsideTest: string;
    nested: { id: string; readInTest: number; countElsewhere: number };
    readBack: { written: string; read: { id: string; root_path: string }[] };
    invisible: { id: string; countElsewhere: number };
    writtenThenEnded: string;
  };
  const expectedMigrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.up.sql'))
    .map((name) => name.replace(/\.up\.sql$/, ''))
    .sort();
  const fresh = await createThrowawayDatabase(databaseUrl as string);
  const freshWork = mkdtempSync(join(tmpdir(), 'test-db-isolation-fresh-'));
  try {
    const probe = async (): Promise<string | null> => {
      const client = new Client({ connectionString: fresh.url });
      await client.connect();
      const { rows } = await client.query<{ table: string | null }>("SELECT to_regclass('pgmigrations')::text AS table");
      await client.end();
      return rows[0].table;
    };
    const tableBefore = await probe();
    const freshObserved = join(freshWork, 'observed.json').replace(/\\/g, '/');
    writeFileSync(
      join(freshWork, 'fresh.spec.ts'),
      `import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { describeWithDatabase, useTransactionPerTest } from '${helpersDir}/db';
describeWithDatabase('demo: fresh database', () => {
  const db = useTransactionPerTest();
  it('first test', async () => {
    const { rows } = await db().query('SELECT name FROM pgmigrations ORDER BY name');
    writeFileSync('${freshObserved}', JSON.stringify(rows.map((row) => row.name)));
  });
});
`,
    );
    log('\n$ DATABASE_URL=<fresh throwaway db> npx vitest run --root <tmp>   (fresh.spec.ts: no migration step)');
    const freshRun = run(`npx vitest run --root "${freshWork}"`, { DATABASE_URL: fresh.url });
    log(`      child: exit ${freshRun.status}; ${summary(freshRun.out)}`);
    const seenByFirstTest = JSON.parse(readFileSync(join(freshWork, 'observed.json'), 'utf8')) as string[];
    check(
      'The shared database is migrated before the first test',
      tableBefore === null && JSON.stringify(seenByFirstTest) === JSON.stringify(expectedMigrations),
      `fresh db pgmigrations before the child = ${tableBefore}; seen by its first test = ${seenByFirstTest.join(', ')}; migration files = ${expectedMigrations.join(', ')}`,
    );
  } finally {
    rmSync(freshWork, { recursive: true, force: true });
    await fresh.drop();
  }
  check(
    'The test client is unavailable outside a running test',
    seen.outsideTest.startsWith('db() is only available while a harness test is running.') &&
      seen.outsideTest.includes('nested describe'),
    `db() in beforeAll → ${seen.outsideTest}`,
  );
  check(
    'Setup in a nested beforeEach runs inside the test transaction',
    seen.nested.readInTest === 1 && seen.nested.countElsewhere === 0,
    `seeded ${seen.nested.id}: rows read in the test = ${seen.nested.readInTest}; separate connection count(*) = ${seen.nested.countElsewhere}`,
  );
  check(
    'A test reads back the row it wrote',
    seen.readBack.read.length === 1 &&
      seen.readBack.read[0].id === seen.readBack.written &&
      seen.readBack.read[0].root_path === '/repos/demo',
    JSON.stringify(seen.readBack.read),
  );
  check(
    'Rows are invisible to other connections while the test runs',
    seen.invisible.countElsewhere === 0,
    `separate connection count(*) for ${seen.invisible.id} during the test = ${seen.invisible.countElsewhere}`,
  );
  const after = await Promise.all(
    [seen.readBack.written, seen.invisible.id, seen.writtenThenEnded].map((id) => countElsewhere('project', id)),
  );
  check(
    'Rows are gone after the test ends',
    after.every((n) => n === 0),
    `after the child run, count(*) per written id from this process = ${after.join(', ')}`,
  );

  const thrown = await beginTestTransaction();
  let thrownId = '';
  try {
    thrownId = (await createProject(thrown.client)).id;
    throw new Error('body failed');
  } catch {
    await endTestTransaction(thrown);
  }
  const thrownCount = await countElsewhere('project', thrownId);
  check('The transaction is reverted when the test body throws', thrownCount === 0, `count(*) for ${thrownId} = ${thrownCount}`);

  // ---- Requirement: A committed harness transaction fails the test -----------------------------
  writeFileSync(
    join(work, 'hook.spec.ts'),
    `import { it } from 'vitest';
import { describeWithDatabase, useTransactionPerTest } from '${helpersDir}/db';
describeWithDatabase('demo: code under test commits db()', () => {
  const db = useTransactionPerTest();
  it('commits without writing', async () => { await db().query('COMMIT'); });
});
`,
  );
  log('\n$ npx vitest run --root <tmp>   (hook.spec.ts: COMMIT on db())');
  const committed = run(`npx vitest run --root "${work}"`, {});
  check(
    'Committing the harness transaction is reported',
    committed.status !== 0 && committed.out.includes(ENDED_EARLY),
    `exit ${committed.status}; ${summary(committed.out)}`,
  );
  check(
    'A test that commits the test client fails',
    committed.status !== 0 && /Tests\s+1 failed \(1\)/.test(committed.out) && committed.out.includes(ENDED_EARLY),
    `same child run (COMMIT on db() under useTransactionPerTest): exit ${committed.status}; ${summary(committed.out)}`,
  );

  const rolledBack = await beginTestTransaction();
  await rolledBack.client.query('ROLLBACK');
  const rolledBackError = await endError(rolledBack);
  check('Rolling back the harness transaction is reported', rolledBackError?.includes(ENDED_EARLY) === true, String(rolledBackError));

  const reopened = await beginTestTransaction();
  await reopened.client.query('COMMIT');
  await reopened.client.query('BEGIN');
  await reopened.client.query('SELECT pg_current_xact_id()');
  const reopenedError = await endError(reopened);
  check('Committing and opening a new transaction is reported', reopenedError?.includes(ENDED_EARLY) === true, String(reopenedError));

  const untouched = await beginTestTransaction();
  const untouchedId = (await createProject(untouched.client)).id;
  const untouchedError = await endError(untouched);
  const untouchedCount = await countElsewhere('project', untouchedId);
  check(
    'An untouched harness transaction passes the check',
    untouchedError === null && untouchedCount === 0,
    `end error = ${untouchedError}; count(*) afterwards = ${untouchedCount}`,
  );

  const savepoint = await beginTestTransaction();
  const savepointId = (await createProject(savepoint.client)).id;
  await savepoint.client.query('SAVEPOINT inner_work');
  await savepoint.client.query('RELEASE SAVEPOINT inner_work');
  const savepointError = await endError(savepoint);
  const savepointCount = await countElsewhere('project', savepointId);
  check(
    'A savepoint inside the harness transaction passes the check',
    savepointError === null && savepointCount === 0,
    `end error = ${savepointError}; count(*) afterwards = ${savepointCount}`,
  );

  const calls: string[] = [];
  const brokenClient = {
    query: async (sql: string) => {
      calls.push(sql.startsWith('SELECT') ? 'check query' : sql);
      throw new Error(sql === 'ROLLBACK' ? 'rollback failed' : 'check query failed');
    },
    end: async () => {
      calls.push('end');
    },
  } as unknown as Client;
  const brokenError = await endError({ client: brokenClient, xid: '1' });
  check(
    'A failing check query is reported as itself',
    brokenError === 'check query failed' && calls.join(',') === 'check query,ROLLBACK,end',
    `calls = ${calls.join(' → ')}; reported error = ${brokenError}`,
  );

  const aborted = await beginTestTransaction();
  const abortedId = (await createProject(aborted.client)).id;
  const failure = await aborted.client.query('SELECT 1 / 0').catch((error: { code?: string }) => error.code);
  const abortedError = await endError(aborted);
  const abortedCount = await countElsewhere('project', abortedId);
  check(
    'An aborted harness transaction passes the check',
    failure === '22012' && abortedError === null && abortedCount === 0,
    `failed statement SQLSTATE ${failure}; end error = ${abortedError}; count(*) afterwards = ${abortedCount}`,
  );

  // ---- Requirement: Factories create valid L1 graph rows ---------------------------------------
  const factories = await beginTestTransaction();
  const client = factories.client;
  const project = await createProject(client);
  const file = await createFile(client, { project_id: project.id });
  const caller = await createSymbol(client, { file_id: file.id });
  const callee = await createSymbol(client, { file_id: file.id });
  const edge = await createEdge(client, { project_id: project.id, source: { symbol_id: caller.id }, target: { symbol_id: callee.id } });
  const readable = await Promise.all(
    [
      ['project', project.id],
      ['file', file.id],
      ['symbol', caller.id],
      ['symbol', callee.id],
      ['edge', edge.id],
    ].map(async ([table, id]) => (await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount),
  );
  check(
    'Each factory creates a row with defaults',
    readable.every((n) => n === 1),
    `rows readable back (project, file, symbol, symbol, edge) = ${readable.join(', ')}; edge ${edge.kind}/${edge.resolution}/${edge.extractor}`,
  );

  const second = await createProject(client);
  const otherFile = await createFile(client, { project_id: project.id });
  check(
    'Default unique values never collide',
    project.name !== second.name && file.path !== otherFile.path,
    `names ${project.name} / ${second.name}; paths ${file.path} / ${otherFile.path}`,
  );

  const php = await createProject(client, { language: 'php', is_sample: true });
  const phpFile = await createFile(client, { project_id: php.id });
  const klass = await createSymbol(client, { file_id: phpFile.id }, { kind: 'class' });
  const { rows: overridden } = await client.query(
    'SELECT p.language, p.is_sample, s.kind FROM project p, symbol s WHERE p.id = $1 AND s.id = $2',
    [php.id, klass.id],
  );
  check(
    'Overridden columns are stored',
    JSON.stringify(overridden) === JSON.stringify([{ language: 'php', is_sample: true, kind: 'class' }]),
    JSON.stringify(overridden),
  );

  const undefinedOverrides = await createProject(client, { language: undefined, root_path: undefined });
  check(
    'Overrides set to undefined keep the factory default',
    undefinedOverrides.language === 'typescript' && undefinedOverrides.root_path === '/repos/sample',
    `language ${undefinedOverrides.language}; root_path ${undefinedOverrides.root_path}`,
  );

  check(
    'Default values are synthetic',
    project.root_path === '/repos/sample' &&
      project.name.startsWith('project-') &&
      /^src\/file-.*\.ts$/.test(file.path) &&
      caller.name === 'handle',
    `root_path ${project.root_path}; name ${project.name}; path ${file.path}; symbol ${caller.name}`,
  );

  const fileEdge = await createEdge(client, { project_id: project.id, source: { file_id: file.id }, target: { file_id: otherFile.id } }, { kind: 'imports' });
  check(
    'An edge can connect files as well as symbols',
    fileEdge.source_file_id === file.id &&
      fileEdge.target_file_id === otherFile.id &&
      fileEdge.source_symbol_id === null &&
      fileEdge.target_symbol_id === null,
    JSON.stringify({ source_file_id: fileEdge.source_file_id, target_file_id: fileEdge.target_file_id, source_symbol_id: fileEdge.source_symbol_id, target_symbol_id: fileEdge.target_symbol_id }),
  );
  await endTestTransaction(factories);

  // Extra evidence for design D4: an endpoint with both ids does not compile; a valid call does.
  const tsc = 'npx tsc --noEmit --strict --module esnext --moduleResolution bundler --skipLibCheck';
  const xorSource = (endpoint: string): string => `import { createEdge } from '${helpersDir}/factories';
type HarnessClient = Parameters<typeof createEdge>[0];
export const call = (client: HarnessClient) =>
  createEdge(client, { project_id: 'p', source: ${endpoint}, target: { file_id: 'f' } });
`;
  writeFileSync(join(work, 'xor-valid.ts'), xorSource(`{ symbol_id: 's' }`));
  writeFileSync(join(work, 'xor-both.ts'), xorSource(`{ symbol_id: 's', file_id: 'f' }`));
  log(`\n$ ${tsc} <tmp>/xor-valid.ts   (source: { symbol_id })`);
  const valid = run(`${tsc} "${join(work, 'xor-valid.ts')}"`, {});
  log(`      (D4 extra) exit ${valid.status}${valid.out.trim() ? `; ${valid.out.trim()}` : ''}`);
  log(`$ ${tsc} <tmp>/xor-both.ts    (source: { symbol_id, file_id })`);
  const both = run(`${tsc} "${join(work, 'xor-both.ts')}"`, {});
  const bothErrors = both.out
    .split('\n')
    .filter((line) => line.includes('error TS'))
    .map((line) => line.replace(/^.*xor-both\.ts/, '<tmp>/xor-both.ts').trim());
  log(`      (D4 extra) exit ${both.status}; ${bothErrors.join(' | ')}`);
  expect(valid.status).toBe(0);
  expect(both.status).not.toBe(0);

  // ---- Requirement: Existing store test helpers keep their API ---------------------------------
  log('\n$ npx vitest run tests/integration/store  &&  git diff --stat feature/entrega-2-CRN -- tests/integration/store');
  const store = run('npx vitest run tests/integration/store', {});
  const diff = run('git diff --stat feature/entrega-2-CRN -- tests/integration/store', {});
  const changed = diff.out.split('\n').filter((line) => line.includes('|')).map((line) => line.trim());
  check(
    'Existing store specs pass unchanged',
    store.status === 0 && /Tests\s+83 passed \(83\)/.test(store.out) && changed.length === 1 && changed[0].startsWith('tests/integration/store/support.ts'),
    `exit ${store.status}; ${summary(store.out)}; changed under store/: ${changed.join('; ')}`,
  );

  const failed = results.filter((result) => !result.ok);
  log(`\n${results.length - failed.length}/${results.length} scenarios demonstrated`);
}

it('show-spec-working: test-db-isolation', { timeout: 600_000 }, async () => {
  try {
    await main();
  } finally {
    rmSync(work, { recursive: true, force: true });
    writeFileSync(resolve(__dirname, '2026-09-29-demo-output.txt'), `${transcript.join('\n')}\n`);
  }
  expect(results.filter((result) => !result.ok)).toEqual([]);
  expect(results).toHaveLength(25);
});
