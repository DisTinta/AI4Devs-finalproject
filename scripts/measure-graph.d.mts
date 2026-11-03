/** Types of `scripts/measure-graph.mjs` for the typed tests (DIS-79 design D9). */
import type { Writable } from './env.mjs';

/** What `runMeasureGraph` needs; `root` defaults to the repository root. */
export interface MeasureGraphOptions {
  root?: string;
  stdout: Writable;
  stderr: Writable;
}

/** A `project` row of the seed with the number of its `edge` rows. */
export interface SeedProject {
  id: string;
  name: string;
  language: string;
  edgeCount: number;
}

/** A `file` row of the seed. */
export interface SeedFile {
  id: string;
  projectId: string;
  path: string;
}

/** A `symbol` row of the seed. */
export interface SeedSymbol {
  id: string;
  fileId: string;
  name: string;
  startLine: number;
  endLine: number;
}

/** An `edge` row of the seed. */
export interface SeedEdge {
  id: string;
  projectId: string;
  sourceSymbolId: string | null;
  sourceFileId: string | null;
  targetSymbolId: string | null;
  targetFileId: string | null;
  kind: string;
  resolution: string;
  extractor: string;
}

/** The graph a seed holds: its `analyzer-fingerprint` and the rows of four tables in seed order. */
export interface Seed {
  analyzerFingerprint: string | null;
  projects: SeedProject[];
  files: SeedFile[];
  symbols: SeedSymbol[];
  edges: SeedEdge[];
}

/** The structural problems of an annotation file (format 1, 50 sites, distinct ids); none when it is complete. */
export function checkAnnotations(fixture: string, text: string): string[];

/** Reads the graph of a seed in format 1; throws `seeds/graph-dump.sql:<line>: <reason>` for a malformed line. */
export function readSeed(sql: string): Seed;

/** An annotated site as the measurement reads it (the fields of `fixtures/annotations/*.callsites.json` it uses). */
export interface SiteInput {
  id: string;
  site: { file: string; line: number };
  form: string;
  call: string;
  expected: string;
  target: { file: string; symbol: string } | null;
}

/** The reference of an edge in the output: its target's file and symbol and its resolution. */
export interface EdgeReference {
  file: string;
  symbol: string;
  resolution: string;
}

/** The measurement of one annotated site. */
export interface SiteResult {
  id: string;
  call: string;
  site: { file: string; line: number };
  expected: string;
  outcome: 'tp' | 'fn' | 'fp' | 'tn';
  hit: { resolution: string; extractor: string } | null;
  attributedEdges: EdgeReference[];
  falsePositiveEdges: EdgeReference[];
}

/** The measures of one sample project. */
export interface ProjectMeasurement {
  fixture: string;
  language: string;
  positives: number;
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  trueNegatives: number;
  coverage: number | null;
  precision: number | null;
  resolutionAgreement: { agreed: number; of: number };
  callsEdges: { exact: number; heuristic: number };
  sites: SiteResult[];
}

/** The content of `docs/measurements/graph-quality.json`. */
export interface Measurement {
  formatVersion: 1;
  seed: { path: string; analyzerFingerprint: string | null };
  projects: ProjectMeasurement[];
}

/** The inputs of `measure`: the graph and one annotation file per project, in the order of the output. */
export interface MeasureInputs {
  seed: Seed;
  annotations: { fixture: string; language: string; sites: SiteInput[] }[];
}

/** One entry of `docs/measurements/annotation/agreement.json` as `formatAgreement` reads it. */
export interface AgreementLanguage {
  fixture: string;
  n: number;
  agreed: number;
  percent: number | null;
  kappa: number | null;
}

/** Measures every annotated project against the graph; throws when a project is not in the seed. */
export function measure(inputs: MeasureInputs): Measurement;

/** The text of `graph-quality.json`: two-space indentation and a final line feed. */
export function serialize(measurement: Measurement): string;

/** A ratio as Table 2 writes it (`77,4 % (24/31)`), or `no definida` when the denominator is 0. */
export function formatRatio(numerator: number, denominator: number): string;

/** The agreement line under Table 2, from one entry of `agreement.json`. */
export function formatAgreement(language: AgreementLanguage): string;

/** The names a site's call can reach (last identifier, constructor, or a read's property forms). */
export function calledNames(site: { call: string; form: string }, language: string): string[];

/** Runs the command and returns its exit code (0 success, 1 an input check failed, 2 usage error). */
export function runMeasureGraph(args: string[], options: MeasureGraphOptions): number;
