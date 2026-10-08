import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SeedRows } from '@codemind/adapter-store-postgres';
import {
  commitKey,
  edgeKey,
  fileKey,
  projectKey,
  seedId,
  symbolKey,
  withOccurrence,
} from '../../../packages/cli/src/seed/deterministic-ids';
import { renderSeedDump } from '../../../packages/cli/src/seed/render-dump';

// Spec: openspec/changes/seed-build/specs/seed-build/spec.md → "Deterministic identifiers" and
// "Canonical values and ordering". The `it` named after a scenario is that scenario; the rest are
// extra cases.

const FINGERPRINTS = { analyzer: `sha256:${'a'.repeat(64)}`, contract: `sha256:${'b'.repeat(64)}` };
const HEAD = 'f'.repeat(40);
const OTHER = '1'.repeat(40);

/**
 * One project with two files, three symbols, three edges (symbol→symbol, file→symbol, file→file),
 * two commits and three file–commit links. Every id is a fresh random UUID, so two calls give the same
 * graph under different ids.
 */
function sampleRows(): SeedRows {
  const projectId = randomUUID();
  const order = randomUUID();
  const calc = randomUUID();
  const total = randomUUID();
  const run = randomUUID();
  const price = randomUUID();
  const head = randomUUID();
  const other = randomUUID();
  return {
    project: {
      id: projectId,
      name: '__codemind_seed_build__',
      root_path: 'C:\\Users\\someone\\fixtures\\acme-shop',
      language: 'php',
      framework: 'laravel',
      is_sample: false,
      indexed_commit: HEAD,
      node_count: 999,
      edge_count: 999,
      indexed_at: new Date('2030-01-01T00:00:00.000Z'),
      created_at: new Date('2030-01-01T00:00:00.000Z'),
    },
    files: [
      { id: order, project_id: projectId, path: 'app/Order.php', kind: 'source', loc: 40, content_hash: 'h1', redacted: false },
      { id: calc, project_id: projectId, path: 'app/Calc.php', kind: 'source', loc: 12, content_hash: 'h2', redacted: true },
    ],
    symbols: [
      { id: total, file_id: order, path: 'app/Order.php', name: 'total', kind: 'method', start_line: 10, end_line: 20, signature: 'total(): int' },
      { id: run, file_id: order, path: 'app/Order.php', name: 'Order', kind: 'class', start_line: 3, end_line: 40, signature: null },
      { id: price, file_id: calc, path: 'app/Calc.php', name: 'price', kind: 'method', start_line: 2, end_line: 9, signature: null },
    ],
    edges: [
      { id: randomUUID(), project_id: projectId, source_symbol_id: total, source_file_id: null, target_symbol_id: price, target_file_id: null, kind: 'calls', resolution: 'exact', extractor: 'php', weight: null },
      { id: randomUUID(), project_id: projectId, source_symbol_id: null, source_file_id: calc, target_symbol_id: run, target_file_id: null, kind: 'imports', resolution: 'exact', extractor: 'php', weight: null },
      { id: randomUUID(), project_id: projectId, source_symbol_id: null, source_file_id: order, target_symbol_id: null, target_file_id: calc, kind: 'co_changed', resolution: 'heuristic', extractor: 'git', weight: 0.5 },
    ],
    commits: [
      { id: head, project_id: projectId, sha: HEAD, message: 'fix: totals (#61)', author_hash: 'x1', committed_at: new Date('2024-05-06T07:08:09.000Z'), pr_number: 61 },
      { id: other, project_id: projectId, sha: OTHER, message: 'feat: calc', author_hash: 'x2', committed_at: new Date('2024-01-02T03:04:05.000Z'), pr_number: null },
    ],
    fileCommits: [
      { file_id: order, commit_id: head, lines_added: 3, lines_removed: 1 },
      { file_id: calc, commit_id: head, lines_added: null, lines_removed: null },
      { file_id: calc, commit_id: other, lines_added: 12, lines_removed: 0 },
    ],
  };
}

/** Reverses every table, so the renderer cannot rely on the order it receives. */
function shuffled(rows: SeedRows): SeedRows {
  return {
    ...rows,
    files: [...rows.files].reverse(),
    symbols: [...rows.symbols].reverse(),
    edges: [...rows.edges].reverse(),
    commits: [...rows.commits].reverse(),
    fileCommits: [...rows.fileCommits].reverse(),
  };
}

