import { impact } from '@codemind/core';
import type { GraphEdge, GraphFile, GraphSymbol, ImpactReport, NewProject } from '@codemind/core';
import { createInMemoryStore } from '../../support/in-memory-store';
import type { InMemoryStore } from '../../support/in-memory-store';
import { commit, SHA } from '../../support/sample-graph';

// Small graphs for the impact unit tests (DIS-89 design P5), built with the helpers of
// tests/support/sample-graph.ts and loaded into the in-memory double.

const PROJECT: NewProject = { name: 'impact-small', rootPath: 'fixtures/impact-small', language: 'typescript', isSample: false };

/** The double loaded with a small graph, and the project's id. */
export type SmallStore = InMemoryStore & { projectId: string };

/** Loads `files`, `symbols` and `edges` into a fresh double. */
export function smallStore(parts: { files: GraphFile[]; symbols: GraphSymbol[]; edges: GraphEdge[] }): SmallStore {
  const loaded = createInMemoryStore({
    projects: [
      {
        project: PROJECT,
        graph: { indexedCommit: SHA.first, ...parts, commits: [commit(SHA.first)], fileCommits: [] },
      },
    ],
  });
  return { ...loaded, projectId: loaded.projectIds[0] };
}

/** The answered report of `change`; fails when the answer is `unknown`. */
export async function reportOf(
  loaded: SmallStore,
  change: string,
  maxHops: number,
): Promise<Extract<ImpactReport, { status: 'answered' }>> {
  const report = await impact(loaded.store, { projectId: loaded.projectId, change, maxHops });
  if (report.status !== 'answered') throw new Error(`expected an answered report, got ${report.reason}`);
  return report;
}

/** The symbols of a list, in order. */
export function names(entries: readonly { symbol: string }[]): string[] {
  return entries.map((entry) => entry.symbol);
}
