import { isAbsolute, join } from 'node:path';
import { countLines, createInMemoryVerificationCache, fileKindOf } from '@codemind/core';
import type {
  CompletionRequest,
  CompletionResult,
  CompletionUsage,
  CostTable,
  EmbeddingResult,
  GraphFile,
  GraphSymbol,
  IndexState,
  KnowledgeGraph,
  LlmPort,
  StorePort,
  VerificationCache,
} from '@codemind/core';
import { createInMemoryStore } from './in-memory-store';
import { createInMemorySourceTree } from './in-memory-source-tree';
import type { SourceContents } from './in-memory-source-tree';
import { SCRIPTED_MODEL, verifyView } from './scripted-llm';
import type { VerifyScript } from './scripted-llm';
import { edge, ref, symbol } from './sample-graph';

// The doubles of the drift tests. Spec: openspec/changes/add-drift-detection/specs/drift-detection/spec.md
// (DIS-71, design D12). The model is scripted: it tells the extraction prompt (user message with a
// `document` key) from the confrontation prompt (a `claim` key), unwraps the untrusted-data markers and
// hands the script a view, so a script can cite "the span of `config/shop.php`" without knowing its id.
// A `verify` request goes to the verifier script, which entails every pair by default. The store and the
// source tree are the in-memory doubles, unchanged. `verificationContents` and `verificationFailures`
// answer the source reads made after the first confrontation call (the verification reads), the idea of
// `tests/support/explain-doubles.ts:97` with a switch suited to several model calls; they are meant for
// tests with one confronted claim (design Follow-up R14).

export const COMMIT = 'c'.repeat(40);
export const WORKSPACE = '/workspace';
export const NOW = new Date('2026-11-03T10:00:00.000Z');
export const ROOT_PATH = '/repos/drift';

/** What an extraction script receives: the path and the numbered lines, without the markers. */
export interface ExtractionView {
  path: string;
  /** The lines as sent: `<number>\t<text>` per line (a truncation mark last when cut). */
  lines: string;
  /** The raw user message, markers included. */
  raw: string;
  flags?: string[];
}

/** One evidence entry of a confrontation prompt, its text without the markers. */
export interface ConfrontationEvidence {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  flags?: string[];
}

/** What a confrontation script receives. */
export interface ConfrontationView {
  /** The claim's text without its markers. */
  claim: string;
  claimFlags?: string[];
  document: { path: string; startLine: number; endLine: number; text: string };
  evidence: ConfrontationEvidence[];
  /** The raw user message, markers included. */
  raw: string;
}

/** The scripts of a drift double. */
export interface DriftLlmOptions {
  /** The raw output of the extraction of one document; throws to fail the call. */
  extract: (view: ExtractionView) => string;
  /** The raw output of the confrontation of one claim; throws to fail the call. */
  confront: (view: ConfrontationView) => string;
  /** The verifier; `{"entails":true}` for every pair when absent. */
  verify?: VerifyScript;
  /** The tokens every request reports; 0/0 when absent. */
  usage?: CompletionUsage;
  /** `live` unless given. */
  mode?: 'live' | 'evaluation';
  /** Called with the count of confrontation calls (from 1) when one starts. */
  onConfrontation?: (count: number) => void;
}

/** The scripted model and what it recorded. */
export interface DriftLlm {
  llm: LlmPort;
  /** Every request, `answer` and `verify` alike, in order. */
  requests: CompletionRequest[];
  /** The extraction prompts, parsed, in order. */
  extractions: ExtractionView[];
  /** The confrontation prompts, parsed, in order. */
  confrontations: ConfrontationView[];
  /** The raw requests of the extraction prompts. */
  extractionRequests: CompletionRequest[];
  /** The raw requests of the confrontation prompts. */
  confrontationRequests: CompletionRequest[];
}

const NO_USAGE: CompletionUsage = { inputTokens: 0, outputTokens: 0 };

/** The text between the markers of an untrusted-data block (the first and last lines removed). */
export function unwrap(wrapped: string): string {
  return wrapped.split('\n').slice(1, -1).join('\n');
}

