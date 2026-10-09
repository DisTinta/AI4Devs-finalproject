import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SeedRows } from '@codemind/adapter-store-postgres';
import { projectKey, seedId } from '../../../packages/cli/src/seed/deterministic-ids';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { renderSeedDump } from '../../../packages/cli/src/seed/render-dump';

// Design D7 of openspec/changes/seed-load-and-projects: the seed reader shared by `db:seed` and the
// coherence test. Not a scenario of its own; it backs "An invalid seed file fails before connecting"
// and "The versioned constant matches the versioned seed". Inputs are the renderer's own output, so
// the reader is pinned to what `renderSeedDump` writes.

const FINGERPRINTS = { analyzer: `sha256:${'a'.repeat(64)}`, contract: `sha256:${'b'.repeat(64)}` };
const HEAD = 'f'.repeat(40);

/** Two files with symbols in both, two edges, two commits (one message with a line feed and one with a carriage return). */
function rows(framework: string | null = 'laravel'): SeedRows {
  const projectId = randomUUID();
  const order = randomUUID();
  const calc = randomUUID();
  const total = randomUUID();
  const price = randomUUID();
  const run = randomUUID();
  const head = randomUUID();
  const other = randomUUID();
  return {
    project: {
      id: projectId,
      name: '__codemind_seed_build__',
      root_path: '/tmp/x',
      language: 'php',
      framework,
      is_sample: false,
      indexed_commit: HEAD,
      node_count: 0,
      edge_count: 0,
      indexed_at: null,
      created_at: new Date('2030-01-01T00:00:00.000Z'),
    },
    files: [
      { id: order, project_id: projectId, path: 'app/Order.php', kind: 'source', loc: 40, content_hash: 'h1', redacted: false },
      { id: calc, project_id: projectId, path: "app/O'Calc.php", kind: 'source', loc: null, content_hash: null, redacted: true },
    ],
    symbols: [
      { id: total, file_id: order, path: 'app/Order.php', name: 'total', kind: 'method', start_line: 10, end_line: 20, signature: 'total(): int' },
      { id: run, file_id: order, path: 'app/Order.php', name: 'Order', kind: 'class', start_line: 3, end_line: 40, signature: null },
      { id: price, file_id: calc, path: "app/O'Calc.php", name: 'price', kind: 'method', start_line: 2, end_line: 9, signature: null },
    ],
    edges: [
      { id: randomUUID(), project_id: projectId, source_symbol_id: total, source_file_id: null, target_symbol_id: price, target_file_id: null, kind: 'calls', resolution: 'exact', extractor: 'php', weight: null },
      { id: randomUUID(), project_id: projectId, source_symbol_id: null, source_file_id: order, target_symbol_id: null, target_file_id: calc, kind: 'co_changed', resolution: 'heuristic', extractor: 'git', weight: 0.25 },
    ],
    commits: [
      { id: head, project_id: projectId, sha: HEAD, message: 'fix: totals\n\nBody line', author_hash: 'x1', committed_at: new Date('2024-05-06T07:08:09.000Z'), pr_number: 61 },
      { id: other, project_id: projectId, sha: '1'.repeat(40), message: 'feat: calc\r\nwith \\ slash', author_hash: 'x2', committed_at: new Date('2024-01-02T03:04:05.000Z'), pr_number: null },
    ],
    fileCommits: [
      { file_id: order, commit_id: head, lines_added: 3, lines_removed: 1 },
      { file_id: calc, commit_id: other, lines_added: null, lines_removed: null },
    ],
  };
}

