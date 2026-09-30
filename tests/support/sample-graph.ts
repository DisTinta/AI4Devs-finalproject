import type {
  GraphCommit,
  GraphEdge,
  GraphFile,
  GraphFileCommit,
  GraphSymbol,
  KnowledgeGraph,
  SymbolRef,
} from '@codemind/core';

// A small, consistent, synthetic L1 graph shared by the unit and integration tests (DIS-23
// design D7). No real names or e-mails: shas and hashes are fixed hex strings.

/** Fixed synthetic shas, 40 hex characters each. */
export const SHA = {
  first: 'a'.repeat(40),
  second: 'b'.repeat(40),
  third: 'c'.repeat(40),
} as const;

/** A file of kind `source` at `path`, with a synthetic hash derived from its path. */
export function file(path: string, overrides: Partial<GraphFile> = {}): GraphFile {
  return { path, kind: 'source', loc: 10, contentHash: `hash-${path}`, ...overrides };
}

/** A method symbol in `path`, spanning `startLine`..`startLine + 2`. */
export function symbol(path: string, name: string, startLine: number, overrides: Partial<GraphSymbol> = {}): GraphSymbol {
  return { file: path, name, startLine, endLine: startLine + 2, kind: 'method', ...overrides };
}

/** The identity of a symbol. */
export function ref(s: SymbolRef): SymbolRef {
  return { file: s.file, name: s.name, startLine: s.startLine };
}

/** An `exact` edge from the synthetic extractor. */
export function edge(
  source: GraphEdge['source'],
  target: GraphEdge['target'],
  overrides: Partial<GraphEdge> = {},
): GraphEdge {
  return { source, target, kind: 'calls', resolution: 'exact', extractor: 'test-extractor', ...overrides };
}

/** A commit with a synthetic message and author hash. */
export function commit(sha: string, overrides: Partial<GraphCommit> = {}): GraphCommit {
  return { sha, message: `synthetic commit ${sha.slice(0, 7)}`, authorHash: `author-${sha.slice(0, 7)}`, ...overrides };
}

/** A file–commit link. */
export function fileCommit(path: string, sha: string, overrides: Partial<GraphFileCommit> = {}): GraphFileCommit {
  return { file: path, sha, linesAdded: 3, linesRemoved: 1, ...overrides };
}

/**
 * A consistent graph: 2 files, 3 symbols, one edge of each endpoint combination (symbol→symbol,
 * symbol→file, file→symbol, file→file), 2 commits and 3 file–commit links.
 */
export function sampleGraph(overrides: Partial<KnowledgeGraph> = {}): KnowledgeGraph {
  const a = 'src/a.ts';
  const b = 'src/b.ts';
  const run = symbol(a, 'run', 1);
  const stop = symbol(a, 'stop', 5);
  const helper = symbol(b, 'helper', 1, { kind: 'function' });
  return {
    indexedCommit: SHA.second,
    files: [file(a), file(b, { kind: 'test' })],
    symbols: [run, stop, helper],
    edges: [
      edge({ symbol: ref(run) }, { symbol: ref(helper) }),
      edge({ symbol: ref(stop) }, { file: b }, { kind: 'imports' }),
      edge({ file: b }, { symbol: ref(run) }, { kind: 'tested_by', resolution: 'heuristic' }),
      edge({ file: a }, { file: b }, { kind: 'co_changed', weight: 0.5 }),
    ],
    commits: [commit(SHA.first), commit(SHA.second, { prNumber: 7 })],
    fileCommits: [fileCommit(a, SHA.first), fileCommit(b, SHA.first), fileCommit(a, SHA.second)],
    ...overrides,
  };
}
