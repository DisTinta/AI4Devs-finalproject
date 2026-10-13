import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { redactSecrets } from '../index/secret-scanner.js';
import { SourceUnavailable } from '../knowledge/errors.js';
import type { FileKind } from '../knowledge/graph-file.js';
import type { StoredSymbol } from '../knowledge/graph-read.js';
import type { SymbolKind } from '../knowledge/graph-symbol.js';
import { assertValidTraversal } from '../knowledge/read-arguments.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import { anchor, questionTerms } from './anchor.js';
import {
  DEFAULT_CONTEXT_HOPS,
  fitToTokenBudget,
  TOKEN_BUDGET_DEFAULT,
  TOKEN_BUDGET_MAX,
  TOKEN_BUDGET_MIN,
  type CutSpan,
} from './budget.js';
import { expand } from './expand.js';
import { candidateFileKind, rankCandidates, type Candidate, type ContextOrigin } from './rank.js';
import { estimateTokens, TOKEN_ESTIMATOR, type TokenEstimator } from './tokenizer.js';

// The context pack of a question (DIS-28 design D9): anchor, expand, rank, read every candidate's file
// from git at the project's indexed commit in one batch (DIS-39 design D9), redact it, cut spans and
// fit them to the token budget.
// Neither the question nor any span text is logged. The repository root of a seed project is
// relative and resolves against the injected workspace root, never the process working directory.

/** One piece of code in a context pack. */
export interface ContextSpan {
  /** Repository-relative path of the span's file. */
  path: string;
  /** Id of the span's file. */
  fileId: string;
  /** Kind of the span's file. */
  fileKind: FileKind;
  /** First line, from 1. */
  startLine: number;
  /** Last line, inclusive. */
  endLine: number;
  /** The symbol the span is, when it comes from a symbol; absent for a whole-file span. */
  symbol?: { id: string; name: string; kind: SymbolKind };
  /** The span's lines of the redacted file. */
  text: string;
  /** Estimated tokens of `text`. */
  tokens: number;
  /** Steps from the anchor; 0 for an anchor symbol. */
  distance: number;
  /** `anchor`, or the resolution of the node's shortest paths. */
  origin: ContextOrigin;
}

/** What every context pack carries. */
interface PackCommon {
  /** The budget the pack was fitted to. */
  tokenBudget: number;
  /** Candidates skipped because they did not fit. */
  omitted: number;
  /** How every token count of the pack was estimated. */
  estimator: TokenEstimator;
}

/** A pack with at least one span. */
export interface FilledContextPack extends PackCommon {
  /** The pack holds code. */
  status: 'ok';
  /** The included spans, in rank order. */
  spans: ContextSpan[];
  /** Sum of the spans' tokens; never more than `tokenBudget`. */
  tokens: number;
  /** Estimated tokens of the whole redacted files of the spans, each file once. */
  baselineTokens: number;
}

/** A pack with no span: the question anchors nothing, or no span fits the budget. */
export interface EmptyContextPack extends PackCommon {
  /** The pack holds no code. */
  status: 'empty';
  /** `no-anchor` when the question names no symbol, `over-budget` when no span fits. */
  reason: 'no-anchor' | 'over-budget';
  /** Always empty. */
  spans: [];
  /** Always 0. */
  tokens: 0;
  /** Always 0. */
  baselineTokens: 0;
}

/** The context of a question, ready for a prompt. */
export type ContextPack = FilledContextPack | EmptyContextPack;

/** What `buildContextPack` reads through. */
export interface ContextPackDependencies {
  /** The graph store. */
  store: StorePort;
  /** The reader of the project's repository. */
  source: SourceTreePort;
  /** Absolute path a relative project root (the seed's `fixtures/<name>`) resolves against. */
  workspaceRoot: string;
}

/** The question and its limits. */
export interface ContextPackRequest {
  /** The project to answer about. */
  projectId: string;
  /** The question as the user wrote it; it is never logged. */
  question: string;
  /** Integer from `TOKEN_BUDGET_MIN` to `TOKEN_BUDGET_MAX`; `TOKEN_BUDGET_DEFAULT` when absent. */
  tokenBudget?: number;
  /** Integer from 1 to `MAX_HOPS`; `DEFAULT_CONTEXT_HOPS` when absent. */
  hops?: number;
  /**
   * The anchor already computed for `question` (DIS-39 design D9), as the symbol search returns it;
   * when given, the pack uses it and does not search symbols again. Each symbol must carry a
   * well-formed file id.
   */
  anchors?: StoredSymbol[];
}

/** A well-formed file id, checked as the claim records check ids (core cannot import the adapter's). */
const FILE_ID = z.uuid();

/** A candidate's span, cut and estimated, with what the pack reports about it. */
interface CandidateSpan extends CutSpan {
  span: ContextSpan;
}

/** A file read once per pack: its redacted content and its lines. */
interface ReadFile {
  content: string;
  lines: string[];
}

