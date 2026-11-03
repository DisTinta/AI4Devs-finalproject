/** Types of `scripts/measure-context.mjs` for the typed tests (DIS-81 design D9). */
import type { Send } from './demo-ask.mjs';
import type { Writable } from './env.mjs';

/** What `runMeasureContext` needs; `root`, `dotenvPath`, `send` and `now` have defaults. */
export interface MeasureContextOptions {
  root?: string;
  env: Record<string, string | undefined>;
  dotenvPath?: string;
  send?: Send;
  now?: () => Date;
  stdout: Writable;
  stderr: Writable;
}

/** The recorded Ollama run (`raw/run.json`). */
export interface RunRecord {
  formatVersion: 1;
  startedAt: string;
  ollamaVersion: string;
  model: string;
  modelDigest: string;
  verifyModel: string;
}

/** One question of the question file. */
export interface QuestionEntry {
  id: string;
  question: string;
  expected: 'answer' | 'unknown';
}

/** The question file. */
export interface QuestionFile {
  formatVersion: 1;
  projects: { fixture: string; questions: QuestionEntry[] }[];
}

/** One sample file with its text, hash and path from the root. */
export interface SampleFile {
  fixture?: string;
  path?: string;
  file: string;
  sha?: string;
  text: string;
}

/** The inputs of `build`. */
export interface BuildInputs {
  run: RunRecord;
  questions: QuestionFile;
  questionsSha256: string;
  responses: Map<string, Map<string, { receivedAt: string; body: Record<string, unknown> }>>;
  sample: SampleFile[];
  counts: { file: string; sha256: string; providerTokens: number }[];
  excluded: string[];
}

/** One project of `context-savings.json`. */
export interface ProjectResult {
  fixture: string;
  questions: number;
  answered: number;
  unknown: Record<string, number>;
  baselineTokens: number;
  inputTokens: number;
  outputTokens: number;
  savingsTenths: number | null;
  latencyMs: number;
  generation: { inputTokens: number; outputTokens: number };
  verification: {
    calls: number;
    cacheHits: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    maxCallsPerAnswer: number | null;
  };
  costUsd: number;
  shares: { tokens: number | null; latency: number | null; cost: number | null };
  latency: { medianMs: number | null; verifyMedianMs: number | null; under10s: number };
  expectedUnknown: { declared: number; answeredUnknown: number };
}

/** The deviation of a file or of the whole sample. */
export interface DeviationEntry {
  file?: string;
  estimated: number;
  provider: number;
  deviation: number | null;
}

/** The tokenizer part of `context-savings.json`. */
export interface TokenizerResult {
  model: string;
  files: number;
  excluded: string[];
  estimated: number;
  provider: number;
  deviation: number | null;
  min: (DeviationEntry & { file: string }) | null;
  max: (DeviationEntry & { file: string }) | null;
}

/** The content of `context-savings.json`. */
export interface ContextMeasurement {
  formatVersion: 1;
  run: Omit<RunRecord, 'formatVersion'> & { questionsSha256: string; firstReceivedAt: string; lastReceivedAt: string };
  projects: ProjectResult[];
  tokenizer: TokenizerResult;
}

/** The outputs of a build: the texts by kind and the aggregated projects. */
export interface BuiltOutputs {
  csv: string;
  json: string;
  answers: Record<string, string>;
  projects: ProjectResult[];
}

/** The local token estimate: code points divided by 4, rounded up. */
export function estimateTokens(text: string): number;

/** «Ahorro» as integer tenths (`-0` as `0`), `null` at a zero baseline. */
export function savingsTenths(input: number, baseline: number): number | null;

/** A token count, grouped by three with a space from 10 000 up. */
export function formatTokens(count: number): string;

/** «Ahorro» from its tenths, or `no definido`. */
export function formatSavings(tenths: number | null): string;

/** A share from its integers, one decimal, half away from zero. */
export function formatPercent(numerator: number, denominator: number): string;

/** A signed deviation from its integers. */
export function formatSigned(numerator: number, denominator: number): string;

/** Milliseconds as seconds with one decimal, or `no definido` for `null`. */
export function formatSeconds(milliseconds: number | null): string;

/** The line below Table 1 of one project. */
export function projectLine(project: ProjectResult): string;

/** The tokenizer line below Table 1. */
export function deviationLine(tokenizer: TokenizerResult): string;

/** The problems of the question file's shape, each naming the file, and the parsed file. */
export function checkQuestions(text: string): { problems: string[]; data: QuestionFile | null };

/** Builds every output from the raw data, the question file and the sample only. */
export function build(inputs: BuildInputs): BuiltOutputs;

/** Builds the outputs from the files under `root` without any request. */
export function buildFromDisk(root: string): { problems: string[]; outputs: BuiltOutputs | null };

/** Runs the command and returns its exit code (0 success, 1 a check failed, 2 usage error). */
export function runMeasureContext(args: string[], options: MeasureContextOptions): Promise<number>;
