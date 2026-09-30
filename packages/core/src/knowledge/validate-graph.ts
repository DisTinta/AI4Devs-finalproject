import { InvalidGraph, type GraphViolation } from './errors.js';
import type { KnowledgeGraph } from './graph.js';
import type { EdgeEndpoint } from './graph-edge.js';
import { symbolKey } from './graph-symbol.js';

// The rules the database cannot check on its own: references resolve inside the graph, keys are
// unique, required edge fields are present, counters and spans are sane. Enum membership and the
// edge weight range are left to the schema (spec → "Graph validation before writing").

/** Every rule `graph` breaks, in element order (files, symbols, edges, commits, links). */
export function validateGraph(graph: KnowledgeGraph): GraphViolation[] {
  const violations: GraphViolation[] = [];
  const report = (element: string, field: string | undefined, message: string): void => {
    violations.push({ element, field, message });
  };
  const nonNegative = (element: string, field: string, value: number | undefined): void => {
    if (value !== undefined && value < 0) report(element, field, `must not be negative (got ${value})`);
  };

  const paths = new Set<string>();
  graph.files.forEach((file, i) => {
    const element = `files[${i}]`;
    if (paths.has(file.path)) report(element, 'path', `duplicate file path "${file.path}"`);
    paths.add(file.path);
    nonNegative(element, 'loc', file.loc);
  });

  const symbols = new Set<string>();
  graph.symbols.forEach((symbol, i) => {
    const element = `symbols[${i}]`;
    if (!paths.has(symbol.file)) report(element, 'file', `file "${symbol.file}" is not in the graph`);
    const key = symbolKey(symbol);
    if (symbols.has(key)) {
      report(element, undefined, `duplicate symbol "${symbol.name}" at ${symbol.file}:${symbol.startLine}`);
    }
    symbols.add(key);
    if (symbol.startLine < 1) report(element, 'startLine', `must be at least 1 (got ${symbol.startLine})`);
    if (symbol.endLine < symbol.startLine) {
      report(element, 'endLine', `must not be before startLine (got ${symbol.endLine} < ${symbol.startLine})`);
    }
  });

  const endpointProblem = (endpoint: EdgeEndpoint): string | undefined => {
    const hasFile = endpoint.file !== undefined;
    const hasSymbol = endpoint.symbol !== undefined;
    if (hasFile === hasSymbol) return 'must be exactly one file or one symbol';
    if (endpoint.file !== undefined) {
      return paths.has(endpoint.file) ? undefined : `file "${endpoint.file}" is not in the graph`;
    }
    const { name, file, startLine } = endpoint.symbol;
    return symbols.has(symbolKey(endpoint.symbol))
      ? undefined
      : `symbol "${name}" at ${file}:${startLine} is not in the graph`;
  };
  graph.edges.forEach((edge, i) => {
    const element = `edges[${i}]`;
    for (const side of ['source', 'target'] as const) {
      const problem = endpointProblem(edge[side]);
      if (problem !== undefined) report(element, side, problem);
    }
    if (!edge.resolution) report(element, 'resolution', 'is required');
    if (!edge.extractor) report(element, 'extractor', 'is required and must not be empty');
  });

  const shas = new Set<string>();
  graph.commits.forEach((commit, i) => {
    const element = `commits[${i}]`;
    // An empty sha is never added, so no link can reference it.
    if (commit.sha === '') report(element, 'sha', 'must not be empty');
    else if (shas.has(commit.sha)) report(element, 'sha', `duplicate commit sha "${commit.sha}"`);
    else shas.add(commit.sha);
    nonNegative(element, 'prNumber', commit.prNumber);
  });

  const links = new Set<string>();
  graph.fileCommits.forEach((link, i) => {
    const element = `fileCommits[${i}]`;
    if (!paths.has(link.file)) report(element, 'file', `file "${link.file}" is not in the graph`);
    if (!shas.has(link.sha)) report(element, 'sha', `commit "${link.sha}" is not in the graph`);
    const key = JSON.stringify([link.file, link.sha]);
    if (links.has(key)) report(element, undefined, `duplicate link between "${link.file}" and "${link.sha}"`);
    links.add(key);
    nonNegative(element, 'linesAdded', link.linesAdded);
    nonNegative(element, 'linesRemoved', link.linesRemoved);
  });

  return violations;
}

/** Throws `InvalidGraph` with every violation when `graph` breaks any rule of `validateGraph`. */
export function assertValidGraph(graph: KnowledgeGraph): void {
  const violations = validateGraph(graph);
  if (violations.length > 0) throw new InvalidGraph(violations);
}
