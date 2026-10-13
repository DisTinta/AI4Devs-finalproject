import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Command, CommanderError } from 'commander';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createLlm, LlmConfigError, llmConfigFromEnv } from '@codemind/adapter-llm';
import type { LlmConfig } from '@codemind/adapter-llm';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import {
  BudgetExhausted,
  explain as coreExplain,
  InvalidExplainRequest,
  LlmUnavailable,
  parseExplainRequest,
  ProjectNotFound,
  SourceUnavailable,
  withDailyBudget,
} from '@codemind/core';
import type { AnsweredExplain, AnswerEvidence, explain, LlmPort, SourceTreePort, StorePort, UnknownExplain } from '@codemind/core';
import { CliError, CONNECTION_TIMEOUT_MS, DatabaseUnavailable } from '../compose-index.js';
import type { CliFailure, Environment } from '../compose-index.js';
import { createLogger } from '../logger.js';
import type { TextSink } from '../logger.js';
import { terminalSafeText, toTerminalSafeJson } from '../safe-json.js';
import { CLI_VERSION } from '../version.js';

/**
 * The repository root, against which a sample's relative `root_path` resolves: four levels up from
 * `packages/cli/src/commands/` (or `dist/commands/`), as `DEFAULT_REPO_ROOT` of `seed-build.ts`.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** `application_name` of the command's sessions, so they can be observed in `pg_stat_activity`. */
export const ASK_APPLICATION_NAME = 'codemind-ask';

/** The store the command opened, and how to close its connections. */
export interface OpenedStore {
  /** The store, each write committing on its own pooled connection. */
  store: StorePort;
  /** Closes every connection; called once, whatever happened. */
  close(): Promise<void>;
}

/** What `runAskCommand` reads from and writes to, plus the test seams (DIS-40 design D1). */
export interface AskCommandDeps {
  /** Where `DATABASE_URL` and the `LLM_*` variables are read. */
  env: Environment;
  /** Receives only the answer, or the help. */
  stdout: TextSink;
  /** Receives the answer's events and the error line. */
  stderr: TextSink;
  /** Opens the store on `DATABASE_URL` and checks it answers. Defaults to {@link defaultOpenStore}. */
  openStore?: (databaseUrl: string) => Promise<OpenedStore>;
  /** Builds the model from its configuration. Defaults to `createLlm` of `@codemind/adapter-llm`. */
  createLlm?: (config: LlmConfig) => LlmPort;
  /** Reads the project's files. Defaults to `createGitSourceTree()`. */
  source?: SourceTreePort;
  /** The use case. Defaults to core's `explain`. */
  explain?: typeof explain;
  /** The clock. Defaults to the system clock. */
  now?: () => Date;
}

/**
 * Runs `ask <project> <question>` (DIS-40): resolves the project by its exact name, asks `explain`
 * once and prints the answer, or `UNKNOWN (<reason>)`, to stdout; the answer's events go to stderr as
 * JSON lines. Every usage and configuration error is detected before any connection is opened
 * (design D2), and every connection is closed before it returns. It never touches `process`: it
 * returns the exit code — `0` an answer, an `UNKNOWN` or the help; `1` a configuration, connection,
 * domain or unexpected error; `2` a usage error or an invalid question. On error stdout stays empty
 * and stderr gets one `{"error":{…}}` line, which never holds the question.
 *
 * @param argv The arguments starting with `ask`, as in `process.argv.slice(2)`.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code.
 */
