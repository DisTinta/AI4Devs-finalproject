import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Command, CommanderError } from 'commander';
import { createGitSourceTree } from '@codemind/adapter-git';
import { createLlm, llmConfigFromEnv } from '@codemind/adapter-llm';
import type { LlmConfig } from '@codemind/adapter-llm';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import {
  createInMemoryVerificationCache,
  drift as coreDrift,
  InvalidDriftRequest,
  parseDriftRequest,
  withDailyBudget,
} from '@codemind/core';
import type { AnsweredDrift, drift, DriftDocument, LlmPort, SourceTreePort, UnknownDrift } from '@codemind/core';
import { CliError, CONNECTION_TIMEOUT_MS, DatabaseUnavailable } from '../compose-index.js';
import type { CliFailure, Environment } from '../compose-index.js';
import { createLogger } from '../logger.js';
import type { TextSink } from '../logger.js';
import { terminalSafeText, toTerminalSafeJson } from '../safe-json.js';
import { CLI_VERSION } from '../version.js';
import { excerptLines, indent, safeLines, toFailure as toAskFailure } from './ask.js';
import type { OpenedStore } from './ask.js';

// The `drift <project> [--doc <path>]` command (DIS-73, spec cli-drift): the drift use case from the
// command line, with the shape of `ask` (exit codes, one JSON error line, nothing quoted, connections
// always closed). In evaluation mode it serves the versioned golden drift report through the use case.

/**
 * The repository root, against which a sample's relative `root_path` resolves: four levels up from
 * `packages/cli/src/commands/` (or `dist/commands/`), as `ask` computes it.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** `application_name` of the command's sessions, so they can be observed in `pg_stat_activity`. */
export const DRIFT_APPLICATION_NAME = 'codemind-drift';

/** What `runDriftCommand` reads from and writes to, plus the test seams (design D4). */
export interface DriftCommandDeps {
  /** Where `DATABASE_URL` and the `LLM_*` variables are read. */
  env: Environment;
  /** Receives only the report, or the help. */
  stdout: TextSink;
  /** Receives the report's events and the error line. */
  stderr: TextSink;
  /** Opens the store on `DATABASE_URL` and checks it answers. Defaults to {@link defaultOpenStore}. */
  openStore?: (databaseUrl: string) => Promise<OpenedStore>;
  /** Builds the model from its configuration. Defaults to `createLlm` of `@codemind/adapter-llm`. */
  createLlm?: (config: LlmConfig) => LlmPort;
  /** Reads the project's files. Defaults to `createGitSourceTree()`. */
  source?: SourceTreePort;
  /** The use case. Defaults to core's `drift`. */
  drift?: typeof drift;
  /** The clock. Defaults to the system clock. */
  now?: () => Date;
}

/**
 * Runs `drift <project> [--doc <path>]` (DIS-73): checks the request as the use case does, before the
 * environment is read; resolves the project by its exact name; calls `drift` once, with a new in-memory
 * verification cache, and prints its report, or `UNKNOWN (<reason>)`, to stdout; the report's events go
 * to stderr as JSON lines, `evidence_broken` at level `error` and every other event at `info`, whatever
 * the exit code. Every usage and configuration error is detected before any connection is opened, and
 * every connection is closed before it returns. It never touches `process`: it returns the exit code,
 * `0` a report, an `UNKNOWN` or the help; `1` a configuration, connection, domain or unexpected error;
 * `2` a usage error or an invalid request. On error stdout stays empty and stderr gets one
 * `{"error":{…}}` line, which never holds the document path given.
 *
 * @param argv The arguments starting with `drift`, as in `process.argv.slice(2)`.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code.
 */