describe('seedProjects', () => {
  it('reads each project of a rendered seed with its counts, attributing symbols through their file', () => {
    // Arrange
    const dump = renderSeedDump(rows(), FINGERPRINTS, 'acme-shop');

    // Act
    const projects = seedProjects(dump);

    // Assert
    expect(projects).toEqual([
      {
        id: seedId(projectKey('acme-shop')),
        name: 'acme-shop',
        language: 'php',
        framework: 'laravel',
        isSample: true,
        fileCount: 2,
        symbolCount: 3,
        edgeCount: 2,
        commitCount: 2,
      },
    ]);
  });

  it('reads a NULL framework as null', () => {
    const projects = seedProjects(renderSeedDump(rows(null), FINGERPRINTS, 'acme-shop'));

    expect(projects[0]?.framework).toBeNull();
  });

  it("reads a name with a doubled quote", () => {
    const projects = seedProjects(renderSeedDump(rows(), FINGERPRINTS, "o'shop"));

    expect(projects.map((p) => p.name)).toEqual(["o'shop"]);
  });

  it('reads is_sample: true only when the row says true; false or a missing column are not samples', () => {
    const sql = [
      "INSERT INTO project (id, name, language, is_sample) VALUES ('a', 'a', 'php', true);",
      "INSERT INTO project (id, name, language, is_sample) VALUES ('b', 'b', 'php', false);",
      "INSERT INTO project (id, name, language) VALUES ('c', 'c', 'php');",
      '',
    ].join('\n');

    expect(seedProjects(sql).map((p) => [p.name, p.isSample])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
    ]);
  });

  it('ignores header comments and blank lines', () => {
    const projects = seedProjects('-- codemind-seed-format: 1\n-- other\n\n\n');

    expect(projects).toEqual([]);
  });

  it('decodes escape string literals: doubled backslashes, doubled quotes and \\uXXXX controls', () => {
    // A name holding a tab is written as E'…' by the renderer.
    const name = ['a', 'b'].join(String.fromCharCode(92)) + "'q" + String.fromCharCode(9) + 'z';

    const projects = seedProjects(renderSeedDump(rows(), FINGERPRINTS, name));

    expect(projects.map((p) => p.name)).toEqual([name]);
  });

  it('accepts CRLF line endings and a final comment without a line feed', () => {
    const dump = renderSeedDump(rows(), FINGERPRINTS, 'acme-shop').split('\n').join('\r\n') + '-- end';

    expect(seedProjects(dump).map((p) => [p.name, p.fileCount, p.symbolCount])).toEqual([['acme-shop', 2, 3]]);
  });

  it('counts only rows of the project: a symbol of an unknown file and another table are ignored', () => {
    const sql = [
      "INSERT INTO project (id, name, language, framework) VALUES ('p', 'x', 'php', NULL);",
      "INSERT INTO file (id, project_id) VALUES ('f', 'p');",
      "INSERT INTO symbol (id, file_id) VALUES ('s1', 'f');",
      "INSERT INTO symbol (id, file_id) VALUES ('s2', 'elsewhere');",
      "INSERT INTO claim (id, project_id) VALUES ('c', 'p');",
      "INSERT INTO commit (id, project_id) VALUES ('k', 'other');",
      "INSERT INTO edge (id, project_id) VALUES ('e', 'p');",
      '',
    ].join('\n');

    expect(seedProjects(sql)).toEqual([
      { id: 'p', name: 'x', language: 'php', framework: null, isSample: false, fileCount: 1, symbolCount: 1, edgeCount: 1, commitCount: 0 },
    ]);
  });

  it.each([
    ['a statement that is not an INSERT', 'DELETE FROM project;'],
    ['an unterminated literal', "INSERT INTO project (id, name) VALUES ('x;"],
    ['a value of an unknown form', 'INSERT INTO project (id, name) VALUES (now(), 1);'],
    ['more values than columns', "INSERT INTO project (id, name, language) VALUES ('a', 'b', 'php', NULL);"],
    ['a missing semicolon', "INSERT INTO project (id, name, language, framework) VALUES ('a', 'b', 'php', NULL)"],
    ['a project without a name', "INSERT INTO project (id, language) VALUES ('a', 'php');"],
    ['a project with a NULL id', "INSERT INTO project (id, name, language) VALUES (NULL, 'b', 'php');"],
    ['a numeric framework', "INSERT INTO project (id, name, language, framework) VALUES ('a', 'b', 'php', 1);"],
    ['a boolean framework', "INSERT INTO project (id, name, language, framework) VALUES ('a', 'b', 'php', true);"],
    ['an unknown escape', "INSERT INTO project (id, name, language) VALUES ('a', E'x\\qy', 'php');"],
    ['a \\u escape without four hex digits', "INSERT INTO project (id, name, language) VALUES ('a', E'x\\u12zz', 'php');"],
  ])('throws on %s', (_case, sql) => {
    expect(() => seedProjects(sql)).toThrow(/^seed reader: /);
  });
});
