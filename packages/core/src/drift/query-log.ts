import type { QueryNotLoggedCode } from '../explain/explain-event.js';
import type { GenerationUsage } from '../explain/explain-answer.js';
import { latencyMs } from '../explain/usage.js';
import type { VerificationRowUsage } from '../explain/usage.js';
import { InvalidStoreQuery, ProjectNotFound, QueryLogWriteFailed } from '../knowledge/errors.js';
import type { QueryLogEntry } from '../knowledge/query-log.js';
import type { StorePort } from '../ports/StorePort.js';

// The `query_log` row of a drift call (DIS-73 design D3), as `impact/query-log.ts` builds its own.

/** What {@link driftQueryLogEntry} records. */
export interface DriftRowParts {
  /** The project the call was for. */
  projectId: string;
  /** The call's answer cache key. */
  key: string;
  /** The tokens and cost of the `answer` calls (all 0 for a golden or unknown report). */
  generation: GenerationUsage;
  /** The tokens, cost, calls and latency of the verification (`latencyMs` `null` when not measured). */
  verification: VerificationRowUsage;
  /** The latency of the call in whole milliseconds. */
  latencyMs: number;
  /** Whether the report was answered from the answer cache. */
  cacheHit: boolean;
}

/**
 * The row of one drift call: capability `drift`, the cache key as the question, totals that include the
 * verification (the cost rounded once to 6 decimals, as the report's usage rounds it), no baseline.
 *
 * @param parts The project, key, usage, latency and cache flag of the call.
 * @returns The entry for `saveQueryLog`.
 */
export function driftQueryLogEntry(parts: DriftRowParts): QueryLogEntry {
  const { generation, verification } = parts;
  return {
    projectId: parts.projectId,
    question: parts.key,
    capability: 'drift',
    inputTokens: generation.inputTokens + verification.inputTokens,
    outputTokens: generation.outputTokens + verification.outputTokens,
    baselineTokens: null,
    costUsd: Math.round((generation.costUsd + verification.costUsd) * 1e6) / 1e6,
    latencyMs: parts.latencyMs,
    cacheHit: parts.cacheHit,
    verifyInputTokens: verification.inputTokens,
    verifyOutputTokens: verification.outputTokens,
    verifyCostUsd: verification.costUsd,
    verifyCalls: verification.calls,
    verifyLatencyMs: verification.latencyMs,
  };
}

/**
 * The row of a report that spent nothing (a golden report or an unknown one): every counter 0, no
 * verification latency.
 *
 * @param projectId The project the call was for.
 * @param key The call's answer cache key.
 * @param startedAt The clock's first read.
 * @param finishedAt A later read of the clock.
 * @param cacheHit Whether the report is a golden report answered from the cache.
 * @returns The entry; its latency is at least 1 ms.
 */
export function zeroDriftRow(projectId: string, key: string, startedAt: Date, finishedAt: Date, cacheHit: boolean): QueryLogEntry {
  return driftQueryLogEntry({
    projectId,
    key,
    generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    verification: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0, latencyMs: null },
    latencyMs: latencyMs(startedAt, finishedAt),
    cacheHit,
  });
}

/**
 * Writes the row of a returned report: resolves to the `query_not_logged` code when the store fails
 * with `QueryLogWriteFailed`, `ProjectNotFound` or `InvalidStoreQuery`, to `undefined` once written.
 *
 * @param store The store.
 * @param entry The row.
 * @throws Any other failure of the write, unchanged.
 */
export async function saveDriftRow(store: StorePort, entry: QueryLogEntry): Promise<QueryNotLoggedCode | undefined> {
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
