/** Types of `scripts/annotation-agreement.mjs` for the typed tests (DIS-80 design D10). */
import type { Writable } from './env.mjs';

/** The target of an answer: a file of the fixture and a symbol declared in it. */
export interface Target {
  file: string;
  symbol: string;
}

/** One answer of a panelist or of the resolver; `expected` is checked by `validateOutput`, so it is a string here. */
export interface Answer {
  id: string;
  target: Target | null;
  expected: string;
  reason: string;
}

/** One call site of a site list (`docs/measurements/annotation/*.sites.json`). */
export interface Site {
  id: string;
  control: boolean;
  site: { file: string; line: number };
  form: string;
  call: string;
  source: { symbol: string } | { file: string };
}

/** A site list: the sites of one sample project. */
export interface SiteList {
  fixture: string;
  language: string;
  sites: Site[];
}

/** A site id the output has to answer, with the sample project it belongs to. */
export interface ExpectedSite {
  id: string;
  fixture: string;
}

/** What `validateOutput` needs: the role, the file number of a panelist, the ids to answer and the repository root. */
export interface ValidateOptions {
  kind: 'panelist' | 'resolution';
  number?: 1 | 2;
  expected: ExpectedSite[];
  root: string;
}

/** One entry of `agreement.json` per panelist: the agreement with the control reference. */
export interface ControlAgreement {
  panelist: number;
  n: number;
  agreed: number;
  percent: number | null;
  kappa: number | null;
  indicative: true;
}

/** One entry of `agreement.json` per sample project. */
export interface LanguageAgreement {
  fixture: string;
  n: number;
  agreed: number;
  percent: number | null;
  kappa: number | null;
  disagreements: string[];
  control: ControlAgreement[];
}

/** The content of `docs/measurements/annotation/agreement.json`. */
export interface AgreementResult {
  languages: LanguageAgreement[];
}

/** The inputs of `agreement`: the site lists, the two panel outputs (panelist 1 first) and the control reference. */
export interface AgreementInput {
  siteLists: SiteList[];
  panelists: [unknown, unknown];
  control: unknown;
}

/** The inputs of `mergeAnnotations`. */
export interface MergeInput {
  siteLists: SiteList[];
  panelists: [unknown, unknown];
  resolution: unknown;
}

/** The merge result: the problems found and, when there are none, the text of each file by repository path. */
export interface MergeResult {
  errors: string[];
  files: Record<string, string>;
}

/** What `runAnnotationAgreement` needs; `root` defaults to the repository root. */
export interface AnnotationAgreementOptions {
  root?: string;
  stdout: Writable;
  stderr: Writable;
}

/** Validates a panelist output or a resolution and returns every problem found (none when it is valid). */
export function validateOutput(output: unknown, options: ValidateOptions): string[];

/** Cohen's kappa, three decimals half away from zero, or `null` when the expected agreement is 1. */
export function cohenKappa(first: string[], second: string[]): number | null;

/** The agreement of the two panelists per language and with the control reference. */
export function agreement(input: AgreementInput): AgreementResult;

/** Merges the panel outputs and the resolution into the two annotation files, or reports why it cannot. */
export function mergeAnnotations(input: MergeInput): MergeResult;

/** The SHA-256 of `bytes`, in lower-case hex. */
export function sha256(bytes: Uint8Array | string): string;

/** Compares the hashes a report records under `## Hashes SHA-256` with the files under `root`; returns the problems. */
export function checkFreeze(report: string, root: string): string[];

/** Runs one CLI command and returns its exit code. */
export function runAnnotationAgreement(args: string[], options: AnnotationAgreementOptions): number;