function userOf(request: CompletionRequest): string {
  const user = request.messages.find((message) => message.role === 'user');
  if (user === undefined) throw new Error('the prompt has no user message');
  return user.content;
}

/** The scripted model of the drift tests. */
export function createDriftLlm(options: DriftLlmOptions): DriftLlm {
  const requests: CompletionRequest[] = [];
  const extractions: ExtractionView[] = [];
  const confrontations: ConfrontationView[] = [];
  const extractionRequests: CompletionRequest[] = [];
  const confrontationRequests: CompletionRequest[] = [];
  const mode = options.mode ?? 'live';
  const verify = options.verify ?? (() => '{"entails":true}');
  const llm: LlmPort = {
    mode,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      requests.push(request);
      if (mode === 'evaluation') throw new Error('the evaluation model must never be called');
      const usage = { ...(options.usage ?? NO_USAGE) };
      if (request.purpose === 'verify') {
        return { text: await verify(verifyView(request)), model: SCRIPTED_MODEL, usage };
      }
      const raw = userOf(request);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.document !== undefined && parsed.claim === undefined) {
        const document = parsed.document as { path: string; lines: string; flags?: string[] };
        const view: ExtractionView = {
          path: document.path,
          lines: unwrap(document.lines),
          raw,
          ...(document.flags !== undefined && { flags: document.flags }),
        };
        extractions.push(view);
        extractionRequests.push(request);
        return { text: options.extract(view), model: SCRIPTED_MODEL, usage };
      }
      const document = parsed.document as { path: string; startLine: number; endLine: number; text: string };
      const evidence = (parsed.evidence as ConfrontationEvidence[]).map((entry) => ({ ...entry, text: unwrap(entry.text) }));
      const view: ConfrontationView = {
        claim: unwrap(parsed.claim as string),
        ...(parsed.claimFlags !== undefined && { claimFlags: parsed.claimFlags as string[] }),
        document: { ...document, text: unwrap(document.text) },
        evidence,
        raw,
      };
      confrontations.push(view);
      confrontationRequests.push(request);
      options.onConfrontation?.(confrontations.length);
      return { text: options.confront(view), model: SCRIPTED_MODEL, usage };
    },
    async embed(): Promise<EmbeddingResult> {
      throw new Error('not used by drift');
    },
  };
  return { llm, requests, extractions, confrontations, extractionRequests, confrontationRequests };
}

/** A file of the project under test: its path and its content. */
export interface DriftFile {
  path: string;
  content: string;
}

/** A `describes` edge from a document to a symbol of the project. */
export interface DescribesEdge {
  doc: string;
  symbol: GraphSymbol;
}

/** What `driftDeps` builds from. */
export interface DriftDepsOptions extends DriftLlmOptions {
  files: readonly DriftFile[];
  symbols?: readonly GraphSymbol[];
  describes?: readonly DescribesEdge[];
  /** `false` builds a project with no indexed commit. */
  indexed?: boolean;
  /** The instants `deps.now` reads in turn, the last one repeated; `[NOW]` when absent. */
  now?: readonly Date[];
  costTable?: CostTable;
  verificationCache?: VerificationCache;
  /** Path to the text the reads after the first confrontation call see; the normal contents otherwise. */
  verificationContents?: Record<string, string>;
  /** Path to the error those reads reject with. */
  verificationFailures?: Record<string, unknown>;
  /** Wraps the store (to inject a failure). */
  store?: (store: StorePort) => StorePort;
  /**
   * The project's stored root path; `ROOT_PATH` when absent. A relative one is served by the source
   * double only under its join to `WORKSPACE`, so a read at the unjoined path finds no repository.
   */
  rootPath?: string;
}

/** A symbol of `path` (a method of three lines from `startLine`, or the given lines). */
export function methodAt(path: string, name: string, startLine: number, endLine = startLine + 2): GraphSymbol {
  return symbol(path, name, startLine, { endLine });
}

