import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { normalizeQuestion, parseStoredResponse } from '@codemind/core';
import type { StoredResponse } from '@codemind/core';

// The versioned golden answers of a sample project (DIS-26 design C2, decisions D9 and D10): the
// shape of a golden file and its canonical render.

/** A review of a golden answer, filled by the independent agent panel of the current round, DIS-42 r3 (`agent:<model>`): who reviewed it and when. */
export interface GoldenReview {
  /** Who reviewed the answer. */
  by: string;
  /** The day of the review, `YYYY-MM-DD`. */
  date: string;
}

/** One golden answer: the demo question and the stored response the answer cache serves for it. */
export interface GoldenEntry {
  /** The demo question id, `Q` followed by digits. */
  id: string;
  /** The question, as the demo-question table writes it. */
  question: string;
  /** The answer cache key of the question (`normalizeQuestion`). */
  questionNormalized: string;
  /** The stored response the answer cache keeps for the answer. */
  response: StoredResponse;
  /** The reviews of the answer: the two panel signatures of the current round (DIS-42 r3), empty until the panel signs it (or when it judged it incorrect). */
  reviews: GoldenReview[];
}

/** A golden file: the golden answers of one sample project and what they were built from. */
export interface GoldenFile {
  /** The format version; only `1` exists. */
  format: 1;
  /** The sample project's name. */
  project: string;
  /** The header fingerprints of the seed the answers were built on. */
  seed: { analyzerFingerprint: string; contractFingerprint: string };
  /** The answer fingerprint of the code that produced the answers (`answerFingerprint`). */
  answerFingerprint: string;
  /** The answer and verification models of the build. */
  generatedWith: { model: string; verifyModel: string };
  /** One entry per golden question, in golden order. */
  entries: GoldenEntry[];
}

const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;

const fingerprintSchema = z.string().regex(FINGERPRINT);

/** Whether `value` (already `YYYY-MM-DD`) names a day of the calendar: `2026-02-30` does not. */
function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The shape of a golden file (decision D9): every object strict, its keys in the order of the format,
 * every fingerprint `sha256:` and 64 lowercase hexadecimal digits, a review date a real `YYYY-MM-DD`
 * day. The `response` of an entry is not checked here: {@link checkGoldenFile} checks it as the answer
 * cache does.
 */
export const goldenFileSchema = z.strictObject({
  format: z.literal(1),
  project: z.string().min(1),
  seed: z.strictObject({ analyzerFingerprint: fingerprintSchema, contractFingerprint: fingerprintSchema }),
  answerFingerprint: fingerprintSchema,
  generatedWith: z.strictObject({ model: z.string().min(1), verifyModel: z.string().min(1) }),
  entries: z.array(
    z.strictObject({
      id: z.string().regex(/^Q[0-9]+$/),
      question: z.string().min(1),
      questionNormalized: z.string(),
      response: z.unknown(),
      reviews: z.array(
        z.strictObject({
          by: z.string().min(1),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine(isCalendarDate),
        }),
      ),
    }),
  ),
});

/**
 * The canonical render of a golden file (decision D10): its JSON text with two-space indentation, the
 * keys of every object in the order of the format, the keys of each `response` in the order the
 * answer cache stores them, LF line endings and one final line feed. A value whose keys were inserted
 * in another order renders the same.
 *
 * @param file A golden file whose every response the answer cache accepts.
 * @returns The text to write.
 * @throws Error when `file` is not a golden file.
 */
export function renderGoldenFile(file: GoldenFile): string {
  const ordered = goldenFileSchema.parse(file);
  const entries = ordered.entries.map((entry) => {
    const response = parseStoredResponse(entry.response);
    if (response === undefined) throw new Error(`renderGoldenFile: the response of ${entry.id} is not a stored response`);
    return { ...entry, response };
  });
  return `${JSON.stringify({ ...ordered, entries }, null, 2)}\n`;
}

/** What a golden file is checked against: the seed it is loaded with and its own file name. */
export interface GoldenFileContext {
  /** The names of the seed's projects. */
  seedProjectNames: readonly string[];
  /** The golden file's name, which must be `<project>.json`. */
  fileName: string;
}

/**
 * Checks a value read from a golden file (design C2): the shape of the format; the file named
 * `<project>.json` after a project of the seed; per entry, `questionNormalized` equal to the
 * normalized `question`, no repeated `id` nor `questionNormalized`, and a `response` the answer cache
 * accepts as a stored answered response. It reports no reason, so no part of the file can reach a
 * message.
 *
 * @param value The parsed JSON.
 * @param context The seed's project names and the file name.
 * @returns The golden file, typed, or `undefined` when any check fails.
 */
export function checkGoldenFile(value: unknown, context: GoldenFileContext): GoldenFile | undefined {
  const parsed = goldenFileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const file = parsed.data;
  if (context.fileName !== `${file.project}.json` || !context.seedProjectNames.includes(file.project)) return undefined;
  const ids = new Set<string>();
  const keys = new Set<string>();
  const entries: GoldenEntry[] = [];
  for (const entry of file.entries) {
    const response = parseStoredResponse(entry.response);
    if (response?.kind !== 'answered') return undefined;
    if (entry.questionNormalized !== normalizeQuestion(entry.question)) return undefined;
    if (ids.has(entry.id) || keys.has(entry.questionNormalized)) return undefined;
    ids.add(entry.id);
    keys.add(entry.questionNormalized);
    entries.push({ ...entry, response });
  }
  return { ...file, entries };
}

/** A golden file read from disk: its parsed JSON, or why it could not be read. */
export type GoldenFileRead = { ok: true; value: unknown } | { ok: false; reason: 'missing' | 'invalid' };

/**
 * Reads a golden file and parses its JSON, without checking it ({@link checkGoldenFile}).
 *
 * @param path The file.
 * @returns The parsed JSON; `missing` when the file cannot be read, `invalid` when it is not JSON.
 */
export function readGoldenFile(path: string): GoldenFileRead {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, reason: 'missing' };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
