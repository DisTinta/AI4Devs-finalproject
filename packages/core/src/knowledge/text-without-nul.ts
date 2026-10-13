import { z } from 'zod';

// One check for U+0000 in every free text of a claim, an evidence or a model output (DIS-39 design
// D3). Postgres rejects the character in `text` and `jsonb`, so a value holding it is rejected here
// rather than stripped: stripping would rewrite untrusted output and stored evidence silently.

/** Whether `text` holds no U+0000 character. */
export function hasNoNul(text: string): boolean {
  return !text.includes('\u0000');
}

/**
 * A string without U+0000. Its failure is a `custom` issue, so the quarantine reports it as
 * `invalid_shape`. Chain length checks before it with {@link withoutNul} when a string has limits.
 */
export const textWithoutNul = withoutNul(z.string());

/**
 * Adds the U+0000 check to a string schema, keeping its other checks.
 *
 * @param schema The string schema to refine.
 */
export function withoutNul(schema: z.ZodString): z.ZodString {
  return schema.refine(hasNoNul, { message: 'text must not contain U+0000' });
}