export async function runAskCommand(argv: string[], deps: AskCommandDeps): Promise<number> {
  try {
    const parsed = parseArguments(argv, deps);
    if (parsed === 'done') return 0;
    parseExplainRequest({ projectId: '', question: parsed.question });
    const databaseUrl = deps.env.DATABASE_URL?.trim() ?? '';
    if (databaseUrl === '') throw new CliError('MISSING_CONFIG', 1, 'DATABASE_URL is not set', { variable: 'DATABASE_URL' });
    const config = llmConfigFromEnv(deps.env);
    const { store, close } = await (deps.openStore ?? defaultOpenStore)(databaseUrl);
    try {
      const project = (await store.listProjects()).find((candidate) => candidate.name === parsed.project);
      if (project === undefined) throw new CliError('PROJECT_NOT_FOUND', 1, 'project not found');
      const now = deps.now ?? (() => new Date());
      const model = (deps.createLlm ?? createLlm)(config);
      const llm =
        config.mode === 'live' && config.dailyBudgetUsd !== undefined
          ? withDailyBudget(model, { store, dailyBudgetUsd: config.dailyBudgetUsd, now })
          : model;
      const answer = await (deps.explain ?? coreExplain)(
        { store, source: deps.source ?? createGitSourceTree(), llm, workspaceRoot: REPO_ROOT, now },
        { projectId: project.id, question: parsed.question },
      );
      deps.stdout.write(answer.kind === 'unknown' ? formatUnknown(answer) : formatAnswer(answer));
      const logger = createLogger(deps.stderr);
      for (const event of answer.events) logger.info({ ...event });
      return 0;
    } finally {
      await close().catch(() => undefined);
    }
  } catch (error) {
    const failure = toFailure(error);
    deps.stderr.write(`${toTerminalSafeJson({ error: { code: failure.code, message: failure.message, details: failure.details } })}\n`);
    return failure.exit;
  }
}

/**
 * The default store (design D3): a `pg.Pool` on `databaseUrl`, each write committing on its own
 * connection, so no transaction is held open while the model answers. A probe `connect()` checks the
 * database answers; when it does not, the pool is ended and {@link DatabaseUnavailable} is thrown,
 * without the driver's message (it names host and port).
 *
 * @param databaseUrl The trimmed `DATABASE_URL`.
 * @returns The store and the function that ends the pool.
 * @throws DatabaseUnavailable when the database refuses or does not answer within the timeout.
 */
export async function defaultOpenStore(databaseUrl: string): Promise<OpenedStore> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    application_name: ASK_APPLICATION_NAME,
  });
  // An idle client's error would otherwise crash the process; the next query reports it.
  pool.on('error', () => undefined);
  try {
    (await pool.connect()).release();
  } catch {
    await pool.end().catch(() => undefined);
    throw new DatabaseUnavailable();
  }
  return { store: createPostgresStore({ pool }), close: () => pool.end() };
}

/**
 * The text of an `UNKNOWN` answer: `UNKNOWN (<reason>)` and, for `llm-required` only, its message on
 * the next line, escaped as any other text ({@link safeLines}).
 *
 * @param answer The `UNKNOWN` answer.
 * @returns The text, with its final line feed.
 */
export function formatUnknown(answer: UnknownExplain): string {
  const lines = [`UNKNOWN (${answer.reason})`];
  if (answer.reason === 'llm-required' && answer.message !== undefined) lines.push(...safeLines(answer.message));
  return `${lines.join('\n')}\n`;
}

/** Most lines of an excerpt printed; the rest is counted in a `… (+k lines)` line. */
export const MAX_EXCERPT_LINES = 5;

/** Indentation of a line under a numbered statement or prior claim. */
const ITEM_INDENT = 3;

/** Indentation of an excerpt line under its span. */
const EXCERPT_INDENT = 4;

/**
 * The text of an answered question (spec "Ask answer output"): the answer; `statements:` with each
 * statement numbered, typed, marked `[stale]`, its warning and its cited spans; `evidence:` with each
 * distinct cited span and its excerpt cut to {@link MAX_EXCERPT_LINES} lines; `prior claims:` when
 * there are any; and `note: claims not saved` last when the claims were not stored. Every untrusted
 * text is escaped line by line ({@link safeLines}). An empty line is printed without indentation.
 *
 * @param answer The answer.
 * @returns The text, with its final line feed.
 */
