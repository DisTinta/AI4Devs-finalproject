/** Types of `scripts/answer-review.mjs` for the typed tests (DIS-82 design D10). */
import type { Writable } from './env.mjs';

/** One answer under review: the sample project and the question id (DIS-82 design P3). */
export interface ExpectedAnswer {
  project: string;
  questionId: string;
}

/** One answer of a reviewer output or of the resolution; `verdict` is checked by `validateReview`, so it is a string here. */
export interface ReviewAnswer {
  project: string;
  questionId: string;
  verdict: string;
  reason: string;
}

/** What `validateReview` needs: the role, the file number of a reviewer, the answers to give and the repository root. */
export interface ValidateReviewOptions {
  kind: 'reviewer' | 'resolution';
  number?: 1 | 2;
  expected: ExpectedAnswer[];
  root: string;
}

/** Validates a reviewer output or a resolution and returns every problem found (none when it is valid). */
export function validateReview(output: unknown, options: ValidateReviewOptions): string[];

/** One entry of `agreement.json` per sample project. */
export interface ProjectAgreement {
  fixture: string;
  n: number;
  agreed: number;
  percent: number | null;
  kappa: number | null;
  disagreements: string[];
}

/** The content of `docs/measurements/answer-review/agreement.json`. */
export interface ReviewAgreementResult {
  projects: ProjectAgreement[];
}

/** The inputs of `reviewAgreement`: the answers under review and the two reviewer outputs (reviewer 1 first). */
export interface ReviewAgreementInput {
  expected: ExpectedAnswer[];
  reviewers: [unknown, unknown];
}

/** The inputs of `mergeVerdicts`: the answers under review, the two reviewer outputs and the resolution. */
export interface MergeVerdictsInput {
  expected: ExpectedAnswer[];
  reviewers: [unknown, unknown];
  resolution: unknown;
}

/** The merge result: the problems found and, when there are none, the text of `verdicts.csv`. */
export interface MergeVerdictsResult {
  errors: string[];
  csv: string | null;
}

/** The verdict counts of a project and its agreement figures, as `formatReviewLine` writes them. */
export interface ReviewLineInput {
  fixture: string;
  correct: number;
  partial: number;
  incorrect: number;
  n: number;
  agreed: number;
  percent: number | null;
  kappa: number | null;
}

/** The agreement of the two reviewers per project (percent and Cohen's kappa over the three verdicts). */
export function reviewAgreement(input: ReviewAgreementInput): ReviewAgreementResult;

/** Merges the reviewer outputs and the resolution into the text of `verdicts.csv`, or reports why it cannot. */
export function mergeVerdicts(input: MergeVerdictsInput): MergeVerdictsResult;

/** Writes rows as RFC 4180 CSV: LF row ends and a final newline. */
export function toCsv(rows: string[][]): string;

/** The README and report line of one project: verdict counts and reviewer agreement. */
export function formatReviewLine(input: ReviewLineInput): string;

/** What `runAnswerReview` needs; `root` defaults to the repository root. */
export interface AnswerReviewOptions {
  root?: string;
  stdout: Writable;
  stderr: Writable;
}

/** The `<sha256>  <path>` line of each readable frozen file, in order, and a problem for each unreadable one. */
export function checkHashes(root: string): { lines: string[]; problems: string[] };

/** Runs one CLI command and returns its exit code. */
export function runAnswerReview(args: string[], options: AnswerReviewOptions): number;

/** Compares the hashes a report records under `## Hashes SHA-256` with the files under `root`; returns the problems. */
export function checkFreeze(report: string, root: string): string[];
