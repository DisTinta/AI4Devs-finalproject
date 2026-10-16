import { z } from 'zod';
import { InvalidStoreQuery } from './errors.js';
import { hasNoNul } from './text-without-nul.js';

// The usage of one query as the store records it in `query_log` (DIS-74 design U2): the record and
// the checks `saveQueryLog` runs before any statement. The question's length limit belongs to the
// caller (`explain/limits.ts`): `knowledge/` does not import `explain/`.

/** What a query asked for (Postgres enum `query_capability`). */
export const QUERY_CAPABILITIES = ['explain', 'impact', 'drift'] as const;

/** What a query asked for. */
export type QueryCapability = (typeof QUERY_CAPABILITIES)[number];

/** The usage of one query, one `query_log` row. Totals include the verification. */
export interface QueryLogEntry {
  /** The project the query was asked about. */
  projectId: string;
  /** The question as the caller gave it (non-empty, not only whitespace, no U+0000). */
  question: string;
  /** What the query asked for. */
  capability: QueryCapability;
  /** Input tokens of every model call of the query, verification included. */
  inputTokens: number;
  /** Output tokens of every model call of the query, verification included. */
  outputTokens: number;
  /** The tokens of the raw context the pack replaced, or `null` when no pack was built. */
  baselineTokens: number | null;
  /** Cost in USD of every model call of the query, verification included. */
  costUsd: number;
  /** Wall-clock time of the query in whole milliseconds. */
  latencyMs: number;
  /** Whether the answer came from the answer cache. */
  cacheHit: boolean;
  /** Input tokens of the verifier's calls. */
  verifyInputTokens: number;
  /** Output tokens of the verifier's calls. */
  verifyOutputTokens: number;
  /** Cost in USD of the verifier's calls. */
  verifyCostUsd: number;
  /** The verifier calls that resolved (pairs answered from the cache never count). */
  verifyCalls: number;
  /** Wall-clock time of the semantic check in whole milliseconds, or `null` when it is unknown. */
  verifyLatencyMs: number | null;
}

/** The largest value of a Postgres `integer` column. */
const INTEGER_MAX = 2_147_483_647;
/** The largest value of a Postgres `numeric(10,6)` column. */
const COST_MAX = 9_999.999999;

const count = z.int().min(0).max(INTEGER_MAX);
const cost = z.number().min(0).max(COST_MAX);

const queryLogEntrySchema = z
  .strictObject({
    projectId: z.string(),
    question: z
      .string()
      .refine((question) => /\S/.test(question))
      .refine(hasNoNul),
    capability: z.literal(QUERY_CAPABILITIES),
    inputTokens: count,
    outputTokens: count,
    baselineTokens: count.nullable(),
    costUsd: cost,
    latencyMs: count,
    cacheHit: z.boolean(),
    verifyInputTokens: count,
    verifyOutputTokens: count,
    verifyCostUsd: cost,
    verifyCalls: count,
    verifyLatencyMs: count.nullable(),
  })
  .refine(
    (entry) =>
      entry.verifyInputTokens <= entry.inputTokens &&
      entry.verifyOutputTokens <= entry.outputTokens &&
      entry.verifyCostUsd <= entry.costUsd,
  );

/**
 * Checks a query log entry before any statement (DIS-74 design U2): exactly the fields of
 * {@link QueryLogEntry}, counters that fit their columns, and verification counters that do not
 * exceed their totals. The form of `projectId` is the store's own first check (`ProjectNotFound`),
 * so here it only has to be a string. The message is fixed text: it never holds a value of the entry.
 *
 * @throws InvalidStoreQuery naming `entry` when the entry breaks any rule.
 */
export function assertValidQueryLogEntry(entry: QueryLogEntry): void {
  if (!queryLogEntrySchema.safeParse(entry).success) {
    throw new InvalidStoreQuery('entry', 'must be a valid query log entry');
  }
}