export async function runDriftCommand(argv: string[], deps: DriftCommandDeps): Promise<number> {
  try {
    const parsed = parseArguments(argv, deps);
    if (parsed === 'done') return 0;
    parseDriftRequest({ projectId: '', ...(parsed.doc !== undefined && { docPath: parsed.doc }) });
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
      const report = await (deps.drift ?? coreDrift)(
        {
          store,
          source: deps.source ?? createGitSourceTree(),
          llm,
          workspaceRoot: REPO_ROOT,
          now,
          // One cache per run, which is one per process: only pairs repeated within the report hit it.
          verificationCache: createInMemoryVerificationCache(),
        },
        { projectId: project.id, ...(parsed.doc !== undefined && { docPath: parsed.doc }) },
      );
      deps.stdout.write(report.status === 'unknown' ? formatDriftUnknown(report) : formatDriftReport(report));
      if (report.status === 'answered') {
        const logger = createLogger(deps.stderr);
        // A broken citation is a system failure; every other event is information.
        for (const event of report.events) {
          const broken = event.type === 'drift_check_event' && event.event.type === 'evidence_broken';
          (broken ? logger.error : logger.info)({ ...event });
        }
      }
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
 * The default store (design D4): a `pg.Pool` on `databaseUrl` whose sessions carry the
 * `application_name` {@link DRIFT_APPLICATION_NAME}, each write committing on its own connection. A probe
 * `connect()` checks the database answers; when it does not, the pool is ended and
 * {@link DatabaseUnavailable} is thrown, without the driver's message (it names host and port).
 *
 * @param databaseUrl The trimmed `DATABASE_URL`.
 * @returns The store and the function that ends the pool.
 * @throws DatabaseUnavailable when the database refuses or does not answer within the timeout.
 */
export async function defaultOpenStore(databaseUrl: string): Promise<OpenedStore> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    application_name: DRIFT_APPLICATION_NAME,
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
 * The text of an `UNKNOWN` drift report: `UNKNOWN (<reason>)` and, for `llm-required` only, the line
 * `evaluation mode (cache-only): set LLM_* to enable drift`.
 *
 * @param report The `unknown` report.
 * @returns The text, with its final line feed.
 */
export function formatDriftUnknown(report: UnknownDrift): string {
  const lines = [`UNKNOWN (${report.reason})`];
  if (report.reason === 'llm-required') lines.push('evaluation mode (cache-only): set LLM_* to enable drift');
  return `${lines.join('\n')}\n`;
}

/** Indentation of the lines under a numbered contradiction. */
const ITEM_INDENT = 3;

/** Indentation of an excerpt line under its citation. */
const EXCERPT_INDENT = 6;

/**
 * The text of an answered drift report (spec "Drift report output"): one block per document, separated by
 * an empty line, each with its counts and, per contradiction, the numbered statement, the claim, the
 * document citation and each code citation with their excerpts cut to the first lines; and, for a golden
 * report, an empty line and `note: golden report (answer cache)` last. Every untrusted text is escaped line
 * by line. An empty line is printed without indentation. Neither the usage nor the provenance is printed.
 *
 * @param report The answered report.
 * @returns The text, with its final line feed.
 */
export function formatDriftReport(report: AnsweredDrift): string {
  const lines = report.documents.flatMap((document, i) => (i === 0 ? documentBlock(document) : ['', ...documentBlock(document)]));
  if (report.cacheHit) lines.push('', 'note: golden report (answer cache)');
  return `${lines.join('\n')}\n`;
}

/** The block of one document: its counts line, then its numbered contradictions. */
function documentBlock(document: DriftDocument): string[] {
  const lines = [
    `${terminalSafeText(document.path)}: ${document.claimsChecked} claims checked, ${document.omittedClaims} omitted, ` +
      `${document.droppedClaims} dropped, ${document.contradictions.length} contradictions`,
  ];
  document.contradictions.forEach((contradiction, i) => {
    const { claim } = contradiction;
    lines.push(...continued(`${i + 1}. [INFERENCE] `, safeLines(contradiction.statement)));
    lines.push(...continued(`${' '.repeat(ITEM_INDENT)}claim: `, safeLines(claim.text)));
    lines.push(`${' '.repeat(ITEM_INDENT)}doc: ${citation(claim)} (${claim.verification})`);
    lines.push(...excerptLines(claim.excerpt).map((line) => indent(line, EXCERPT_INDENT)));
    for (const evidence of contradiction.evidence) {
      lines.push(`${' '.repeat(ITEM_INDENT)}code: ${citation(evidence)} (${evidence.verification})`);
      lines.push(...excerptLines(evidence.excerpt).map((line) => indent(line, EXCERPT_INDENT)));
    }
  });
  return lines;
}

/** `<first line>` after `prefix`, then each further line indented by {@link ITEM_INDENT} spaces. */
function continued(prefix: string, text: string[]): string[] {
  const [first = '', ...rest] = text;
  return [`${prefix}${first}`, ...rest.map((line) => indent(line, ITEM_INDENT))];
}

/** `<path>:<startLine>-<endLine>`, the path escaped. */
function citation(span: { path: string; startLine: number; endLine: number }): string {
  return `${terminalSafeText(span.path)}:${span.startLine}-${span.endLine}`;
}

/**
 * Maps any error to what the CLI prints (design D4): an invalid drift request is a usage error (exit 2,
 * `invalid drift request`, the field), and every other error is mapped as the `ask` command maps it. No
 * message holds the document path given.
 *
 * @param error What was thrown.
 * @returns The failure to print.
 */
export function toFailure(error: unknown): CliFailure {
  if (error instanceof InvalidDriftRequest) {
    return { code: error.code, exit: 2, message: 'invalid drift request', details: { field: error.field } };
  }
  return toAskFailure(error);
}

/** `USAGE` messages per `commander` error code: never `commander`'s text, which quotes the argument. */
const USAGE_MESSAGES: Record<string, string> = {
  'commander.missingArgument': 'missing argument',
  'commander.excessArguments': 'too many arguments',
  'commander.unknownOption': 'unknown option',
  'commander.optionMissingArgument': 'option requires a value',
};

/** The arguments, as typed. */
interface DriftArguments {
  project: string;
  doc?: string;
}

/**
 * Parses `argv` with a fresh command whose output goes to the injected streams; `commander` never prints
 * an error of its own: its errors become `USAGE` with a fixed message.
 *
 * @returns `'done'` when the help or the version was printed, otherwise the arguments.
 */
function parseArguments(argv: string[], deps: DriftCommandDeps): DriftArguments | 'done' {
  const command = new Command('codemind drift')
    .description('Find what the documents of a stored project say that its code contradicts')
    .argument('<project>', 'project name, exactly as stored')
    .option('--doc <path>', 'check only this stored document')
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
  const [project] = command.processedArgs as [string];
  const { doc } = command.opts<{ doc?: string }>();
  return { project, ...(doc !== undefined && { doc }) };
}
