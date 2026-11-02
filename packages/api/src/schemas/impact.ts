import { z } from 'zod';
import { DEFAULT_IMPACT_HOPS, EDGE_RESOLUTIONS, hasNoNul, MAX_CHANGE_CHARS, MAX_HOPS, MIN_CHANGE_CHARS } from '@codemind/core';
import type { ImpactUnknownReason, RiskLevel } from '@codemind/core';
import { projectIdParamsSchema } from './common.js';

// The payload of `POST /api/projects/{projectId}/impact` (DIS-95 design D1, D2, D6): the only
// description of it. Limits and closed sets come from `@codemind/core`, never copied (backend-standards §4),
// except the risk levels and the unknown reason, which core exports as types only (design D6).

/** The path parameters of `POST /api/projects/{projectId}/impact`: the project id. */
export const impactParamsSchema = projectIdParamsSchema;

/** The path parameters of `POST /api/projects/{projectId}/impact`. */
export type ImpactParams = z.infer<typeof impactParamsSchema>;

/**
 * The body of `POST /api/projects/{projectId}/impact` (D6): a change of `MIN_CHANGE_CHARS` to
 * `MAX_CHANGE_CHARS` code points that is not only whitespace and holds no U+0000, and an optional hop
 * limit from 1 to `MAX_HOPS` (absent: the use case's default, forwarded only when sent). Any other key
 * is rejected. The `default` is documentation only: an absent field stays absent.
 */
export const impactBodySchema = z.strictObject({
  change: z
    .string()
    .min(MIN_CHANGE_CHARS)
    .max(MAX_CHANGE_CHARS)
    .refine((change) => change.trim() !== '', { message: 'change must not be only whitespace' })
    .refine(hasNoNul, { message: 'change must not contain U+0000' }),
  maxHops: z.int().min(1).max(MAX_HOPS).optional().meta({ default: DEFAULT_IMPACT_HOPS }),
});

/** The body of `POST /api/projects/{projectId}/impact`. */
export type ImpactBody = z.infer<typeof impactBodySchema>;

/** The risk levels of an answered report, as core's `RiskLevel` (checked below). */
const riskLevelSchema = z.literal(['HIGH', 'MEDIUM', 'LOW']);

/** The reason of an unknown report, as core's `ImpactUnknownReason` (checked below). */
const impactUnknownReasonSchema = z.literal('no-anchor');

/** Whether the types `A` and `B` are identical. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Accepts only `true`: a `false` argument is a compile error (TS2344), not a silent `never`. */
type Expect<T extends true> = T;

/**
 * Compile-time two-way check of the literals above against core's types (design D6): drift in either
 * direction makes `Equal` `false`, which `Expect` rejects, so `npm run typecheck` fails.
 */
export type ImpactLiteralsMatchCore = [
  Expect<Equal<z.infer<typeof riskLevelSchema>, RiskLevel>>,
  Expect<Equal<z.infer<typeof impactUnknownReasonSchema>, ImpactUnknownReason>>,
];

/** A component of `direct` or `indirect` (D1): its symbol and file, where it comes from, how sure the edge is and the hops. */
const impactEntrySchema = z.object({
  symbol: z.string(),
  file: z.string(),
  origin: z.literal('graph'),
  resolution: z.literal(EDGE_RESOLUTIONS),
  hops: z.int(),
});

/** A test that covers the change (D1). */
const impactTestSchema = z.object({
  symbol: z.string(),
  file: z.string(),
  origin: z.literal('graph'),
});

/** A document that describes code of the report: `staleSince` (the full sha) only on a stale one (D1). */
const impactDocSchema = z.union([
  z.object({ path: z.string(), stale: z.literal(false) }),
  z.object({ path: z.string(), stale: z.literal(true), staleSince: z.string() }),
]);

/** A file co-changed with the anchor in the repository history, per file (D1). */
const impactHistorySchema = z.object({
  file: z.string(),
  coChangeRate: z.number(),
  prs: z.array(z.int()),
  origin: z.literal('git'),
});

/** The risk of an answered report. */
const impactRiskSchema = z.object({
  level: riskLevelSchema,
  rationale: z.string(),
});

/**
 * An answered report (D1): the core report without `events`. Response schemas are `z.object`, as
 * `/ask`: the serializer drops every undeclared key.
 */
export const impactAnsweredSchema = z.object({
  status: z.literal('answered'),
  direct: z.array(impactEntrySchema),
  indirect: z.array(impactEntrySchema),
  tests: z.array(impactTestSchema),
  docs: z.array(impactDocSchema),
  history: z.array(impactHistorySchema),
  risk: impactRiskSchema,
});

/** An answered report. */
export type ImpactAnswered = z.infer<typeof impactAnsweredSchema>;

/** An honest `unknown` (D2): the change anchors nothing. */
export const impactUnknownSchema = z.object({
  status: z.literal('unknown'),
  reason: impactUnknownReasonSchema,
});

/** An honest `unknown`. */
export type ImpactUnknown = z.infer<typeof impactUnknownSchema>;

/** The `200` body of `POST /api/projects/{projectId}/impact`: an `unknown` or an answered report. */
export const impactResponseSchema = z.union([impactUnknownSchema, impactAnsweredSchema]);

/** The `200` body of `POST /api/projects/{projectId}/impact`. */
export type ImpactResponse = z.infer<typeof impactResponseSchema>;
