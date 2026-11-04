import { isAbsolute, join } from 'node:path';
import type { ContextSpan } from '../context/context-pack.js';
import type { SanitizedSpan } from '../explain/sanitize.js';
import { sanitizeForPrompt } from '../explain/sanitize.js';
import type { TypedStatement } from '../explain/claim-items.js';
import { SourceUnavailable } from '../knowledge/errors.js';
import { fileKindOf } from '../knowledge/file-kind.js';
import { COST_TABLE } from '../llm/cost-table.js';
import type { CostTable } from '../llm/cost-table.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import type { QueryLogEntry } from '../knowledge/query-log.js';
import { latencyMs, sumVerificationUsage } from '../explain/usage.js';
import { meterLlm } from '../explain/usage-meter.js';
import type { VerificationUsage } from '../verify/semantic.js';
import { verifyCitations } from '../verify/syntactic.js';
import type { VerificationCache } from '../verify/verification-cache.js';
import { verifyAnswer } from '../verify/verify-answer.js';
import { claimContext, configFilesOf, confrontClaim, isPromptableConfig } from './contradiction.js';
import type { ConfigFiles } from './contradiction.js';
import { extractClaims } from './doc-claims.js';
import type { DocClaim } from './doc-claims.js';
import { driftCacheKey, parseStoredDriftReport } from './drift-cache.js';
import { driftQueryLogEntry, saveDriftRow, zeroDriftRow } from './query-log.js';
import type {
  AnsweredDrift,
  Contradiction,
  DriftCheckEvent,
  DriftDocument,
  DriftEvent,
  DriftInnerEvent,
  DriftReport,
  DriftUsage,
} from './drift-report.js';
import { parseDriftRequest } from './drift-request.js';
import type { DriftRequest } from './drift-request.js';

// The drift use case (DIS-71 design D1): reads the indexed documents, asks the model for their
// checkable claims, confronts each with the code that bears on it and returns the contradictions whose
// citations on both sides are verified. It imitates `explain`: it answers a golden report from the answer
// cache (DIS-73 design D1) and leaves one `query_log` row per call (design D3); it saves no claim,
// evidence or cache entry.

/** Most documents one call checks, the first ones in byte order of their paths; later ones are skipped. */
export const MAX_DRIFT_DOCS = 10;

/** What `drift` reads through. */
export interface DriftDependencies {
  /** The graph store; only read. */
  store: StorePort;
  /** The reader of the project's repository. */
  source: SourceTreePort;
  /** The model; in `evaluation` mode it is never called. */
  llm: LlmPort;
  /** Absolute path a relative project root resolves against. */
  workspaceRoot: string;
  /**
   * The clock of the provenance and of the latency: read first right after the request is validated
   * and last after the final verification; each semantic check reads it twice more, as in `explain`.
   */
  now: () => Date;
  /** The verdicts of the semantic check already known. */
  verificationCache: VerificationCache;
  /** The prices of the usage; the shipped cost table when absent. */
  costTable?: CostTable;
}

/** What every claim of one call shares. */
interface RunState {
  dependencies: DriftDependencies;
  llm: LlmPort;
  projectId: string;
  tokenBudget: number | undefined;
  root: string;
  commit: string;
  startedAt: Date;
  configPaths: string[];
  configFiles: ConfigFiles;
  verifications: VerificationUsage[];
}

const ZERO_VERIFICATION: VerificationUsage = { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 };

