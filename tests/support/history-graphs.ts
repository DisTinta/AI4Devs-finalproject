import type { GraphCommit, GraphFileCommit, KnowledgeGraph } from '@codemind/core';
import { commit, edge, file, fileCommit, ref, symbol } from './sample-graph';

// The graphs of the three data scenarios of the history reads (DIS-94, specs/graph-store/spec.md:
// "Co-changes are read from either end with their pull requests", "Document links are read through
// files and symbols", "Dated commits of each path are read in order"). Shared by the double's unit
// test and the Postgres integration test, which expect the same rows.

/** A fixed 40-character sha from a short label (`k1` gives `k1` then zeros). */
export function sha(label: string): string {
  return label.padEnd(40, '0');
}

/** Commits with a message and an author hash, each touching the given files. */
function history(
  commits: Array<{ label: string; pr?: number; at?: string; files: string[] }>,
): { commits: GraphCommit[]; fileCommits: GraphFileCommit[] } {
  return {
    commits: commits.map((c) =>
      commit(sha(c.label), {
        ...(c.pr !== undefined && { prNumber: c.pr }),
        ...(c.at !== undefined && { committedAt: new Date(c.at) }),
      }),
    ),
    fileCommits: commits.flatMap((c) => c.files.map((path) => fileCommit(path, sha(c.label)))),
  };
}

/** Scenario "Co-changes are read from either end with their pull requests". */
export function coChangeGraph(): KnowledgeGraph {
  return {
    files: [file('a.php'), file('b.php'), file('c.php')],
    symbols: [],
    edges: [
      edge({ file: 'a.php' }, { file: 'b.php' }, { kind: 'co_changed', weight: 0.5 }),
      edge({ file: 'c.php' }, { file: 'a.php' }, { kind: 'co_changed', weight: 1 }),
    ],
    ...history([
      { label: 'p4', pr: 4, files: ['a.php', 'b.php'] },
      { label: 'p2', pr: 2, files: ['a.php', 'b.php'] },
      { label: 'pn', files: ['a.php', 'b.php'] },
      { label: 'q9a', pr: 9, files: ['a.php', 'c.php'] },
      { label: 'q9b', pr: 9, files: ['a.php', 'c.php'] },
    ]),
  };
}

/** Scenario "Document links are read through files and symbols". */
export function documentLinkGraph(): KnowledgeGraph {
  const s = symbol('a.php', 'S', 1);
  const t = symbol('b.php', 'T', 1);
  return {
    files: [
      file('a.php'),
      file('b.php'),
      file('c.php'),
      file('README.md', { kind: 'doc' }),
      file('docs/x.md', { kind: 'doc' }),
      file('src/x.php'),
    ],
    symbols: [s, t],
    edges: [
      edge({ file: 'README.md' }, { symbol: ref(s) }, { kind: 'describes' }),
      edge({ file: 'README.md' }, { file: 'a.php' }, { kind: 'describes' }),
      edge({ file: 'README.md' }, { symbol: ref(t) }, { kind: 'describes' }),
      edge({ file: 'docs/x.md' }, { file: 'c.php' }, { kind: 'describes' }),
      edge({ file: 'README.md' }, { file: 'c.php' }, { kind: 'co_changed', weight: 0.5 }),
      edge({ file: 'src/x.php' }, { file: 'a.php' }, { kind: 'describes' }),
    ],
    commits: [],
    fileCommits: [],
  };
}

/** Scenario "Dated commits of each path are read in order". */
export function fileCommitGraph(): KnowledgeGraph {
  return {
    files: [file('a.php'), file('b.php')],
    symbols: [],
    edges: [],
    ...history([
      { label: 'k1', at: '2024-01-02T00:00:00Z', files: ['a.php', 'b.php'] },
      { label: 'k2', at: '2024-01-01T00:00:00Z', files: ['a.php'] },
      { label: 'k3', files: ['a.php'] },
    ]),
  };
}
