import { z } from 'zod';

/**
 * The body of every error response (spec "Single error format"): `code` a stable string, `message`
 * the fixed message of that code, `details` always an object (`{}` when there is nothing to add).
 */
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

/** The body of an error response. */
export type ErrorBody = z.infer<typeof errorSchema>;

/**
 * The form of a project id the store accepts: 8-4-4-4-12 hexadecimal digits, any letter case (D8).
 * Both cases are spelt out instead of the `i` flag, which the OpenAPI document would not publish.
 */
const PROJECT_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The path parameters of every `/api/projects/{projectId}/...` route: the project id. */
export const projectIdParamsSchema = z.object({
  projectId: z.string().regex(PROJECT_ID_PATTERN).meta({ format: 'uuid' }),
});

/** The body of `GET /health`. */
export const healthResponseSchema = z.object({ status: z.literal('ok') });