/** The lines of a content: a final line feed ends the last line; an empty content has one line. */
function linesOf(content: string): string[] {
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Builds the context pack of a question about one project: its anchor and their neighbourhood,
 * ranked, read from the repository at the project's indexed commit, redacted, cut into spans and
 * fitted to the token budget.
 *
 * Arguments are checked before any store call. A question that anchors nothing gives an empty
 * `no-anchor` pack without traversing, reading the project or reading any file; a pack where no span
 * fits is `over-budget`. Each distinct file is read at most once, all of them in one batched read.
 *
 * @param dependencies The store, the source reader and the absolute workspace root.
 * @param request The project, the question, the budget and the hops.
 * @returns The pack.
 * @throws RangeError naming `workspaceRoot` when it is not absolute, `tokenBudget` when it is not
 *   an integer in range, or `anchors` when a given anchor symbol has no well-formed file id.
 * @throws InvalidStoreQuery naming `hops` when it is not an integer from 1 to `MAX_HOPS`.
 * @throws ProjectNotFound when the question has a term and `projectId` names no project.
 * @throws SourceUnavailable with reason `not-indexed` when the project has no indexed commit, or as
 *   the source reader raises it for a file it cannot read.
 */
export async function buildContextPack(
  dependencies: ContextPackDependencies,
  request: ContextPackRequest,
): Promise<ContextPack> {
  const { store, source, workspaceRoot } = dependencies;
  const { projectId, question, tokenBudget = TOKEN_BUDGET_DEFAULT, hops = DEFAULT_CONTEXT_HOPS } = request;
  if (!isAbsolute(workspaceRoot)) throw new RangeError('workspaceRoot must be an absolute path');
  if (!Number.isInteger(tokenBudget) || tokenBudget < TOKEN_BUDGET_MIN || tokenBudget > TOKEN_BUDGET_MAX) {
    throw new RangeError(`tokenBudget must be an integer from ${TOKEN_BUDGET_MIN} to ${TOKEN_BUDGET_MAX}`);
  }
  assertValidTraversal(hops);
  if (request.anchors !== undefined && !request.anchors.every((given) => FILE_ID.safeParse(given?.fileId).success)) {
    throw new RangeError('anchors must each carry a well-formed file id');
  }
  const common: Omit<PackCommon, 'omitted'> = { tokenBudget, estimator: TOKEN_ESTIMATOR };

  const anchors = request.anchors ?? (await anchor(store, projectId, question));
  if (anchors.length === 0) {
    return { ...common, status: 'empty', reason: 'no-anchor', spans: [], tokens: 0, baselineTokens: 0, omitted: 0 };
  }
  const neighbors = await expand(store, projectId, anchors, hops);
  const project = await store.getProject(projectId);
  if (project.indexedCommit === undefined) throw new SourceUnavailable('not-indexed');
  const commit = project.indexedCommit;
  const root = isAbsolute(project.rootPath) ? project.rootPath : join(workspaceRoot, project.rootPath);

  // Every candidate's file in one batched read (DIS-39 design D9), each distinct path once, in rank
  // order, so the first unreadable path in rank order is the one that rejects.
  const candidates = rankCandidates(anchors, neighbors, questionTerms(question));
  const paths = [...new Set(candidates.map(pathOf))];
  const contents = await source.readFilesAt(root, commit, paths);
  const files = new Map<string, ReadFile>(
    paths.map((path, i) => {
      const content = redactSecrets({ path, content: contents[i] }).file.content;
      return [path, { content, lines: linesOf(content) }];
    }),
  );
  const spans = candidates.map((candidate) => cut(candidate, files.get(pathOf(candidate)) as ReadFile));
  const fitted = fitToTokenBudget(spans, tokenBudget, keepBestRank);
  if (fitted.included.length === 0) {
    return { ...common, status: 'empty', reason: 'over-budget', spans: [], tokens: 0, baselineTokens: 0, omitted: fitted.omitted };
  }
  const included = new Set(fitted.included.map((span) => span.span.path));
  const baselineTokens = [...included].reduce((sum, path) => sum + estimateTokens(files.get(path)?.content ?? ''), 0);
  return {
    ...common,
    status: 'ok',
    spans: fitted.included.map((included) => included.span),
    tokens: fitted.tokens,
    baselineTokens,
    omitted: fitted.omitted,
  };
}

const ORIGIN_ORDER: readonly ContextOrigin[] = ['anchor', 'exact', 'heuristic'];

/**
 * A replacing span with the smallest distance and the best origin among itself and the spans it
 * replaces, so lines the question named (or reached exactly) keep saying so (DIS-28 design D8).
 */
function keepBestRank(replacing: CandidateSpan, replaced: readonly CandidateSpan[]): CandidateSpan {
  const all = [replacing, ...replaced];
  const distance = Math.min(...all.map((candidate) => candidate.span.distance));
  const origin = ORIGIN_ORDER[Math.min(...all.map((candidate) => ORIGIN_ORDER.indexOf(candidate.span.origin)))];
  return { ...replacing, span: { ...replacing.span, distance, origin } };
}

/** The repository-relative path of a candidate's file. */
function pathOf(candidate: Candidate): string {
  return candidate.node.type === 'file' ? candidate.node.path : candidate.node.file;
}

/** The span of a candidate in its read file: a symbol's lines, or a whole file (line 1 to its last line). */
function cut(candidate: Candidate, file: ReadFile): CandidateSpan {
  const { node } = candidate;
  const path = pathOf(candidate);
  const { lines } = file;
  const startLine = node.type === 'file' ? 1 : node.startLine;
  const endLine = node.type === 'file' ? lines.length : node.endLine;
  const text = lines.slice(startLine - 1, endLine).join('\n');
  const tokens = estimateTokens(text);
  const fileId = node.type === 'file' ? node.id : node.fileId;
  const span: ContextSpan = {
    path,
    fileId,
    fileKind: candidateFileKind(candidate),
    startLine,
    endLine,
    ...(node.type === 'symbol' && { symbol: { id: node.id, name: node.name, kind: node.kind } }),
    text,
    tokens,
    distance: candidate.distance,
    origin: candidate.origin,
  };
  return { fileId, startLine, endLine, tokens, span };
}