export function formatAnswer(answer: AnsweredExplain): string {
  const byId = new Map(answer.evidence.map((entry) => [entry.id, entry]));
  const cited = (ids: string[]): AnswerEvidence[] =>
    ids.map((id) => byId.get(id)).filter((entry): entry is AnswerEvidence => entry !== undefined);
  const lines = [...safeLines(answer.answer), '', 'statements:'];
  answer.statements.forEach((statement, i) => lines.push(...item(i + 1, statement.type, statement, safeLines(statement.text), cited(statement.evidenceIds))));
  lines.push('', 'evidence:');
  const listed = new Set<string>();
  for (const entry of cited(answer.statements.flatMap((statement) => statement.evidenceIds))) {
    const key = `${entry.fileId}:${entry.startLine}:${entry.endLine}`;
    if (listed.has(key)) continue;
    listed.add(key);
    lines.push(spanOf(entry));
    if (entry.excerpt !== null) lines.push(...excerptLines(entry.excerpt).map((line) => indent(line, EXCERPT_INDENT)));
  }
  if (answer.priorClaims.length > 0) {
    lines.push('', 'prior claims:');
    answer.priorClaims.forEach((claim, i) =>
      lines.push(...item(i + 1, claim.type, claim, claim.text === null ? ['(no text)'] : safeLines(claim.text), claim.evidence)),
    );
  }
  if (!answer.persisted) lines.push('', 'note: claims not saved');
  return `${lines.join('\n')}\n`;
}

/**
 * Splits an untrusted text into printable lines (design D5): one trailing line break dropped, a split
 * at each line feed (with an optional preceding carriage return), each tab replaced by two spaces,
 * then each line printed as it is, or as its escaped literal when it holds a control or a
 * terminal-unsafe character ({@link terminalSafeText}).
 *
 * @param text The text.
 * @returns Its lines, each safe on a terminal.
 */
export function safeLines(text: string): string[] {
  return splitLines(text).map(safeLine);
}

/**
 * The lines of an excerpt: split as {@link safeLines} does, cut to its first
 * {@link MAX_EXCERPT_LINES} lines before escaping, then `… (+k lines)` when `k` lines were left out.
 *
 * @param excerpt The excerpt.
 * @returns The lines to print, without indentation.
 */
export function excerptLines(excerpt: string): string[] {
  const lines = splitLines(excerpt);
  const kept = lines.slice(0, MAX_EXCERPT_LINES).map(safeLine);
  const left = lines.length - kept.length;
  return left > 0 ? [...kept, `… (+${left} lines)`] : kept;
}

/** The lines of `text`, one trailing line break dropped. */
function splitLines(text: string): string[] {
  return text.replace(/\r?\n$/, '').split(/\r?\n/);
}

/** One line with its tabs expanded, escaped when it is not printable. */
function safeLine(line: string): string {
  return terminalSafeText(line.replaceAll('\t', '  '));
}

/** `line` indented by `spaces`; an empty line stays empty. */
function indent(line: string, spaces: number): string {
  return line === '' ? '' : `${' '.repeat(spaces)}${line}`;
}

/** `<path>:<startLine>-<endLine>`, the path escaped. */
function spanOf(entry: AnswerEvidence): string {
  return `${terminalSafeText(entry.path)}:${entry.startLine}-${entry.endLine}`;
}

/** A numbered statement or prior claim: its text, its warning and its cited spans. */
function item(
  n: number,
  type: string,
  marks: { status: 'current' | 'stale'; warning?: 'stale-evidence' },
  text: string[],
  evidence: AnswerEvidence[],
): string[] {
  const [first = '', ...rest] = text;
  const lines = [`${n}. [${type}]${marks.status === 'stale' ? ' [stale]' : ''} ${first}`, ...rest.map((line) => indent(line, ITEM_INDENT))];
  if (marks.warning !== undefined) lines.push(indent(`warning: ${marks.warning}`, ITEM_INDENT));
  if (evidence.length > 0) lines.push(indent(`evidence: ${evidence.map(spanOf).join(', ')}`, ITEM_INDENT));
  return lines;
}

