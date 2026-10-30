import { latencyMs } from '../explain/usage.js';
import type { QueryNotLoggedCode } from '../explain/explain-event.js';
import { InvalidStoreQuery, ProjectNotFound, QueryLogWriteFailed } from '../knowledge/errors.js';
import type { QueryLogEntry } from '../knowledge/query-log.js';
import type { StorePort } from '../ports/StorePort.js';

// The `query_log` row of an impact call (DIS-90 design D5). `impact` calls no model, so every token
// and cost counter is 0; the row exists so that the history and the daily ceiling see every call.

/**
 * The row of one returned impact report: capability `impact`, the change as the question, every token,
 * cost and verification counter 0, no baseline and no verification latency, never a cache hit.
 *
 * @param projectId The project the change was asked about.
 * @param change The change as the request gave it.
 * @param startedAt The clock read once the request was checked.
 * @param finishedAt The clock read once the report was built.
 * @returns The entry for `saveQueryLog`; its latency is at least 1 ms.
 */
export function impactQueryLogEntry(projectId: string, change: string, startedAt: Date, finishedAt: Date): QueryLogEntry {
  return {
    projectId,
    question: change,
    capability: 'impact',
    inputTokens: 0,
    outputTokens: 0,
    baselineTokens: null,
    costUsd: 0,
    latencyMs: latencyMs(startedAt, finishedAt),
    cacheHit: false,
    verifyInputTokens: 0,
    verifyOutputTokens: 0,
    verifyCostUsd: 0,
    verifyCalls: 0,
    verifyLatencyMs: null,
  };
}

/**
 * Writes the row of a returned report: resolves to the `query_not_logged` code when the store fails
 * with `QueryLogWriteFailed`, `ProjectNotFound` or `InvalidStoreQuery`, to `undefined` once written.
 *
 * @param store The store.
 * @param entry The row.
 * @throws Any other failure of the write, unchanged.
 */
export async function saveImpactRow(store: StorePort, entry: QueryLogEntry): Promise<QueryNotLoggedCode | undefined> {
  try {
    await store.saveQueryLog(entry);
    return undefined;
  } catch (error) {
    if (error instanceof QueryLogWriteFailed) return 'store-write-failed';
    if (error instanceof ProjectNotFound) return 'project-not-found';
    if (error instanceof InvalidStoreQuery) return 'invalid-entry';
    throw error;
  }
}
