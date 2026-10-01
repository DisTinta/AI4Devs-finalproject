// show-spec-working driver for openspec change co-change-edges (DIS-36). It exercises the real
// interface — the exported core rule `coChangeEdges` (compiled dist), the `GitPort` adapter and the
// Postgres store on its own pool connections (real commits) — independently of the repo's specs.
// One block per scenario of specs/git-history/spec.md, each printing the observed value and
// PASS/FAIL against the scenario's THEN, plus the error path of `saveGraph`.
// Run from the repository root, after `node fixtures/build-history.mjs` and `npx tsc --build`, with a
// migrated database:
//   DATABASE_URL=postgres://codemind:<password>@localhost:5432/codemind \
//     npx tsx openspec/changes/co-change-edges/reports/2026-10-01-demo.mts
// The transcript is saved next to this file as 2026-10-01-demo-output.txt.
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { coChangeEdges, MAX_FILES_PER_COMMIT, MIN_CO_CHANGES } from '@codemind/core';
import type { GraphEdge, GraphFileCommit, KnowledgeGraph } from '@codemind/core';
import { createSimpleGitHistory } from '../../../../packages/adapters/git/src/index';
import { createPostgresStore } from '../../../../packages/adapters/store-postgres/src/index';

let failures = 0;

function check(scenario: string, observed: unknown, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${scenario}\n       observed: ${JSON.stringify(observed)}`);
}

function link(file: string, sha: string, extra: Partial<GraphFileCommit> = {}): GraphFileCommit {
  return { file, sha, ...extra };
}

function coChanged(source: string, target: string, weight: number): GraphEdge {
  return { source: { file: source }, target: { file: target }, kind: 'co_changed', resolution: 'heuristic', extractor: 'git', weight };
}

function bigCommits(size: number): GraphFileCommit[] {
  const filler = Array.from({ length: size - 2 }, (_, i) => `filler/${String(i).padStart(3, '0')}.ts`);
  return [
    ...['s1', 's2'].flatMap((sha) => [link('a.ts', sha), link('b.ts', sha)]),
    ...['big1', 'big2'].flatMap((sha) => ['a.ts', 'c.ts', ...filler].map((path) => link(path, sha))),
  ];
}

const allPaths = (links: GraphFileCommit[]): Set<string> => new Set(links.map((l) => l.file));

console.log(`constants: MIN_CO_CHANGES=${MIN_CO_CHANGES} MAX_FILES_PER_COMMIT=${MAX_FILES_PER_COMMIT}\n`);
console.log('## Requirement: Co-change edges');

{
  const links = [...['s1', 's2', 's3'].flatMap((s) => [link('a.ts', s), link('b.ts', s)]), link('b.ts', 's4')];
  const out = coChangeEdges(links, new Set(['a.ts', 'b.ts']));
  check('Files changed together form a weighted edge', out, isDeepStrictEqual(out, [coChanged('a.ts', 'b.ts', 0.75)]));
}
{
  const links = [link('a.ts', 's1'), link('b.ts', 's1'), link('a.ts', 's2'), link('b.ts', 's3'), link('c.ts', 's4'), link('c.ts', 's5')];
  const out = coChangeEdges(links, new Set(['a.ts', 'b.ts', 'c.ts']));
  check('A single shared commit is not enough', out, isDeepStrictEqual(out, []));
}
{
  const links = ['s2', 's1'].flatMap((s) => ['z.ts', 'm.ts', 'Z.ts'].map((p) => link(p, s)));
  const known = new Set(['z.ts', 'm.ts', 'Z.ts']);
  const first = coChangeEdges(links, known);
  const second = coChangeEdges([...links].reverse(), known);
  const expected = [coChanged('Z.ts', 'm.ts', 1), coChanged('Z.ts', 'z.ts', 1), coChanged('m.ts', 'z.ts', 1)];
  check('Each pair yields one edge from the smaller path', first.map((e) => `${e.source.file}->${e.target.file}`), isDeepStrictEqual(first, expected) && isDeepStrictEqual(second, first));
}
{
  const links = [
    ...['s1', 's2'].flatMap((s) => [link('a.ts', s), link('b.ts', s), link('old.ts', s)]),
    link('a.ts', 's3'),
    link('old.ts', 's3'),
  ];
  const out = coChangeEdges(links, new Set(['a.ts', 'b.ts']));
  check('A path outside the snapshot yields no edge but still counts', out, isDeepStrictEqual(out, [coChanged('a.ts', 'b.ts', 2 / 3)]));
}
{
  const links = bigCommits(101);
  const out = coChangeEdges(links, allPaths(links));
  check('A commit with more than 100 files is ignored', out, isDeepStrictEqual(out, [coChanged('a.ts', 'b.ts', 1)]));
}
{
  const links = bigCommits(100);
  const out = coChangeEdges(links, allPaths(links));
  const ab = out.find((e) => e.source.file === 'a.ts' && e.target.file === 'b.ts');
  const ac = out.find((e) => e.source.file === 'a.ts' && e.target.file === 'c.ts');
  check('A commit with exactly 100 files is counted', { edges: out.length, ab, ac }, isDeepStrictEqual(ab, coChanged('a.ts', 'b.ts', 0.5)) && isDeepStrictEqual(ac, coChanged('a.ts', 'c.ts', 0.5)));
}
{
  const out = coChangeEdges([], new Set(['a.ts']));
  check('An empty history yields no edges', out, isDeepStrictEqual(out, []));
}
{
  const links = [link('a.ts', 's1'), link('a.ts', 's1'), link('b.ts', 's1'), link('a.ts', 's2'), link('b.ts', 's2'), link('b.ts', 's3')];
  const out = coChangeEdges(links, new Set(['a.ts', 'b.ts']));
  check('Duplicate links in one commit count once', out, isDeepStrictEqual(out, [coChanged('a.ts', 'b.ts', 2 / 3)]));
}
{
  const shas = ['s1', 's2', 's3'];
  // Two histories: same shas and paths; author hashes and line counts differ everywhere.
  const one = { commits: shas.map((sha) => ({ sha, authorHash: 'author-one' })), fileCommits: shas.flatMap((s) => [link('a.ts', s, { linesAdded: 40, linesRemoved: 2 }), link('b.ts', s, { linesAdded: 1, linesRemoved: 0 })]) };
  const two = { commits: shas.map((sha, i) => ({ sha, authorHash: `author-${i}` })), fileCommits: shas.flatMap((s) => [link('a.ts', s), link('b.ts', s, { linesAdded: 0, linesRemoved: 900 })]) };
  const known = new Set(['a.ts', 'b.ts']);
  const a = coChangeEdges(one.fileCommits, known);
  const b = coChangeEdges(two.fileCommits, known);
  check('Author hash and line counts do not affect co-change', { a, b }, isDeepStrictEqual(a, b) && isDeepStrictEqual(a, [coChanged('a.ts', 'b.ts', 1)]));
}

console.log('\n## Requirement: Co-change edges persist with the snapshot');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const store = createPostgresStore({ pool });
const history = createSimpleGitHistory({ authorHashSalt: 'demo-salt-2026-10-01' });
const created: string[] = [];
const EDGES = `SELECT s.path AS source, t.path AS target, e.kind, e.resolution, e.extractor, e.weight
                 FROM edge e JOIN file s ON s.id = e.source_file_id JOIN file t ON t.id = e.target_file_id
                WHERE e.project_id = $1 AND e.kind = 'co_changed'`;
try {
  const fixtures = [
    { name: 'acme-shop', language: 'php', expected: { source: 'app/Services/DiscountService.php', target: 'app/Services/ShippingService.php', weight: 1 } },
    { name: 'task-api', language: 'typescript', expected: { source: 'src/schemas/task.schema.ts', target: 'src/services/task.service.ts', weight: 0.75 } },
  ];
  const observed: Record<string, unknown> = {};
  let ok = true;
  let acmeGraph: KnowledgeGraph | undefined;
  let acmeProject = '';
  for (const fixture of fixtures) {
    const root = resolve('fixtures', fixture.name);
    const projectId = await store.createProject({ name: `demo-co-change-${fixture.name}-${Date.now()}`, rootPath: root, language: fixture.language });
    created.push(projectId);
    const { head, commits, fileCommits } = await history.readHistory(root);
    const paths = [...new Set(fileCommits.map((l) => l.file))];
    const edges = coChangeEdges(fileCommits, new Set(paths));
    const graph: KnowledgeGraph = { indexedCommit: head, files: paths.map((path) => ({ path, kind: 'source', loc: 1, contentHash: `demo-${path}` })), symbols: [], edges, commits, fileCommits };
    const saved = await store.saveGraph(projectId, graph);
    const { rows } = await pool.query(EDGES, [projectId]);
    observed[fixture.name] = { saved, rows };
    ok &&= isDeepStrictEqual(rows, [{ ...fixture.expected, kind: 'co_changed', resolution: 'heuristic', extractor: 'git' }]);
    if (fixture.name === 'acme-shop') {
      acmeGraph = graph;
      acmeProject = projectId;
    }
  }
  check('The documented fixture pairs are persisted', observed, ok);

  console.log('\n## Error path (graph-store validation, ticket AC 5)');
  if (acmeGraph) {
    const dropped = 'app/Services/ShippingService.php';
    try {
      await store.saveGraph(acmeProject, {
        ...acmeGraph,
        files: acmeGraph.files.filter((f) => f.path !== dropped),
        fileCommits: acmeGraph.fileCommits.filter((l) => l.file !== dropped),
      });
      check('co_changed edge to a file outside `files` is rejected', 'accepted', false);
    } catch (error) {
      const { rows } = await pool.query(EDGES, [acmeProject]);
      const err = error as { name: string; code?: string; message: string };
      check('co_changed edge to a file outside `files` is rejected, nothing written', { name: err.name, code: err.code, message: err.message, rowsAfter: rows.length }, err.name === 'InvalidGraph' && rows.length === 1);
    }
  }
} finally {
  for (const id of created) await pool.query('DELETE FROM project WHERE id = $1', [id]);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM project WHERE id = ANY($1::uuid[])', [created]);
  console.log(`\ncleanup: deleted ${created.length} demo projects, ${rows[0].n} left`);
  await pool.end();
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exitCode = failures === 0 ? 0 : 1;
