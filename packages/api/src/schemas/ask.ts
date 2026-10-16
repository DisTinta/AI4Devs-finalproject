import { z } from 'zod';
import {
  hasNoNul,
  PROVENANCE_STATEMENT_TYPES,
  STATEMENT_VERIFICATIONS,
  TOKEN_BUDGET_DEFAULT,
  TOKEN_BUDGET_MAX,
  TOKEN_BUDGET_MIN,
  TOKEN_ESTIMATOR,
  UNKNOWN_REASONS,
} from '@codemind/core';

// The payload of `POST /api/projects/{projectId}/ask` (DIS-78 design U1, U2): the only description
// of it. Limits and closed sets come from `@codemind/core`, never copied (backend-standards §4).

/** Fewest Unicode code points of a question (`readme.md` §4). */
const QUESTION_MIN = 5;

/** Most Unicode code points of a question (`readme.md` §4). */
const QUESTION_MAX = 500;

/**
 * The form of a project id the store accepts: 8-4-4-4-12 hexadecimal digits, any letter case (D8).
 * Both cases are spelt out instead of the `i` flag, which the OpenAPI document would not publish.
 */
const PROJECT_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The path parameters of `POST /api/projects/{projectId}/ask`: the project id (D8). */
export const askParamsSchema = z.object({
  projectId: z.string().regex(PROJECT_ID_PATTERN).meta({ format: 'uuid' }),
});

/** The path parameters of `POST /api/projects/{projectId}/ask`. */
export type AskParams = z.infer<typeof askParamsSchema>;

/**
 * The body of `POST /api/projects/{projectId}/ask` (D1, D2): a question of 5 to 500 code points that is
 * not only whitespace and holds no U+0000; an optional token budget within the context pack's limits
 * (absent: the use case's default); an optional cache flag (absent: the use case's default, `true`),
 * forwarded to the use case only when sent (DIS-21). Any other key is rejected. The `default`s are documentation only: an absent
 * field stays absent.
 */
export const askBodySchema = z.strictObject({
  question: z
    .string()
    .min(QUESTION_MIN)
    .max(QUESTION_MAX)
    .refine((question) => question.trim() !== '', { message: 'question must not be only whitespace' })
    .refine(hasNoNul, { message: 'question must not contain U+0000' }),
  tokenBudget: z.int().min(TOKEN_BUDGET_MIN).max(TOKEN_BUDGET_MAX).optional().meta({ default: TOKEN_BUDGET_DEFAULT }),
  useCache: z
    .boolean()
    .optional()
    .meta({
      default: true,
      description:
        'Whether to answer from the answer cache of the project when it holds the question (exact match of its normalized form). ' +
        'false skips the lookup and asks the model; the new answer still replaces the cached one.',
    }),
});

/** The body of `POST /api/projects/{projectId}/ask`. */
export type AskBody = z.infer<typeof askBodySchema>;

/** The usage of an answered question (`readme.md` §4): exactly the fields of core's `AnswerUsage`. */
export const askUsageSchema = z.object({
  inputTokens: z.int(),
  outputTokens: z.int(),
  baselineTokens: z.int(),
  baselineEstimator: z.literal(TOKEN_ESTIMATOR),
  savingsPct: z.number(),
  costUsd: z.number(),
  latencyMs: z.int(),
  cacheHit: z.boolean(),
  generation: z.object({ inputTokens: z.int(), outputTokens: z.int(), costUsd: z.number() }),
  verification: z.object({
    calls: z.int(),
    cacheHits: z.int(),
    inputTokens: z.int(),
    outputTokens: z.int(),
    costUsd: z.number(),
    latencyMs: z.int(),
  }),
});

/** The usage of an answered question. */
export type AskUsage = z.infer<typeof askUsageSchema>;

/**
 * An answered question (D3): the answer, its typed statements citing public evidence ids, the cited
 * evidence (`ev-1`, `ev-2`… in evidence order), the confidence and the usage. No internal field.
 */
export const askAnsweredSchema = z.object({
  answer: z.string(),
  statements: z.array(
    z.object({
      text: z.string(),
      type: z.literal(PROVENANCE_STATEMENT_TYPES),
      verification: z.literal(STATEMENT_VERIFICATIONS),
      evidenceIds: z.array(z.string()),
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      startLine: z.int(),
      endLine: z.int(),
      excerpt: z.string(),
    }),
  ),
  confidence: z.number(),
  usage: askUsageSchema,
});

/** An answered question. */
export type AskAnswered = z.infer<typeof askAnsweredSchema>;

/**
 * An honest `UNKNOWN` (D7): the reason, the message only for `llm-required`, and no statement nor
 * evidence. `z.array(z.never()).max(0)` rather than `z.tuple([])`, whose OpenAPI 3.0 form is an empty
 * `anyOf`.
 */
export const askUnknownSchema = z.object({
  answer: z.literal('UNKNOWN'),
  reason: z.literal(UNKNOWN_REASONS),
  message: z.string().optional(),
  statements: z.array(z.never()).max(0),
  evidence: z.array(z.never()).max(0),
});

/** An honest `UNKNOWN`. */
export type AskUnknown = z.infer<typeof askUnknownSchema>;

/** The `200` body of `POST /api/projects/{projectId}/ask`: an `UNKNOWN` or an answered question. */
export const askResponseSchema = z.union([askUnknownSchema, askAnsweredSchema]);

/** The `200` body of `POST /api/projects/{projectId}/ask`. */
export type AskResponse = z.infer<typeof askResponseSchema>;