/** The `INSERT` lines of `table`. */
function inserts(dump: string, table: string): string[] {
  return dump.split('\n').filter((line) => line.startsWith(`INSERT INTO ${table} (`));
}

describe('renderSeedDump', () => {
  it('Ids derive from natural keys, not from the database', () => {
    // Arrange
    const first = sampleRows();
    const second = shuffled(sampleRows());

    // Act
    const a = renderSeedDump(first, FINGERPRINTS, 'acme-shop');
    const b = renderSeedDump(second, FINGERPRINTS, 'acme-shop');

    // Assert
    expect(a).toBe(b);
    const p = 'acme-shop';
    const projectId = seedId(projectKey(p));
    const order = seedId(fileKey(p, 'app/Order.php'));
    const calc = seedId(fileKey(p, 'app/Calc.php'));
    const total = seedId(symbolKey(p, 'app/Order.php', 'method', 10, 'total'));
    const price = seedId(symbolKey(p, 'app/Calc.php', 'method', 2, 'price'));
    const head = seedId(commitKey(p, HEAD));
    const callsId = seedId(
      withOccurrence(
        edgeKey(p, 'calls', 'exact', 'php',
          { type: 'symbol', path: 'app/Order.php', kind: 'method', startLine: 10, name: 'total' },
          { type: 'symbol', path: 'app/Calc.php', kind: 'method', startLine: 2, name: 'price' }),
        0,
      ),
    );
    expect(inserts(a, 'project')[0]).toContain(`('${projectId}', 'acme-shop'`);
    expect(inserts(a, 'file')).toContain(
      `INSERT INTO file (id, project_id, path, kind, loc, content_hash, redacted) VALUES ('${order}', '${projectId}', 'app/Order.php', 'source', 40, 'h1', false);`,
    );
    expect(inserts(a, 'symbol').some((l) => l.includes(`('${total}', '${order}', 'total'`))).toBe(true);
    expect(inserts(a, 'edge')).toContain(
      `INSERT INTO edge (id, project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id, kind, resolution, extractor, weight) VALUES ('${callsId}', '${projectId}', '${total}', NULL, '${price}', NULL, 'calls', 'exact', 'php', NULL);`,
    );
    expect(inserts(a, 'file_commit')).toContain(
      `INSERT INTO file_commit (file_id, commit_id, lines_added, lines_removed) VALUES ('${calc}', '${head}', NULL, NULL);`,
    );
    for (const row of [first.project, ...first.files, ...first.symbols, ...first.edges, ...first.commits]) {
      expect(a).not.toContain(row.id);
    }
  });

  it('Identical edges get distinct ids whatever the row order', () => {
    // Arrange: two copies of the calls edge, plus a third copy with a weight (ranked after them)
    const rows = sampleRows();
    const calls = rows.edges[0];
    const twins = [
      { ...calls, id: randomUUID() },
      { ...calls, id: randomUUID() },
      { ...calls, id: randomUUID(), weight: 0.25 },
    ];
    const orders = [
      [...rows.edges, ...twins],
      [twins[2], twins[0], ...rows.edges, twins[1]],
      [twins[1], twins[2], twins[0], ...[...rows.edges].reverse()],
    ];

    // Act
    const dumps = orders.map((edges) => renderSeedDump({ ...rows, edges }, FINGERPRINTS, 'acme-shop'));

    // Assert
    expect(new Set(dumps).size).toBe(1);
    const base = edgeKey('acme-shop', 'calls', 'exact', 'php',
      { type: 'symbol', path: 'app/Order.php', kind: 'method', startLine: 10, name: 'total' },
      { type: 'symbol', path: 'app/Calc.php', kind: 'method', startLine: 2, name: 'price' });
    const callLines = inserts(dumps[0], 'edge').filter((l) => l.includes("'calls'"));
    expect(callLines).toHaveLength(4);
    const ids = [0, 1, 2, 3].map((n) => seedId(withOccurrence(base, n)));
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(callLines.some((l) => l.includes(`('${id}'`))).toBe(true);
    // Missing weights rank first: #3 is the weighted copy.
    expect(callLines.find((l) => l.includes(`('${ids[3]}'`))).toContain(', 0.25);');
  });

  it('Values are written in canonical form', () => {
    // Arrange
    const rows = sampleRows();
    rows.edges[2].weight = 0.1;
    rows.edges.push({ ...rows.edges[2], id: randomUUID(), kind: 'tested_by', weight: 1 });
    rows.commits[0].message = "O'Brien \\ fix";
    rows.commits[1].message = 'line one\r\nline\ttwo';

    // Act
    const dump = renderSeedDump(rows, FINGERPRINTS, 'acme-shop');

    // Assert
    expect(inserts(dump, 'project')[0]).toContain("'2024-05-06T07:08:09.000Z', '2024-05-06T07:08:09.000Z');");
    // The second message spans two lines in the file, so look for its date in the whole dump.
    expect(dump).toContain("'2024-01-02T03:04:05.000Z', NULL);");
    const edges = inserts(dump, 'edge').join('\n');
    expect(edges).toContain(", 0.1);");
    expect(edges).toContain(", 1);");
    expect(edges).toContain(', NULL);');
    const commits = inserts(dump, 'commit').join('\n');
    expect(commits).toContain("'O''Brien \\ fix'");
    expect(dump).toContain("E'line one\\u000d\nline\\u0009two'");
    expect(dump).not.toContain('\r');
  });

  it('writes the sample attributes and counts the rendered rows', () => {
    const dump = renderSeedDump(sampleRows(), FINGERPRINTS, 'acme-shop');
    const project = inserts(dump, 'project')[0];
    expect(project).toBe(
      `INSERT INTO project (id, name, root_path, language, framework, is_sample, indexed_commit, node_count, edge_count, indexed_at, created_at) VALUES ('${seedId(projectKey('acme-shop'))}', 'acme-shop', 'fixtures/acme-shop', 'php', 'laravel', true, '${HEAD}', 5, 3, '2024-05-06T07:08:09.000Z', '2024-05-06T07:08:09.000Z');`,
    );
    expect(dump).not.toContain('__codemind_seed_build__');
    expect(dump).not.toContain('someone');
  });

  it('writes the header, the tables in foreign-key order and nothing else', () => {
    const dump = renderSeedDump(sampleRows(), FINGERPRINTS, 'acme-shop');
    const lines = dump.split('\n');
    expect(lines.slice(0, 3)).toEqual([
      '-- codemind-seed-format: 1',
      `-- analyzer-fingerprint: ${FINGERPRINTS.analyzer}`,
      `-- contract-fingerprint: ${FINGERPRINTS.contract}`,
    ]);
    const tables = lines.filter((l) => l.startsWith('INSERT INTO ')).map((l) => l.split(' ')[2]);
    expect([...new Set(tables)]).toEqual(['project', 'file', 'symbol', 'edge', 'commit', 'file_commit']);
    expect(dump.endsWith(');\n')).toBe(true);
    expect(dump).not.toMatch(/DELETE|ON CONFLICT|BEGIN|COMMIT;|SET |embedding/);
  });

  it('orders rows by natural key in code-unit order', () => {
    const dump = renderSeedDump(sampleRows(), FINGERPRINTS, 'acme-shop');
    const paths = inserts(dump, 'file').map((l) => l.match(/'(app\/[^']+)'/)?.[1]);
    expect(paths).toEqual(['app/Calc.php', 'app/Order.php']);
    const values = (line: string) => line.split(' VALUES (')[1].split(', ');
    const symbolNames = inserts(dump, 'symbol').map((l) => values(l)[2]);
    expect(symbolNames).toEqual(["'price'", "'Order'", "'total'"]);
    const shas = inserts(dump, 'commit').map((l) => values(l)[2]);
    expect(shas).toEqual([`'${OTHER}'`, `'${HEAD}'`]);
  });

  it('maps file endpoints to the derived file ids', () => {
    const dump = renderSeedDump(sampleRows(), FINGERPRINTS, 'acme-shop');
    const p = 'acme-shop';
    const order = seedId(fileKey(p, 'app/Order.php'));
    const calc = seedId(fileKey(p, 'app/Calc.php'));
    const id = seedId(
      withOccurrence(edgeKey(p, 'co_changed', 'heuristic', 'git', { type: 'file', path: 'app/Order.php' }, { type: 'file', path: 'app/Calc.php' }), 0),
    );
    expect(inserts(dump, 'edge')).toContain(
      `INSERT INTO edge (id, project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id, kind, resolution, extractor, weight) VALUES ('${id}', '${seedId(projectKey(p))}', NULL, '${order}', NULL, '${calc}', 'co_changed', 'heuristic', 'git', 0.5);`,
    );
  });

  it('orders symbols by start line before kind, and edge twins by weight', () => {
    const rows = sampleRows();
    // A function on line 20 sorts after the method on line 2, though `function` < `method`.
    rows.symbols.push({ id: randomUUID(), file_id: rows.files[1].id, path: 'app/Calc.php', name: 'helper', kind: 'function', start_line: 20, end_line: 22, signature: null });
    const calls = rows.edges[0];
    rows.edges.push({ ...calls, id: randomUUID(), weight: 0.75 }, { ...calls, id: randomUUID(), weight: 0.25 });
    rows.edges.splice(0, 1);
    const dump = renderSeedDump(rows, FINGERPRINTS, 'acme-shop');
    const names = inserts(dump, 'symbol').map((l) => l.split(' VALUES (')[1].split(', ')[2]);
    expect(names).toEqual(["'price'", "'helper'", "'Order'", "'total'"]);
    const base = edgeKey('acme-shop', 'calls', 'exact', 'php',
      { type: 'symbol', path: 'app/Order.php', kind: 'method', startLine: 10, name: 'total' },
      { type: 'symbol', path: 'app/Calc.php', kind: 'method', startLine: 2, name: 'price' });
    const line = (n: number) => inserts(dump, 'edge').find((l) => l.includes(`('${seedId(withOccurrence(base, n))}'`));
    expect(line(0)).toContain(', 0.25);');
    expect(line(1)).toContain(', 0.75);');
  });

  it('writes the generated-file notice and omits empty tables', () => {
    const rows = sampleRows();
    rows.symbols = [];
    rows.edges = [];
    const dump = renderSeedDump(rows, FINGERPRINTS, 'acme-shop');
    expect(dump.split('\n')[3]).toBe('-- Generated by `npm run seed:build`; do not edit by hand.');
    expect(dump).not.toContain('\n\n\n');
    expect(inserts(dump, 'symbol')).toEqual([]);
  });

  it('never writes free text right before a hash (gitleaks generic-api-key)', () => {
    // The rule counts the comma as an assignment: a message ending in "api routes" or "primary key"
    // right before the high-entropy author_hash was reported as a secret (DIS-91 design D5).
    const rows = sampleRows();
    rows.commits[0].message = 'feat: web and api routes';
    const dump = renderSeedDump(rows, FINGERPRINTS, 'acme-shop');
    for (const line of inserts(dump, 'commit')) {
      expect(line.startsWith('INSERT INTO commit (id, project_id, sha, author_hash, message, committed_at, pr_number) VALUES (')).toBe(true);
    }
    expect(inserts(dump, 'commit').join('\n')).toContain("'x1', 'feat: web and api routes', '2024-05-06T07:08:09.000Z', 61);");
    for (const line of inserts(dump, 'file')) {
      expect(line.startsWith('INSERT INTO file (id, project_id, path, kind, loc, content_hash, redacted) VALUES (')).toBe(true);
    }
  });

  it('rejects a reference to an unexported row', () => {
    const rows = sampleRows();
    rows.symbols[0].file_id = randomUUID();
    expect(() => renderSeedDump(rows, FINGERPRINTS, 'acme-shop')).toThrow(/names no exported row/);
  });

  it('rejects a missing HEAD commit or date', () => {
    const rows = sampleRows();
    rows.project.indexed_commit = '0'.repeat(40);
    expect(() => renderSeedDump(rows, FINGERPRINTS, 'acme-shop')).toThrow(/HEAD/);
    const undated = sampleRows();
    undated.commits[0].committed_at = null;
    expect(() => renderSeedDump(undated, FINGERPRINTS, 'acme-shop')).toThrow(/HEAD/);
  });

  it('rejects a number that is not finite', () => {
    const rows = sampleRows();
    rows.edges[2].weight = Number.NaN;
    expect(() => renderSeedDump(rows, FINGERPRINTS, 'acme-shop')).toThrow(/not finite/);
  });
});