/**
 * Finds what the documents of one indexed project say that its code, tests or configuration contradict.
 * The request is validated and the workspace root checked before any call, then the clock is read once.
 * Unless `useCache` is `false`, the answer cache is looked up under `driftCacheKey` in both modes: a
 * stored drift report is answered (its hit recorded, zero usage, `cacheHit` `true`) without reading the
 * project or calling the model. Otherwise, in `evaluation` mode the answer is `unknown` `llm-required`
 * with nothing read; a project with no stored document (or a `docPath` that is not one) is `unknown`
 * `no-docs` after one read of the index state. Otherwise the stored files of kind `doc`, in byte order
 * and at most `MAX_DRIFT_DOCS` (the rest get a `drift_doc_skipped` `limit` event), are read at the
 * indexed commit in one batched read; for each, one `answer` call extracts its claims, and for each
 * confronted claim (at most `MAX_DOC_CLAIMS`) the context is built (`claimContext`) and one `answer`
 * call judges it. A `contradicted` verdict is verified: the document citation syntactically first, then
 * the statement and its cited spans through `verifyAnswer`; a contradiction with no valid citation on
 * either side is not reported. An invalid model output costs one document or one claim (an event with
 * its subcode), never the run. Every returned report leaves one `query_log` row, and a rejection after a
 * model call resolved leaves one with the spend so far. Nothing else is written (a golden hit only
 * records its hit) and nothing is logged: the report holds no text of the document, the claims or the
 * model output other than the cited excerpts and the statements it returns.
 *
 * @param dependencies The store, the source reader, the model, the workspace root, the clock, the
 *   verification cache and, optionally, the cost table.
 * @param request The project, optionally one document, the token budget of each context pack and
 *   whether to look the golden report up.
 * @returns The report: `answered` with its documents, events, usage and `cacheHit`, or `unknown`.
 * @throws InvalidDriftRequest naming the field at fault, before any call.
 * @throws RangeError naming `workspaceRoot` when it is not absolute, before any call.
 * @throws ProjectNotFound and any failure of the store reads or of the hit record; SourceUnavailable
 *   (`not-indexed`, or the one of a document, configuration or context read, `missing` included) and any
 *   other failure of those reads; LlmUnavailable, BudgetExhausted and any other failure of an `answer`
 *   call; any failure of a verification read other than a missing file, and of a `verify` call other
 *   than those the semantic check absorbs; any failure of the row write other than the three it
 *   absorbs; all unchanged.
 */
export async function drift(dependencies: DriftDependencies, request: DriftRequest): Promise<DriftReport> {
  const parsed = parseDriftRequest(request);
  if (!isAbsolute(dependencies.workspaceRoot)) throw new RangeError('workspaceRoot must be an absolute path');
  const { store, now } = dependencies;
  const startedAt = now();
  const key = driftCacheKey(parsed.docPath);
  const meter = meterLlm(dependencies.llm, dependencies.costTable ?? COST_TABLE);

  if (parsed.useCache !== false) {
    const entry = await store.findCacheEntry(parsed.projectId, key);
    const stored = entry === undefined ? undefined : parseStoredDriftReport(entry.response);
    if (entry !== undefined && stored !== undefined) {
      await store.touchCacheEntry(parsed.projectId, entry.id, startedAt);
      const finishedAt = now();
      const hit: AnsweredDrift = {
        status: 'answered',
        projectId: parsed.projectId,
        commit: stored.commit,
        documents: stored.documents,
        events: [],
        usage: usageOf(meter, [], latencyMs(startedAt, finishedAt)),
        cacheHit: true,
      };
      return logged(store, hit, zeroDriftRow(parsed.projectId, key, startedAt, finishedAt, true));
    }
  }

  let outcome: DriftReport;
  try {
    outcome = await runPipeline(dependencies, meter, parsed, startedAt);
  } catch (error) {
    if (meter.resolvedCalls() > 0) {
      const row = driftQueryLogEntry({
        projectId: parsed.projectId,
        key,
        generation: meter.generation(),
        verification: { ...meter.verification(), calls: meter.verifyCalls(), latencyMs: null },
        latencyMs: latencyMs(startedAt, now()),
        cacheHit: false,
      });
      try {
        await store.saveQueryLog(row);
      } catch {
        // The error of the call is the one that matters; a failed row never replaces it.
      }
    }
    throw error;
  }
  if (outcome.status === 'unknown') {
    // An unknown report has no `events`: an absorbed write failure is dropped.
    await saveDriftRow(store, zeroDriftRow(parsed.projectId, key, startedAt, now(), false));
    return outcome;
  }
  const { usage } = outcome;
  const row = driftQueryLogEntry({
    projectId: parsed.projectId,
    key,
    generation: usage.generation,
    verification: usage.verification,
    latencyMs: usage.latencyMs,
    cacheHit: false,
  });
  return logged(store, outcome, row);
}

