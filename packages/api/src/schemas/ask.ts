import { z } from 'zod';
import { hasNoNul, TOKEN_BUDGET_DEFAULT, TOKEN_BUDGET_MAX, TOKEN_BUDGET_MIN } from '@codemind/core';

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
 * (absent: the use case's default); an optional cache flag, accepted and without effect until the
 * answer cache exists. Any other key is rejected. The `default`s are documentation only: an absent
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
  useCache: z.boolean().optional().meta({ default: true }),
});

/** The body of `POST /api/projects/{projectId}/ask`. */
export type AskBody = z.infer<typeof askBodySchema>;
