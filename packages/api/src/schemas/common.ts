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

/** The body of `GET /health`. */
export const healthResponseSchema = z.object({ status: z.literal('ok') });
