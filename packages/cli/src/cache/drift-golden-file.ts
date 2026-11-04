import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { storedDriftReportSchema } from '@codemind/core';
import type { StoredDriftReport } from '@codemind/core';
import { fingerprint } from '../seed/fingerprint.js';
import type { FingerprintInput } from '../seed/fingerprint.js';
import { readGoldenFile } from './golden-file.js';
import type { GoldenFileRead } from './golden-file.js';

// The versioned golden drift report of a sample project (DIS-73 design D5, P2): the shape of its file,
// its canonical render and its fingerprint. It lives apart from `golden-file.ts` because the `explain`
// golden format only holds `explain` responses (`golden-answers` allows no other file in `seeds/cache/`).

/** The golden drift report: the project, the id of its demo-question row and its answer cache key. */
export const DRIFT_GOLDEN = { project: 'acme-shop', id: 'Q5', key: 'drift:' } as const;

/** A review of the golden drift report: who reviewed it and when. */
export interface DriftGoldenReview {
  /** Who reviewed the report. */
  by: string;
  /** The day of the review, `YYYY-MM-DD`. */
  date: string;
}

/** One golden drift entry: its id, its answer cache key and the stored report the cache serves. */
export interface DriftGoldenEntry {
  /** The demo-question id, `Q` followed by digits. */
  id: string;
  /** The answer cache key: `drift:` alone or followed by a document path. */
  key: string;
  /** The stored drift report. */
  response: StoredDriftReport;
  /** The reviews of the report; empty until someone signs it. */
  reviews: DriftGoldenReview[];
}

/** A golden drift file: the golden drift reports of one sample project and what they were built from. */
export interface DriftGoldenFile {
  /** The format version; only `1` exists. */
  format: 1;
  /** The sample project's name. */
  project: string;
  /** The header fingerprints of the seed the report was built on. */
  seed: { analyzerFingerprint: string; contractFingerprint: string };
  /** The drift fingerprint of the code that produced the report ({@link driftFingerprint}). */
  driftFingerprint: string;
  /** The answer and verification models of the build. */
  generatedWith: { model: string; verifyModel: string };
  /** The golden entries. */
  entries: DriftGoldenEntry[];
}

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** Whether `value` (already `YYYY-MM-DD`) names a day of the calendar: `2026-02-30` does not. */
function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A `drift:` key: alone, or followed by a path of 1 to 1,000 code points without U+0000. */
function isDriftKey(key: string): boolean {
  if (!key.startsWith('drift:')) return false;
  const path = key.slice('drift:'.length);
  return path === '' || ([...path].length <= 1_000 && !path.includes('\u0000'));
}

/**
 * The shape of a golden drift file: every object strict, its keys in the order of the format, every
 * fingerprint `sha256:` and 64 lowercase hexadecimal digits, a review date a real `YYYY-MM-DD` day, and
 * every `response` a stored drift report (`storedDriftReportSchema`, the rule the core reads it with).
 */
export const driftGoldenFileSchema = z.strictObject({
  format: z.literal(1),
  project: z.string().min(1),
  seed: z.strictObject({ analyzerFingerprint: fingerprintSchema, contractFingerprint: fingerprintSchema }),
  driftFingerprint: fingerprintSchema,
  generatedWith: z.strictObject({ model: z.string().min(1), verifyModel: z.string().min(1) }),
  entries: z.array(
    z.strictObject({
      id: z.string().regex(/^Q[0-9]+$/),
      key: z.string().refine(isDriftKey),
      response: storedDriftReportSchema,
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
 * The canonical render of a golden drift file: its JSON text with two-space indentation, the keys of
 * every object in the order of the format (the keys of each `response`, and of every object inside it,
 * in the order of the drift report), LF line endings and one final line feed. A value whose keys were
 * inserted in another order renders the same.
 *
 * @param file A golden drift file.
 * @returns The text to write.
 * @throws Error when `file` is not a golden drift file.
 */
export function renderDriftGoldenFile(file: DriftGoldenFile): string {
  return `${JSON.stringify(driftGoldenFileSchema.parse(file), null, 2)}\n`;
}

/** What a golden drift file is checked against: the seed it is loaded with and its own file name. */
export interface DriftGoldenFileContext {
  /** The names of the seed's projects. */
  seedProjectNames: readonly string[];
  /** The golden drift file's name, which must be `<project>.json`. */
  fileName: string;
}

/**
 * Checks a value read from a golden drift file: the shape of the format (the responses included), the
 * file named `<project>.json` after a project of the seed, and no repeated `id` nor `key`. It reports no
 * reason, so no part of the file can reach a message.
 *
 * @param value The parsed JSON.
 * @param context The seed's project names and the file name.
 * @returns The golden drift file, typed, or `undefined` when any check fails.
 */
export function checkDriftGoldenFile(value: unknown, context: DriftGoldenFileContext): DriftGoldenFile | undefined {
  const parsed = driftGoldenFileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const file = parsed.data;
  if (context.fileName !== `${file.project}.json` || !context.seedProjectNames.includes(file.project)) return undefined;
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const entry of file.entries) {
    if (ids.has(entry.id) || keys.has(entry.key)) return undefined;
    ids.add(entry.id);
    keys.add(entry.key);
  }
  return file;
}

/**
 * Reads a golden drift file and parses its JSON, without checking it ({@link checkDriftGoldenFile}).
 *
 * @param path The file.
 * @returns The parsed JSON; `missing` when the file cannot be read, `invalid` when it is not JSON.
 */
export function readDriftGoldenFile(path: string): GoldenFileRead {
  return readGoldenFile(path);
}

/**
 * The repository files whose content decides the golden drift report beyond the seed (DIS-73 design D8):
 * the drift prompts, quarantine, claim extraction, confrontation and report shapes, the stored report
 * schema, the sanitiser and untrusted-text rules, and the verification prompt and policy. The final
 * JSDoc of `drift-report.ts` and `drift-cache.ts` is written before the golden is generated.
 */
export const DRIFT_FINGERPRINT_FILES: readonly string[] = [
  'packages/core/src/drift/drift-prompts.ts',
  'packages/core/src/drift/drift-quarantine.ts',
  'packages/core/src/drift/doc-claims.ts',
  'packages/core/src/drift/contradiction.ts',
  'packages/core/src/drift/drift-report.ts',
  'packages/core/src/drift/drift-cache.ts',
  'packages/core/src/explain/sanitize.ts',
  'packages/core/src/explain/untrusted-text.ts',
  'packages/core/src/verify/verify-prompt.ts',
  'packages/core/src/verify/policy.ts',
];

/**
 * Reads the inputs of the drift fingerprint from the working tree at `repoRoot`, in the order of
 * {@link DRIFT_FINGERPRINT_FILES}.
 *
 * @param repoRoot The repository root.
 * @returns One input per declared file: its repository path and its content.
 * @throws Error when a declared file cannot be read.
 */
export function collectDriftFingerprintInputs(repoRoot: string): FingerprintInput[] {
  return DRIFT_FINGERPRINT_FILES.map((path) => ({ path, content: readFileSync(join(repoRoot, path), 'utf8') }));
}

/**
 * The drift fingerprint of the code at `repoRoot`: the seed's fingerprint algorithm (path order, line
 * endings ignored, SHA-256) over {@link collectDriftFingerprintInputs}.
 *
 * @param repoRoot The repository root.
 * @returns `sha256:<64 lowercase hex>`.
 * @throws Error when a declared file cannot be read.
 */
export function driftFingerprint(repoRoot: string): string {
  return fingerprint(collectDriftFingerprintInputs(repoRoot));
}
