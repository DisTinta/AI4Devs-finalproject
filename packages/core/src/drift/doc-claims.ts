import { z } from 'zod';
import { estimateTokens } from '../context/tokenizer.js';
import { redactedLines, spanText } from '../context/span-text.js';
import { sanitizeForPrompt, TRUNCATION_LINE_CUT_MARK } from '../explain/sanitize.js';
import type { SchemaViolationSubcode } from '../explain/schema-violation.js';
import { withoutNul } from '../knowledge/text-without-nul.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { ContextSpan } from '../context/context-pack.js';
import { driftShapeSubcode, parseDriftJson } from './drift-quarantine.js';
import { buildExtractionPrompt } from './drift-prompts.js';
import { UNSTORED_FILE_ID } from './drift-report.js';
import type { DriftCheckEvent } from './drift-report.js';

// The extraction of the checkable claims of one document (DIS-71 design D3): one `answer` call over the
// document as redacted untrusted data, a strict quarantine of its output, then the claims that lie
// inside what was sent. Nothing is logged; the events hold codes, ids, a path and line numbers.

/** Most claims one extraction output may hold: an output with more is `limit_exceeded`. */
export const MAX_EXTRACTED_CLAIMS = 50;

/** Most claims of one document that are confronted with code; the rest are omitted. */
export const MAX_DOC_CLAIMS = 12;

/** Longest claim `text`, in Unicode code points. */
export const MAX_CLAIM_CHARS = 500;

/** The claims a model extracted: strict, so a stray field discards the output instead of vanishing. */
export const claimsOutputSchema = z.strictObject({
  claims: z
    .array(
      z
        .strictObject({
          text: withoutNul(z.string().min(1).max(MAX_CLAIM_CHARS)),
          startLine: z.int().min(1),
          endLine: z.int().min(1),
        })
        .refine((claim) => claim.endLine >= claim.startLine),
    )
    .max(MAX_EXTRACTED_CLAIMS),
});

/** A claim as the model extracted it. */
export type ExtractedClaim = z.infer<typeof claimsOutputSchema>['claims'][number];

/** The result of checking an extraction output: the claims, or the subcode of its discarding. */
export type ClaimsOutputResult = { ok: true; claims: ExtractedClaim[] } | { ok: false; subcode: SchemaViolationSubcode };

/**
 * Checks an extraction output against the quarantine, in this order: size, fence and JSON, shape. The
 * output is never interpreted and a failure discards it whole.
 *
 * @param text The model's raw output; untrusted.
 */
export function parseClaimsOutput(text: string): ClaimsOutputResult {
  const json = parseDriftJson(text);
  if (!json.ok) return json;
  const parsed = claimsOutputSchema.safeParse(json.json);
  if (!parsed.success) return { ok: false, subcode: driftShapeSubcode(parsed.error.issues) };
  return { ok: true, claims: parsed.data.claims };
}

/** A claim to confront, with the redacted text of its lines. */
export interface DocClaim extends ExtractedClaim {
  /** The redacted text of lines `startLine..endLine`, all of them sent whole. */
  excerpt: string;
}

/** The extraction of one document. */
export type Extraction =
  | {
      /** The output was discarded: the document is not checked. */
      status: 'skipped';
      /** Why it was discarded. */
      subcode: SchemaViolationSubcode;
      /** The sanitisation events of the prompt. */
      events: DriftCheckEvent[];
    }
  | {
      /** The output passed the quarantine. */
      status: 'extracted';
      /** The claims to confront, at most `MAX_DOC_CLAIMS`, in the model's order. */
      claims: DocClaim[];
      /** The claims beyond `MAX_DOC_CLAIMS`. */
      omitted: number;
      /** The claims beyond the last line sent whole. */
      dropped: number;
      /** The sanitisation events of the prompt. */
      events: DriftCheckEvent[];
    };

/**
 * Extracts the claims of one document with one `answer` call. The content is redacted as the indexing
 * redacts it, turned into one whole-file span of kind `doc` and sanitised (cut at
 * `MAX_EVIDENCE_TEXT_CHARS` at a line boundary, flagged); its events carry the evidence id `D1`. A claim
 * ending after the last line sent whole is dropped; a document whose first line alone exceeds the limit
 * has no line sent whole, so every claim of it is dropped. Of the others, the first `MAX_DOC_CLAIMS` are
 * returned and the rest counted as omitted.
 *
 * @param llm The model; its `answer` purpose is called once.
 * @param document The document's path and content as read at the indexed commit.
 * @throws Any failure of the `answer` call, unchanged.
 */
export async function extractClaims(llm: LlmPort, document: { path: string; content: string }): Promise<Extraction> {
  const { path } = document;
  const { lines } = redactedLines(path, document.content);
  const text = spanText(lines, 1, lines.length);
  const span: ContextSpan = {
    path,
    fileId: UNSTORED_FILE_ID,
    fileKind: 'doc',
    startLine: 1,
    endLine: lines.length,
    text,
    tokens: estimateTokens(text),
    distance: 0,
    origin: 'anchor',
  };
  const sanitized = sanitizeForPrompt('', [span]);
  const [kept] = sanitized.spans;
  // `sanitizeForPrompt` names its only span `E1`; in every drift event the document is `D1`.
  const events: DriftCheckEvent[] = sanitized.events.map((event) => ({
    type: 'drift_check_event',
    docPath: path,
    event: 'evidenceId' in event ? { ...event, evidenceId: 'D1' } : event,
  }));
  const prompt = buildExtractionPrompt(path, kept);
  const result = await llm.complete({ messages: prompt.messages, purpose: 'answer' });
  const parsed = parseClaimsOutput(result.text);
  if (!parsed.ok) return { status: 'skipped', subcode: parsed.subcode, events };

  // A cut inside the first line leaves no line sent whole.
  const lastWholeLine = kept.truncation?.mark === TRUNCATION_LINE_CUT_MARK ? 0 : kept.endLine;
  const inside = parsed.claims.filter((claim) => claim.endLine <= lastWholeLine);
  const confronted = inside.slice(0, MAX_DOC_CLAIMS).map((claim) => ({
    ...claim,
    excerpt: spanText(lines, claim.startLine, claim.endLine),
  }));
  return {
    status: 'extracted',
    claims: confronted,
    omitted: inside.length - confronted.length,
    dropped: parsed.claims.length - inside.length,
    events,
  };
}
