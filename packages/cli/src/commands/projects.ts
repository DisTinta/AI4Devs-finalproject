import type { ClientBase } from 'pg';
import { Command, CommanderError } from 'commander';
import type { Project } from '@codemind/core';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { CliError, DatabaseUnavailable, defaultOpenTransaction } from '../compose-index.js';
import type { Environment, OpenTransaction } from '../compose-index.js';
import type { TextSink } from '../logger.js';
import { terminalSafeText, toTerminalSafeJson } from '../safe-json.js';
import { CLI_VERSION } from '../version.js';

/** Message of every unexpected failure: the command only reads, so nothing was changed. */
export const PROJECTS_FAILED = 'unexpected error; nothing was changed';

/** What `runProjectsCommand` reads from and writes to, plus the test seams (DIS-92 design D4). */
export interface ProjectsCommandDeps {
  /** Where `DATABASE_URL` is read. */
  env: Environment;
  /** Receives the listing or the help. */
  stdout: TextSink;
  /** Receives only the error line. */
  stderr: TextSink;
  /** Opens the read transaction, always rolled back. Defaults to `defaultOpenTransaction(DATABASE_URL)`. */
  openTransaction?: OpenTransaction;
  /** Lists the projects on the transaction's client. Defaults to the store's `listProjects`. */
  listProjects?: (client: ClientBase) => Promise<Project[]>;
}

/**
 * Runs `projects` (DIS-92): lists every stored project through `StorePort.listProjects`, one line
 * each, in a transaction it always rolls back. No HTTP. It never touches `process`: it returns the
 * exit code — `0` success or help; `1` a configuration, connection or unexpected error; `2` a usage
 * error. On error stdout stays empty and stderr gets one `{"error":{…}}` line.
 *
 * @param argv The arguments starting with `projects`, as in `process.argv.slice(2)`.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code.
 */
export async function runProjectsCommand(argv: string[], deps: ProjectsCommandDeps): Promise<number> {
  try {
    if (parseArguments(argv, deps) === 'done') return 0;
    const databaseUrl = deps.env.DATABASE_URL?.trim() ?? '';
    if (databaseUrl === '') throw new CliError('MISSING_CONFIG', 1, 'DATABASE_URL is not set', { variable: 'DATABASE_URL' });
    const list = deps.listProjects ?? ((client: ClientBase) => createPostgresStore({ transaction: client }).listProjects());
    const transaction = await (deps.openTransaction ?? defaultOpenTransaction(databaseUrl))();
    let projects: Project[];
    try {
      projects = await list(transaction.client);
    } finally {
      await transaction.rollback().catch(() => undefined);
      await transaction.release().catch(() => undefined);
    }
    deps.stdout.write(projects.length === 0 ? 'no projects\n' : projects.map((p) => `${formatProjectLine(p)}\n`).join(''));
    return 0;
  } catch (error) {
    const failure =
      error instanceof CliError
        ? { code: error.code, exit: error.exit, message: error.message, details: error.details }
        : error instanceof DatabaseUnavailable
          ? { code: 'DATABASE_UNAVAILABLE', exit: 1, message: error.message, details: {} }
          : { code: 'INTERNAL', exit: 1, message: PROJECTS_FAILED, details: {} };
    deps.stderr.write(`${toTerminalSafeJson({ error: { code: failure.code, message: failure.message, details: failure.details } })}\n`);
    return failure.exit;
  }
}

/**
 * One line of the listing: `<name>  <id>  <language>/<framework>  <nodes> nodes · <edges> edges
 * <indexedAt>[ sample]`, two spaces between fields, `-` without framework, `not indexed` without
 * `indexedAt`. A name, language or framework holding a control or a terminal-unsafe character is
 * printed as its escaped literal ({@link terminalSafeText}).
 *
 * @param project A stored project.
 * @returns The line, without its line feed.
 */
export function formatProjectLine(project: Project): string {
  const fields = [
    terminalSafeText(project.name),
    project.id,
    `${terminalSafeText(project.language)}/${project.framework === undefined ? '-' : terminalSafeText(project.framework)}`,
    `${project.nodeCount} nodes · ${project.edgeCount} edges`,
    project.indexedAt?.toISOString() ?? 'not indexed',
  ];
  return `${fields.join('  ')}${project.isSample ? ' sample' : ''}`;
}

/**
 * Parses `argv` with a fresh command whose output goes to the injected streams; `commander` never
 * prints an error of its own: its errors become `USAGE`.
 *
 * @returns `'done'` when the help was printed, otherwise `'run'`.
 */
function parseArguments(argv: string[], deps: ProjectsCommandDeps): 'run' | 'done' {
  const command = new Command('codemind projects')
    .description('List every stored project, sample or indexed, with its counts')
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
      throw new CliError('USAGE', 2, error.message.replace(/^error: /, ''));
    }
    throw error;
  }
  return 'run';
}