/** Writes the row of an answered report and appends the `query_not_logged` event when the write is absorbed. */
async function logged(store: StorePort, report: AnsweredDrift, row: QueryLogEntry): Promise<AnsweredDrift> {
  const code = await saveDriftRow(store, row);
  return code === undefined ? report : { ...report, events: [...report.events, { type: 'query_not_logged', code }] };
}

/** The pipeline of one call over the metered model: the unknown answers, the reads and the checks. */
async function runPipeline(
  dependencies: DriftDependencies,
  meter: ReturnType<typeof meterLlm>,
  parsed: DriftRequest,
  startedAt: Date,
): Promise<DriftReport> {
  const { store, source, workspaceRoot, now } = dependencies;
  if (dependencies.llm.mode === 'evaluation') return { status: 'unknown', reason: 'llm-required' };

  const state = await store.readIndexState(parsed.projectId);
  const paths = state.files.map((file) => file.path);
  const docs = paths.filter((path) => fileKindOf(path) === 'doc' && (parsed.docPath === undefined || path === parsed.docPath));
  if (docs.length === 0) return { status: 'unknown', reason: 'no-docs' };

  const project = await store.getProject(parsed.projectId);
  if (project.indexedCommit === undefined) throw new SourceUnavailable('not-indexed');
  const commit = project.indexedCommit;
  const root = isAbsolute(project.rootPath) ? project.rootPath : join(workspaceRoot, project.rootPath);
  const configPaths = paths.filter((path) => fileKindOf(path) === 'config' && isPromptableConfig(path));
  const run: RunState = {
    dependencies,
    llm: meter.llm,
    projectId: parsed.projectId,
    tokenBudget: parsed.tokenBudget,
    root,
    commit,
    startedAt,
    configPaths,
    configFiles: configFilesOf(source, root, commit, configPaths),
    verifications: [],
  };

  const checked = docs.slice(0, MAX_DRIFT_DOCS);
  const contents = await source.readFilesAt(root, commit, checked);
  const documents: DriftDocument[] = [];
  const events: DriftEvent[] = [];
  for (const [i, path] of checked.entries()) {
    const result = await checkDocument(run, path, contents[i]);
    documents.push(result.document);
    events.push(...result.events);
  }
  for (const docPath of docs.slice(MAX_DRIFT_DOCS)) events.push({ type: 'drift_doc_skipped', docPath, reason: 'limit' });

  const latency = latencyMs(startedAt, now());
  return {
    status: 'answered',
    projectId: parsed.projectId,
    commit,
    documents,
    events,
    usage: usageOf(meter, run.verifications, latency),
    cacheHit: false,
  };
}

/** The usage of the run: the meter's resolved calls, the verification sums, the cost rounded once. */
function usageOf(
  meter: ReturnType<typeof meterLlm>,
  verifications: readonly VerificationUsage[],
  latency: number,
): DriftUsage {
  const generation = meter.generation();
  const verification = sumVerificationUsage(ZERO_VERIFICATION, ...verifications);
  return {
    inputTokens: generation.inputTokens + verification.inputTokens,
    outputTokens: generation.outputTokens + verification.outputTokens,
    costUsd: Math.round((generation.costUsd + verification.costUsd) * 1e6) / 1e6,
    latencyMs: latency,
    generation,
    verification,
  };
}

/** One checked document: its entry and its events. */
async function checkDocument(
  run: RunState,
  path: string,
  content: string,
): Promise<{ document: DriftDocument; events: DriftEvent[] }> {
  const extraction = await extractClaims(run.llm, { path, content });
  const document: DriftDocument = { path, claimsChecked: 0, omittedClaims: 0, droppedClaims: 0, contradictions: [] };
  const events: DriftEvent[] = [...extraction.events];
  if (extraction.status === 'skipped') {
    events.push({ type: 'drift_doc_skipped', docPath: path, reason: 'invalid-model-output', subcode: extraction.subcode });
    return { document, events };
  }
  document.omittedClaims = extraction.omitted;
  document.droppedClaims = extraction.dropped;
  for (const [claimIndex, claim] of extraction.claims.entries()) {
    const outcome = await checkClaim(run, path, claimIndex, claim);
    events.push(...outcome.events);
    if (outcome.checked) document.claimsChecked += 1;
    if (outcome.contradiction !== undefined) document.contradictions.push(outcome.contradiction);
  }
  return { document, events };
}

