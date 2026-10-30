import pg from 'pg';
import { Command, CommanderError } from 'commander';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { impact as coreImpact, InvalidImpactRequest, parseImpactRequest, ProjectNotFound } from '@codemind/core';
import type { ImpactEntry, ImpactReport, impact } from '@codemind/core';
import { CliError, CONNECTION_TIMEOUT_MS, DatabaseUnavailable } from '../compose-index.js';
import type { CliFailure, Environment } from '../compose-index.js';
import { createLogger } from '../logger.js';
import type { TextSink } from '../logger.js';
import { terminalSafeText, toTerminalSafeJson } from '../safe-json.js';
import { CLI_VERSION } from '../version.js';
import type { OpenedStore } from './ask.js';

// The `impact <project> <change>` command (DIS-90, spec cli-impact): the impact use case from the
// command line, with the shape of `ask` (exit codes, one JSON error line, nothing quoted, connections
// always closed) and no model.

/** `application_name` of the command's sessions, so they can be observed in `pg_stat_activity`. */
export const IMPACT_APPLICATION_NAME = 'codemind-impact';

/** What `runImpactCommand` reads from and writes to, plus the test seams (design D6). */
export interface ImpactCommandDeps {
  /** Where `DATABASE_URL` is read; nothing else is. */
  env: Environment;
  /** Receives only the report, or the help. */
  stdout: TextSink;
  /** Receives the report's events and the error line. */
  stderr: TextSink;
  /** Opens the store on `DATABASE_URL` and checks it answers. Defaults to {@link defaultOpenStore}. */
  openStore?: (databaseUrl: string) => Promise<OpenedStore>;
  /** The use case. Defaults to core's `impact`. */
  impact?: typeof impact;
  /** The clock the use case reads. Defaults to the system clock. */
  now?: () => Date;
}

/**
 * Runs `impact <project> <change>` (DIS-90): checks the request as the use case does, before the
 * environment is read; resolves the project by its exact name; calls `impact` once and prints its
 * report, or `UNKNOWN (<reason>)`, to stdout; the report's events go to stderr as `info` JSON lines.
 * Every connection is closed before it returns. It never touches `process`: it returns the exit code,
 * `0` a report, an `UNKNOWN` or the help; `1` a configuration, connection, domain or unexpected error;
 * `2` a usage error or an invalid request. On error stdout stays empty and stderr gets one
 * `{"error":{…}}` line, which never holds the change.
 *
 * @param argv The arguments starting with `impact`, as in `process.argv.slice(2)`.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code.
 */
