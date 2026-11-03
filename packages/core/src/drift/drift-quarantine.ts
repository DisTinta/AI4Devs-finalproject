import { MAX_MODEL_OUTPUT_BYTES } from '../explain/limits.js';
import type { SchemaViolationSubcode } from '../explain/schema-violation.js';

// The checks the two drift quarantines share (DIS-71 design D16): the size check, the fence
// unwrapping and JSON parse, and the subcode of a shape failure. Module-internal: `index.ts` does not
// re-export it. Nothing here keeps any part of the output: a discarded output is reported by its
// subcode alone.
//
// The fence rule is the one of `explain/statement-schema.ts` (DIS-72 design C9), repeated here and
// pinned equal by `tests/unit/drift/drift-quarantine.spec.ts`: that file is an input of the answer
// fingerprint of the golden answers (`cache/answer-fingerprint.ts`), so exporting its private helper
// would invalidate every golden answer and need a live `cache:build` (design Follow-up R16).

/**
 * The whole output as one fence, with only JSON whitespace (space, tab, CR, LF) around it: a
 * ```` ``` ```` line, optionally with the info string `json` in any case, the body, and a closing
 * ```` ``` ```` line; line breaks `\n` or `\r\n`. The same expression as `explain`'s.
 */
const FENCED_OUTPUT = /^[ \t\r\n]*```(?:json)?\r?\n([\s\S]*)\r?\n```[ \t\r\n]*$/i;

/**
 * The body of the one Markdown code fence that encloses the whole output, or the output itself when it
 * is not so fenced.
 *
 * @param text The model's raw output; untrusted.
 */
export function unfenceDriftOutput(text: string): string {
  return FENCED_OUTPUT.exec(text)?.[1] ?? text;
}

/** The subcodes a drift output can be discarded with before its shape is checked. */
type EarlySubcode = Extract<SchemaViolationSubcode, 'output_too_large' | 'invalid_json'>;

/**
 * Reads a model output as JSON: over `MAX_MODEL_OUTPUT_BYTES` UTF-8 bytes it is `output_too_large`;
 * one Markdown code fence enclosing the whole output is unwrapped; text that is not JSON is
 * `invalid_json`.
 *
 * @param text The model's raw output; untrusted.
 * @returns The parsed JSON, or the subcode of its discarding.
 */
export function parseDriftJson(text: string): { ok: true; json: unknown } | { ok: false; subcode: EarlySubcode } {
  if (Buffer.byteLength(text, 'utf8') > MAX_MODEL_OUTPUT_BYTES) return { ok: false, subcode: 'output_too_large' };
  try {
    return { ok: true, json: JSON.parse(unfenceDriftOutput(text)) };
  } catch {
    return { ok: false, subcode: 'invalid_json' };
  }
}

/**
 * The subcode of a failed shape check: `limit_exceeded` when every issue is a maximum exceeded,
 * `invalid_shape` otherwise.
 *
 * @param issues The validator's issues; only their codes are read.
 */
export function driftShapeSubcode(issues: readonly { code: string }[]): 'limit_exceeded' | 'invalid_shape' {
  return issues.every((issue) => issue.code === 'too_big') ? 'limit_exceeded' : 'invalid_shape';
}