/** The event of a claim, wrapped with its document and index. */
function claimEvent(docPath: string, claimIndex: number, event: DriftInnerEvent): DriftCheckEvent {
  return { type: 'drift_check_event', docPath, claimIndex, event };
}

/** One confronted claim: whether it counts as checked, its contradiction if it survives, its events. */
async function checkClaim(
  run: RunState,
  docPath: string,
  claimIndex: number,
  claim: DocClaim,
): Promise<{ checked: boolean; contradiction?: Contradiction; events: DriftEvent[] }> {
  const { dependencies } = run;
  const spans = await claimContext(
    { store: dependencies.store, source: dependencies.source, workspaceRoot: dependencies.workspaceRoot },
    { projectId: run.projectId, claimText: claim.text, ...(run.tokenBudget !== undefined && { tokenBudget: run.tokenBudget }) },
    run.configPaths,
    run.configFiles,
  );
  // Nothing bears on the claim: checked, nothing to report, no model call.
  if (spans.length === 0) return { checked: true, events: [] };

  const sanitized = sanitizeForPrompt(claim.text, spans);
  const events: DriftEvent[] = sanitized.events.map((event) => claimEvent(docPath, claimIndex, event));
  const citation = { path: docPath, startLine: claim.startLine, endLine: claim.endLine, text: claim.excerpt };
  const { prompt, model, result } = await confrontClaim(run.llm, citation, sanitized);
  if (!result.ok) {
    events.push({ type: 'drift_claim_skipped', docPath, claimIndex, reason: 'invalid-model-output', subcode: result.subcode });
    return { checked: false, events };
  }
  const { output } = result;
  if (output.verdict !== 'contradicted') return { checked: true, events };

  // The document citation first: syntactic only, the document is the claim's own source (design D6).
  const [documentVerdict] = await verifyCitations(dependencies.source, run.root, run.commit, [
    { path: docPath, startLine: claim.startLine, endLine: claim.endLine, excerpt: claim.excerpt },
  ]);
  if (documentVerdict.verification === 'broken') {
    events.push(
      claimEvent(docPath, claimIndex, {
        type: 'evidence_broken',
        evidenceId: 'D1',
        path: docPath,
        startLine: claim.startLine,
        endLine: claim.endLine,
        reason: documentVerdict.reason,
      }),
    );
    return { checked: true, events };
  }

  const evidenceIds = [...output.evidenceIds] as [string, ...string[]];
  const cited = evidenceIds.map((id) => prompt.evidenceIds.get(id) as SanitizedSpan) as unknown as [ContextSpan, ...ContextSpan[]];
  const statement: TypedStatement = { text: output.statement, type: 'INFERENCE', spans: cited, evidenceIds };
  const verified = await verifyAnswer(
    {
      source: dependencies.source,
      llm: run.llm,
      cache: dependencies.verificationCache,
      now: dependencies.now,
      ...(dependencies.costTable !== undefined && { costTable: dependencies.costTable }),
    },
    run.root,
    run.commit,
    [statement],
    prompt.evidenceIds,
  );
  run.verifications.push(verified.usage);
  for (const event of verified.events) events.push(claimEvent(docPath, claimIndex, event));
  const [kept] = verified.statements;
  if (kept === undefined) return { checked: true, events };

  const contradiction: Contradiction = {
    claim: {
      text: claim.text,
      path: docPath,
      startLine: claim.startLine,
      endLine: claim.endLine,
      excerpt: claim.excerpt,
      verification: 'cited',
    },
    statement: kept.text,
    evidence: kept.spans.map((span, j) => ({
      path: span.path,
      startLine: span.startLine,
      endLine: span.endLine,
      fileKind: span.fileKind,
      excerpt: span.text,
      verification: kept.evidenceVerifications[j],
    })),
    type: 'INFERENCE',
    provenance: {
      model,
      promptHash: prompt.promptHash,
      inputSpans: [
        { path: docPath, startLine: claim.startLine, endLine: claim.endLine },
        ...[...prompt.evidenceIds.values()].map(({ path, startLine, endLine }) => ({ path, startLine, endLine })),
      ],
      createdAt: run.startedAt.toISOString(),
    },
  };
  return { checked: true, contradiction, events };
}
