import { z } from 'zod';
import { basename } from 'node:path/posix';
import { normaliseText, questionTerms } from '../context/anchor.js';
import { buildContextPack } from '../context/context-pack.js';
import type { ContextPackDependencies, ContextSpan } from '../context/context-pack.js';
import { redactedLines, spanText } from '../context/span-text.js';
import { estimateTokens } from '../context/tokenizer.js';
import { MAX_EVIDENCE_IDS_PER_STATEMENT } from '../explain/limits.js';
import type { SanitizedPrompt } from '../explain/sanitize.js';
import type { SchemaViolationSubcode } from '../explain/schema-violation.js';
import { withoutNul } from '../knowledge/text-without-nul.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import { MAX_CLAIM_CHARS } from './doc-claims.js';
import { buildConfrontationPrompt } from './drift-prompts.js';
import type { ConfrontationPrompt, DocumentCitation } from './drift-prompts.js';
import { driftShapeSubcode, parseDriftJson } from './drift-quarantine.js';
import { UNSTORED_FILE_ID } from './drift-report.js';

// The context and the verdict of one claim (DIS-71 design D4, D5): the context pack without document
// spans plus the configuration files that share a term with the claim, one `answer` call, and a strict
// quarantine of its output. Nothing is logged.

/** Most configuration files added to the context of one claim. */
export const MAX_CONFIG_SPANS = 3;

/** Most lines of a configuration file sent as one span. */
export const MAX_CONFIG_LINES = 200;

/** The redacted configuration files of a call, read at most once. */
export interface ConfigFiles {
  /** Resolves to the redacted files by path; the first call reads them all in one batched read. */
  load(): Promise<ReadonlyMap<string, { content: string; lines: string[] }>>;
}

/**
 * The configuration files of a drift call: `paths` are read lazily, once, in one batched read at the
 * indexed commit and redacted as the indexing redacts them. With no path nothing is read.
 *
 * @param source The reader of the repository.
 * @param root The repository root.
 * @param commit The indexed commit.
 * @param paths The configuration paths, in byte order.
 */
export function configFilesOf(source: SourceTreePort, root: string, commit: string, paths: readonly string[]): ConfigFiles {
  let loaded: Promise<ReadonlyMap<string, { content: string; lines: string[] }>> | undefined;
  return {
    load(): Promise<ReadonlyMap<string, { content: string; lines: string[] }>> {
      loaded ??= (async () => {
        if (paths.length === 0) return new Map();
        const contents = await source.readFilesAt(root, commit, paths);
        return new Map(paths.map((path, i) => [path, redactedLines(path, contents[i])]));
      })();
      return loaded;
    },
  };
}

/** What `claimContext` needs of one claim. */
export interface ClaimContextRequest {
  /** The project. */
  projectId: string;
  /** The claim's text, used as the question of the context pack. */
  claimText: string;
  /** The token budget of the pack, and of the whole context; the pack's default when absent. */
  tokenBudget?: number;
}

/**
 * The context of one claim: the spans of the project's context pack for the claim's text, without the
 * spans of kind `doc` (the document is the claim's own source), then the configuration files (not named
 * `.env*`, not already in the pack) whose redacted content shares at least one term with the claim, in
 * path byte order, at most `MAX_CONFIG_SPANS`, each as one span of its first `MAX_CONFIG_LINES` lines
 * (`fileId` `UNSTORED_FILE_ID`, origin `heuristic`, distance 1). A file is added only when its tokens fit
 * the budget minus the tokens of the kept pack spans and of the configuration spans already added; a
 * file that does not fit is skipped and the next one is still tried. The configuration is read through
 * `configFiles` only when the claim has a term and a candidate.
 *
 * @param dependencies The store, the source reader and the absolute workspace root of the pack.
 * @param request The project, the claim and the budget.
 * @param configPaths The project's configuration paths, in byte order, `.env*` already excluded.
 * @param configFiles The memo of the configuration files of the call.
 * @returns The spans in order; empty when nothing bears on the claim.
 * @throws Any failure of the pack's reads or of the configuration read, unchanged.
 */
