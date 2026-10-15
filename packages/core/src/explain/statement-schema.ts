import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  MAX_ANSWER_CHARS,
  MAX_EVENT_ISSUES,
  MAX_EVIDENCE_IDS_PER_STATEMENT,
  MAX_MODEL_OUTPUT_BYTES,
  MAX_STATEMENT_CHARS,
  MAX_STATEMENTS,
} from './limits.js';
import { withoutNul } from '../knowledge/text-without-nul.js';
import type { SchemaViolationEvent, SchemaViolationIssue, SchemaViolationSubcode } from './schema-violation.js';

// The quarantine of a model output (DIS-38 design D3). The output is untrusted text: it is checked,
// never interpreted, and any failure discards it whole. Every object is a strict object, because
// Zod 4's `z.object()` strips unknown keys silently and a `type` or `note` field must discard the
// output, not vanish. The model never decides a statement's type: there is no `type` field. No string
// may hold U+0000 (DIS-39 design D3): Postgres rejects it, and stripping it would rewrite the output.
// One Markdown code fence enclosing the whole output is unwrapped before parsing (DIS-72 design C9):
// some models fence their JSON; any other text around it still fails as `invalid_json`.

/**
 * The whole output as one fence, with only JSON whitespace (space, tab, CR, LF) around it: a
 * ```` ``` ```` line, optionally with the info string `json` in any case, the body, and a closing
 * ```` ``` ```` line; line breaks `\n` or `\r\n`. Anchored at both ends, one unbounded group.
 */
const FENCED_OUTPUT = /^[ \t\r\n]*```(?:json)?\r?\n([\s\S]*)\r?\n```[ \t\r\n]*$/i;

/** The output a model must return: an answer and the statements that back it, each citing evidence ids. */
export const modelOutputSchema = z.strictObject({
  answer: withoutNul(z.string().min(1).max(MAX_ANSWER_CHARS)),
  statements: z
    .array(
      z.strictObject({
        text: withoutNul(z.string().min(1).max(MAX_STATEMENT_CHARS)),
        evidenceIds: z.array(withoutNul(z.string())).min(1).max(MAX_EVIDENCE_IDS_PER_STATEMENT),
      }),
    )
    .max(MAX_STATEMENTS),
});

/** A model output that passed the quarantine. */
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** The result of checking a model output: the output, or the event of its discarding. */
export type ModelOutputResult = { ok: true; output: ModelOutput } | { ok: false; event: SchemaViolationEvent };

/**
 * Checks a model output against the quarantine and returns it, or the audit event of its discarding.
 * The JSON is the whole output or the body of one Markdown code fence enclosing it; the size check and
 * the event use the output as received. Writes nothing to any log.
 *
 * @param text The model's raw output; untrusted.
 * @param knownEvidenceIds The evidence ids given to the model in the prompt.
 */
export function parseModelOutput(text: string, knownEvidenceIds: ReadonlySet<string>): ModelOutputResult {
  if (Buffer.byteLength(text, 'utf8') > MAX_MODEL_OUTPUT_BYTES) return discard(text, 'output_too_large', []);

  let json: unknown;
  try {
    json = JSON.parse(unfenced(text));
  } catch {
    // No issue entry: the parser's message may quote the output.
    return discard(text, 'invalid_json', []);
  }

  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    // Only the path and the code of each issue: the message, `keys`, `input` and any value can carry
    // text the model produced. Paths hold only schema field names and array indices.
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }));
    return discard(text, shapeSubcode(issues), issues);
  }

  const repeated = repeatedEvidenceId(parsed.data);
  if (repeated) return discard(text, 'duplicate_evidence_id', [repeated]);

  const unknown = unknownEvidenceIds(parsed.data, knownEvidenceIds);
  if (unknown.length > 0) return discard(text, 'unknown_evidence_id', unknown);

  return { ok: true, output: parsed.data };
}

/** The body of the one fence that encloses the whole output, or the output itself when it is not so fenced. */
function unfenced(text: string): string {
  return FENCED_OUTPUT.exec(text)?.[1] ?? text;
}

/** `empty_evidence` when every issue is an empty `evidenceIds`, `limit_exceeded` when every issue is a limit, else `invalid_shape`. */
function shapeSubcode(issues: readonly SchemaViolationIssue[]): SchemaViolationSubcode {
  if (issues.every((issue) => issue.code === 'too_small' && issue.path.endsWith('.evidenceIds'))) return 'empty_evidence';
  if (issues.every((issue) => issue.code === 'too_big')) return 'limit_exceeded';
  return 'invalid_shape';
}

/** The first evidence id a statement cites twice, at the position of its repetition. */
function repeatedEvidenceId(output: ModelOutput): SchemaViolationIssue | undefined {
  for (const [i, statement] of output.statements.entries()) {
    const seen = new Set<string>();
    for (const [j, id] of statement.evidenceIds.entries()) {
      if (seen.has(id)) return { path: `statements.${i}.evidenceIds.${j}`, code: 'duplicate_evidence_id' };
      seen.add(id);
    }
  }
  return undefined;
}

/** One issue per cited evidence id that was not given to the model. */
function unknownEvidenceIds(output: ModelOutput, known: ReadonlySet<string>): SchemaViolationIssue[] {
  return output.statements.flatMap((statement, i) =>
    statement.evidenceIds.flatMap((id, j) =>
      known.has(id) ? [] : [{ path: `statements.${i}.evidenceIds.${j}`, code: 'unknown_evidence_id' }],
    ),
  );
}

/** The result of discarding `text`, with its size and hash and at most `MAX_EVENT_ISSUES` of the given issues. */
function discard(text: string, subcode: SchemaViolationSubcode, issues: SchemaViolationIssue[]): ModelOutputResult {
  return {
    ok: false,
    event: {
      type: 'schema_violation',
      stage: 'l2_inference',
      subcode,
      outputBytes: Buffer.byteLength(text, 'utf8'),
      outputSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      issues: issues.slice(0, MAX_EVENT_ISSUES),
      issueCount: issues.length,
    },
  };
}
