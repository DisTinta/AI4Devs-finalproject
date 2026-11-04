import type { ExplainQueryCounts } from '../knowledge/query-log.js';

// The cache hit rate of a project (DIS-69 design S1): one pure definition over the two counts the
// store reads, shared by the API, the web (through the API) and the CLI.

/** The largest value of a Postgres `integer`, the bound of the counts the store returns. */
const COUNT_MAX = 2_147_483_647;

/** The cache hit rate of one project: the counts it comes from and the percentage. */
export interface ProjectCacheHitRate {
  /** Every `explain` query of the project, since it was created. */
  queries: number;
  /** The `explain` queries served from the answer cache, by exact key or by similarity. */
  cacheHits: number;
  /** 100 × `cacheHits` / `queries`, in percent with at most one decimal, or `null` without queries. */
  hitRatePct: number | null;
}

/**
 * The cache hit rate of a project from its counts (DIS-69 design S1). `hitRatePct` is computed in
 * tenths of a percent from integer arithmetic and a half rounds up toward +∞, the rule of
 * `savingsPct` for the answer's savings; it is `null` when there are no queries.
 *
 * @param counts The project's explain query counts, as `StorePort.countExplainQueries` returns them.
 * @returns The counts as given and the percentage.
 * @throws RangeError when a count is not an integer from 0 to 2147483647 or the hits exceed the
 *   queries; the message holds no count.
 */
export function cacheHitRate(counts: ExplainQueryCounts): ProjectCacheHitRate {
  const { queries, cacheHits } = counts;
  if (!isCount(queries) || !isCount(cacheHits) || cacheHits > queries) {
    throw new RangeError('the explain query counts must be integers within the integer range, with the hits not above the queries');
  }
  if (queries === 0) return { queries, cacheHits, hitRatePct: null };
  return { queries, cacheHits, hitRatePct: Math.round((cacheHits * 1000) / queries) / 10 };
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= COUNT_MAX;
}