export async function claimContext(
  dependencies: ContextPackDependencies,
  request: ClaimContextRequest,
  configPaths: readonly string[],
  configFiles: ConfigFiles,
): Promise<ContextSpan[]> {
  const pack = await buildContextPack(dependencies, {
    projectId: request.projectId,
    question: request.claimText,
    ...(request.tokenBudget !== undefined && { tokenBudget: request.tokenBudget }),
  });
  const kept = pack.spans.filter((span) => span.fileKind !== 'doc');
  const terms = questionTerms(request.claimText);
  const inPack = new Set(kept.map((span) => span.path));
  const candidates = configPaths.filter((path) => !inPack.has(path));
  if (terms.length === 0 || candidates.length === 0) return kept;

  const files = await configFiles.load();
  let remaining = pack.tokenBudget - kept.reduce((sum, span) => sum + span.tokens, 0);
  const added: ContextSpan[] = [];
  for (const path of candidates) {
    if (added.length === MAX_CONFIG_SPANS) break;
    const file = files.get(path);
    if (file === undefined) continue;
    const content = normaliseText(file.content);
    if (!terms.some((term) => content.includes(term))) continue;
    const endLine = Math.min(file.lines.length, MAX_CONFIG_LINES);
    const text = spanText(file.lines, 1, endLine);
    const tokens = estimateTokens(text);
    if (tokens > remaining) continue;
    remaining -= tokens;
    added.push({ path, fileId: UNSTORED_FILE_ID, fileKind: 'config', startLine: 1, endLine, text, tokens, distance: 1, origin: 'heuristic' });
  }
  return [...kept, ...added];
}

/** The verdicts of a confrontation. */
export const CONFRONTATION_VERDICTS = ['contradicted', 'consistent', 'unrelated'] as const;

/** The confrontation output a model must return; strict, so a stray field discards the output. */
export const confrontationOutputSchema = z.strictObject({
  verdict: z.literal(CONFRONTATION_VERDICTS),
  statement: withoutNul(z.string().max(MAX_CLAIM_CHARS)),
  evidenceIds: z.array(withoutNul(z.string())).max(MAX_EVIDENCE_IDS_PER_STATEMENT),
});

/** A confrontation output that passed the quarantine. */
export type ConfrontationOutput = z.infer<typeof confrontationOutputSchema>;

/** The result of checking a confrontation output: the output, or the subcode of its discarding. */
export type ConfrontationOutputResult = { ok: true; output: ConfrontationOutput } | { ok: false; subcode: SchemaViolationSubcode };

/**
 * Checks a confrontation output against the quarantine, in this order: size, fence and JSON, shape
 * (`limit_exceeded` or `invalid_shape`), for a `contradicted` verdict a blank statement (`invalid_shape`)
 * then no evidence id (`empty_evidence`), for any verdict an id cited twice (`duplicate_evidence_id`)
 * then an id the prompt did not hold (`unknown_evidence_id`: `C1` and `D1` included).
 *
 * @param text The model's raw output; untrusted.
 * @param knownEvidenceIds The evidence ids `E1…En` given to the model.
 */
export function parseConfrontationOutput(text: string, knownEvidenceIds: ReadonlySet<string>): ConfrontationOutputResult {
  const json = parseDriftJson(text);
  if (!json.ok) return json;
  const parsed = confrontationOutputSchema.safeParse(json.json);
  if (!parsed.success) return { ok: false, subcode: driftShapeSubcode(parsed.error.issues) };
  const output = parsed.data;
  if (output.verdict === 'contradicted' && output.statement.trim() === '') return { ok: false, subcode: 'invalid_shape' };
  if (output.verdict === 'contradicted' && output.evidenceIds.length === 0) return { ok: false, subcode: 'empty_evidence' };
  if (new Set(output.evidenceIds).size !== output.evidenceIds.length) return { ok: false, subcode: 'duplicate_evidence_id' };
  if (output.evidenceIds.some((id) => !knownEvidenceIds.has(id))) return { ok: false, subcode: 'unknown_evidence_id' };
  return { ok: true, output };
}

/** The confrontation of one claim. */
export interface Confrontation {
  /** The prompt that was sent. */
  prompt: ConfrontationPrompt;
  /** The model name the call reported. */
  model: string;
  /** The output after the quarantine. */
  result: ConfrontationOutputResult;
}

/**
 * Confronts one claim with its context in exactly one `answer` call and quarantines the output.
 *
 * @param llm The model.
 * @param citation The claim's place in its document, with the redacted text of its lines.
 * @param sanitized The claim (as the question) and its context spans after `sanitizeForPrompt`.
 * @throws Any failure of the `answer` call, unchanged.
 */
export async function confrontClaim(llm: LlmPort, citation: DocumentCitation, sanitized: SanitizedPrompt): Promise<Confrontation> {
  const prompt = buildConfrontationPrompt(citation, sanitized);
  const completion = await llm.complete({ messages: prompt.messages, purpose: 'answer' });
  return { prompt, model: completion.model, result: parseConfrontationOutput(completion.text, new Set(prompt.evidenceIds.keys())) };
}

/** Whether `path` is a configuration file that may enter a prompt: its name does not start with `.env`. */
export function isPromptableConfig(path: string): boolean {
  return !basename(path).startsWith('.env');
}