/** `count` lines `line 1…line count` of text, ending with a line feed. */
export function numberedLines(count: number, prefix = 'line'): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join('\n') + '\n';
}

/**
 * The drift doubles: a project of `files` indexed at `COMMIT`, a scripted model, a scripted clock, the
 * counters of what was called. The kind of each file is the canonical `fileKindOf`.
 */
export function driftDeps(options: DriftDepsOptions) {
  const graphFiles: GraphFile[] = options.files.map((f) => ({
    path: f.path,
    kind: fileKindOf(f.path),
    loc: countLines(f.content),
    contentHash: `hash-${f.path}`,
  }));
  const symbols = [...(options.symbols ?? [])];
  const graph: KnowledgeGraph = {
    files: graphFiles,
    symbols,
    edges: (options.describes ?? []).map((d) => edge({ file: d.doc }, { symbol: ref(d.symbol) }, { kind: 'describes' })),
    commits: [],
    fileCommits: [],
    ...(options.indexed === false ? {} : { indexedCommit: COMMIT }),
  };
  const rootPath = options.rootPath ?? ROOT_PATH;
  const readRoot = isAbsolute(rootPath) ? rootPath : join(WORKSPACE, rootPath);
  const loaded = createInMemoryStore({
    projects: [{ project: { name: 'drift-project', rootPath, language: 'php' }, graph }],
  });
  const contents = Object.fromEntries(options.files.map((f) => [f.path, f.content]));
  const tree: SourceContents = { [readRoot]: { [COMMIT]: contents } };
  let confrontationCalls = 0;
  const later = options.verificationContents !== undefined || options.verificationFailures !== undefined;
  const source = createInMemorySourceTree(
    tree,
    {},
    later
      ? {
          after: {
            when: () => confrontationCalls > 0,
            contents: { [readRoot]: { [COMMIT]: options.verificationContents ?? contents } },
            failures: options.verificationFailures,
          },
        }
      : {},
  );
  const model = createDriftLlm({
    ...options,
    onConfrontation: (count) => {
      confrontationCalls = count;
      options.onConfrontation?.(count);
    },
  });
  let reads = 0;
  const instants = options.now ?? [NOW];
  const clock = {
    now: () => new Date(instants[Math.min(reads++, instants.length - 1)]!.getTime()),
    reads: () => reads,
  };
  const base = options.store?.(loaded.store) ?? loaded.store;
  const indexStateReads = { count: 0 };
  const store: StorePort = {
    ...base,
    readIndexState: (...args): Promise<IndexState> => {
      indexStateReads.count += 1;
      return base.readIndexState(...args);
    },
  };
  return {
    loaded,
    projectId: loaded.projectIds[0]!,
    model,
    clock,
    sourceCalls: source.calls,
    batchReads: source.batchReads,
    reads: source.reads,
    indexStateReads,
    /** Every store call received, the index-state reads included. */
    storeCalls: (): number => Object.values(loaded.calls).reduce((sum, n) => sum + n, 0) + indexStateReads.count,
    /** The calls that write: always 0 for drift. */
    writeCalls: (): number =>
      loaded.calls.saveClaims +
      loaded.calls.refreshClaim +
      loaded.calls.saveQueryLog +
      loaded.calls.saveCacheEntry +
      loaded.calls.touchCacheEntry,
    deps: {
      store,
      source: source.source,
      llm: model.llm,
      workspaceRoot: WORKSPACE,
      now: clock.now,
      verificationCache: options.verificationCache ?? createInMemoryVerificationCache(),
      ...(options.costTable !== undefined && { costTable: options.costTable }),
    },
  };
}

/** The rejection of `promise`, or a failure when it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

/** The JSON of an extraction output with the given claims. */
export function claimsOutput(claims: Array<{ text: string; startLine: number; endLine: number }>): string {
  return JSON.stringify({ claims });
}

/** The JSON of a confrontation output. */
export function verdictOutput(verdict: 'contradicted' | 'consistent' | 'unrelated', statement: string, evidenceIds: string[]): string {
  return JSON.stringify({ verdict, statement, evidenceIds });
}