export async function runImpactCommand(argv: string[], deps: ImpactCommandDeps): Promise<number> {
  try {
    const parsed = parseArguments(argv, deps);
    if (parsed === 'done') return 0;
    parseImpactRequest({ projectId: '', change: parsed.change, maxHops: hopsOf(parsed.maxHops) });
    const databaseUrl = deps.env.DATABASE_URL?.trim() ?? '';
    if (databaseUrl === '') throw new CliError('MISSING_CONFIG', 1, 'DATABASE_URL is not set', { variable: 'DATABASE_URL' });
    const { store, close } = await (deps.openStore ?? defaultOpenStore)(databaseUrl);
    try {
      const project = (await store.listProjects()).find((candidate) => candidate.name === parsed.project);
      if (project === undefined) throw new CliError('PROJECT_NOT_FOUND', 1, 'project not found');
      const report = await (deps.impact ?? coreImpact)(
        store,
        { projectId: project.id, change: parsed.change, ...(parsed.maxHops !== undefined && { maxHops: hopsOf(parsed.maxHops) }) },
        { now: deps.now ?? (() => new Date()) },
      );
      deps.stdout.write(formatReport(report));
      const logger = createLogger(deps.stderr);
      for (const event of report.events ?? []) logger.info({ ...event });
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
 * The default store, built as the one of `ask` (design D7): a `pg.Pool` on `databaseUrl`, each write
 * committing on its own connection. A probe `connect()` checks the database answers; when it does not,
 * the pool is ended and {@link DatabaseUnavailable} is thrown, without the driver's message (it names
 * host and port).
 *
 * @param databaseUrl The trimmed `DATABASE_URL`.
 * @returns The store and the function that ends the pool.
 * @throws DatabaseUnavailable when the database refuses or does not answer within the timeout.
 */
export async function defaultOpenStore(databaseUrl: string): Promise<OpenedStore> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    application_name: IMPACT_APPLICATION_NAME,
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
 * The text of a report: `UNKNOWN (<reason>)` for an unknown one; otherwise the `DIRECTO`, `INDIRECTO`
 * and `TESTS` sections, each entry on one line, and `RIESGO <level>` with its rationale. Every symbol
 * and file goes through {@link terminalSafeText}. The change is never printed.
 *
 * @param report The report.
 * @returns The text, with its final line feed.
 */
export function formatReport(report: ImpactReport): string {
  if (report.status === 'unknown') return `UNKNOWN (${report.reason})\n`;
  const lines = [
    'DIRECTO',
    ...entryLines(report.direct.map(dependantLine)),
    '',
    'INDIRECTO',
    ...entryLines(report.indirect.map(dependantLine)),
    '',
    'TESTS',
    ...entryLines(report.tests.map((test) => `  ${named(test.symbol, test.file)}  [grafo]`)),
    '',
    `RIESGO ${report.risk.level}`,
    report.risk.rationale,
  ];
  return `${lines.join('\n')}\n`;
}

/** The lines of a list, or `  (ninguno)` when it has none. */
function entryLines(lines: string[]): string[] {
  return lines.length === 0 ? ['  (ninguno)'] : lines;
}

/** `<symbol>  <file>`, or the path alone when the component is a file. */
function named(symbol: string, file: string): string {
  return symbol === file ? terminalSafeText(file) : `${terminalSafeText(symbol)}  ${terminalSafeText(file)}`;
}

/** One entry of `direct` or `indirect`. */
function dependantLine(entry: ImpactEntry): string {
  return `  ${named(entry.symbol, entry.file)}  ${entry.hops} ${entry.hops === 1 ? 'salto' : 'saltos'}  ${entry.resolution}  [grafo]`;
}

/**
 * Maps any error to what the CLI prints (design D6). Every message is built here: the message of a
 * domain or unknown error is never reused, and none holds the change.
 *
 * @param error What was thrown.
 * @returns The failure to print.
 */
export function toFailure(error: unknown): CliFailure {
  if (error instanceof CliError) return { code: error.code, exit: error.exit, message: error.message, details: error.details };
  if (error instanceof InvalidImpactRequest) {
    return { code: error.code, exit: 2, message: 'invalid impact request', details: { field: error.field } };
  }
  if (error instanceof DatabaseUnavailable) return failure('DATABASE_UNAVAILABLE', 'cannot connect to the database');
  if (error instanceof ProjectNotFound) return failure(error.code, 'project not found');
  return failure('INTERNAL', 'unexpected error');
}

/** A failure with exit `1`. */
function failure(code: string, message: string, details: Record<string, unknown> = {}): CliFailure {
  return { code, exit: 1, message, details };
}

/**
 * The hop count the use case checks: the digits of `--max-hops` as a number, `NaN` when it is not
 * written only with the digits 0 to 9 (so the use case's own schema names `maxHops`), `undefined` when
 * the option is absent.
 */
function hopsOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
}

/** `USAGE` messages per `commander` error code: never `commander`'s text, which quotes the argument. */
const USAGE_MESSAGES: Record<string, string> = {
  'commander.missingArgument': 'missing argument',
  'commander.excessArguments': 'too many arguments',
  'commander.unknownOption': 'unknown option',
  'commander.optionMissingArgument': 'missing option value',
};

/** The two positional arguments and the option, as typed. */
interface ImpactArguments {
  project: string;
  change: string;
  maxHops?: string;
}

/**
 * Parses `argv` with a fresh command whose output goes to the injected streams; `commander` never
 * prints an error of its own: its errors become `USAGE` with a fixed message.
 *
 * @returns `'done'` when the help or the version was printed, otherwise the arguments.
 */
function parseArguments(argv: string[], deps: ImpactCommandDeps): ImpactArguments | 'done' {
  const command = new Command('codemind impact')
    .description('Analyze the impact of a change on a stored project')
    .argument('<project>', 'project name, exactly as stored')
    .argument('<change>', 'the change, in words, 5 to 500 code points')
    .option('--max-hops <n>', 'hops to follow, 1 to 3 (default 2)')
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
  const [project, change] = command.processedArgs as [string, string];
  const { maxHops } = command.opts<{ maxHops?: string }>();
  return { project, change, ...(maxHops !== undefined && { maxHops }) };
}