/**
 * Maps any error to what the CLI prints (design D6). Every message is built here: the message of a
 * domain or unknown error is never reused, and none holds the question.
 *
 * @param error What was thrown.
 * @returns The failure to print.
 */
export function toFailure(error: unknown): CliFailure {
  if (error instanceof CliError) return { code: error.code, exit: error.exit, message: error.message, details: error.details };
  if (error instanceof InvalidExplainRequest) {
    return { code: error.code, exit: 2, message: 'invalid question', details: { field: error.field } };
  }
  if (error instanceof LlmConfigError) {
    return error.modelVariable === undefined
      ? failure(error.code, `${error.variable} is missing or invalid; see .env.example`, { variable: error.variable })
      : failure(error.code, `${error.variable} is set but ${error.modelVariable} has no price in COST_TABLE; see .env.example`, {
          variable: error.variable,
          modelVariable: error.modelVariable,
        });
  }
  if (error instanceof DatabaseUnavailable) return failure('DATABASE_UNAVAILABLE', 'cannot connect to the database');
  if (error instanceof ProjectNotFound) return failure(error.code, 'project not found');
  if (error instanceof SourceUnavailable) {
    return failure(error.code, "the project's source cannot be read", {
      reason: error.reason,
      ...(error.path !== undefined && { path: error.path }),
    });
  }
  if (error instanceof LlmUnavailable) {
    const { status, expected, received, systemCode } = error;
    return failure(error.code, 'the language model is unavailable', {
      reason: error.reason,
      ...(status !== undefined && { status }),
      ...(expected !== undefined && { expected }),
      ...(received !== undefined && { received }),
      ...(systemCode !== undefined && { systemCode }),
    });
  }
  if (error instanceof BudgetExhausted) {
    return failure(error.code, 'the daily LLM budget is exhausted', {
      spentUsd: error.spentUsd,
      dailyBudgetUsd: error.dailyBudgetUsd,
      resetsAt: error.resetsAt.toISOString(),
    });
  }
  return failure('INTERNAL', 'unexpected error');
}

/** A failure with exit `1`. */
function failure(code: string, message: string, details: Record<string, unknown> = {}): CliFailure {
  return { code, exit: 1, message, details };
}

/** `USAGE` messages per `commander` error code: never `commander`'s text, which quotes the argument. */
const USAGE_MESSAGES: Record<string, string> = {
  'commander.missingArgument': 'missing argument',
  'commander.excessArguments': 'too many arguments',
  'commander.unknownOption': 'unknown option',
};

/** The two positional arguments, as typed. */
interface AskArguments {
  project: string;
  question: string;
}

/**
 * Parses `argv` with a fresh command whose output goes to the injected streams; `commander` never
 * prints an error of its own: its errors become `USAGE` with a fixed message.
 *
 * @returns `'done'` when the help or the version was printed, otherwise the arguments.
 */
function parseArguments(argv: string[], deps: AskCommandDeps): AskArguments | 'done' {
  const command = new Command('codemind ask')
    .description('Ask a question about a stored project')
    .argument('<project>', 'project name, exactly as stored')
    .argument('<question>', 'the question, 1 to 1,000 code points')
    .version(CLI_VERSION)
    .allowExcessArguments(false)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => deps.stdout.write(text),
      writeErr: (text) => deps.stderr.write(text),
      outputError: () => undefined,
    });
  try {
    command.parse(argv.slice(1), { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return 'done';
      throw new CliError('USAGE', 2, USAGE_MESSAGES[error.code] ?? 'invalid usage');
    }
    throw error;
  }
  const [project, question] = command.processedArgs as [string, string];
  return { project, question };
}
