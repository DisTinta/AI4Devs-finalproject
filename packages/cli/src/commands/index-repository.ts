import { Command, CommanderError } from 'commander';
import { PROJECT_FRAMEWORKS } from '@codemind/core';
import type { ProjectFramework } from '@codemind/core';
import { CliError, CommitUncertain, indexWithEnvironment, toCliError } from '../compose-index.js';
import type { Environment, IndexOptions, OpenTransaction, PortsFactory } from '../compose-index.js';
import { createLogger } from '../logger.js';
import type { TextSink } from '../logger.js';
import { renderProgress, renderReport } from '../render-report.js';
import { toTerminalSafeJson } from '../safe-json.js';
import { CLI_VERSION } from '../version.js';

/** Languages the command can index today; TypeScript waits for its analyzer (CM-HU-18). */
const SUPPORTED_LANGUAGES = ['php'] as const;

/** What `runIndexCommand` writes to and reads from, plus the optional test seams (design D5). */
export interface IndexCommandDeps {
  /** Where `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` and `DATABASE_URL` are read. */
  env: Environment;
  /** Receives only the result: the report, help or version. */
  stdout: TextSink;
  /** Receives the progress, the structured log and the error. */
  stderr: TextSink;
  /** Opens the transaction; defaults to a `pg.Client` on `DATABASE_URL`. */
  openTransaction?: OpenTransaction;
  /** Builds the ports; defaults to the real adapters. */
  ports?: PortsFactory;
}

/** The parsed arguments, before validation. */
interface ParsedArguments {
  path: string;
  name: string;
  language: string;
  framework?: string;
  json: boolean;
}

/**
 * Runs `index <path> --name <name> --language <language> [--framework <framework>] [--json]`.
 * It builds a fresh `commander` command on every call and never touches `process`: it returns the
 * exit code — `0` success, help or version; `1` a domain, configuration or runtime error; `2` a
 * usage error. On success stdout gets the report (text, or JSON with `--json`) once the transaction
 * is committed; on error stdout stays empty and stderr gets one `{"error":{…}}` line.
 *
 * @param argv The arguments starting with `index`, as in `process.argv.slice(2)`.
 * @param deps The environment, the streams and the optional test seams.
 * @returns The exit code.
 */
export async function runIndexCommand(argv: string[], deps: IndexCommandDeps): Promise<number> {
  const logger = createLogger(deps.stderr);
  let typed = { path: '', name: '' };
  let committed = false;
  try {
    const parsed = parseArguments(argv, deps);
    if (parsed === 'done') return 0;
    typed = { path: parsed.path, name: parsed.name };
    const options = validate(parsed);
    const report = await indexWithEnvironment(options, {
      env: deps.env,
      onProgress: (phase) => deps.stderr.write(`${renderProgress(phase)}\n`),
      openTransaction: deps.openTransaction,
      ports: deps.ports,
    });
    committed = true;
    for (const event of report.events) {
      logger.info({ event: 'secret_redacted', source: 'file', file: event.file, line: event.line, column: event.column, rule: event.rule });
    }
    for (const event of report.commitEvents) {
      logger.info({ event: 'secret_redacted', source: 'commit', commit: event.commit, line: event.line, column: event.column, rule: event.rule });
    }
    deps.stdout.write(parsed.json ? `${toTerminalSafeJson(report)}\n` : renderReport(report));
    return 0;
  } catch (error) {
    // Once the transaction committed, nothing that fails can be reported as "nothing was saved".
    const failure = toCliError(committed ? new CommitUncertain() : error, typed);
    deps.stderr.write(`${toTerminalSafeJson({ error: { code: failure.code, message: failure.message, details: failure.details } })}\n`);
    logger.error({ event: 'index_failed', code: failure.code, exit: failure.exit });
    return failure.exit;
  }
}

/**
 * Parses `argv` with a fresh command whose output goes to the injected streams. `commander` never
 * prints an error of its own (`outputError` is a no-op, design D1): its errors become `USAGE`.
 *
 * @returns The parsed arguments, or `'done'` when help or the version was printed.
 */
function parseArguments(argv: string[], deps: IndexCommandDeps): ParsedArguments | 'done' {
  const command = new Command('codemind index')
    .description('Index a repository inside ALLOWED_REPOS_DIR and save its knowledge graph')
    .argument('<path>', 'repository path, absolute or relative to ALLOWED_REPOS_DIR')
    .requiredOption('--name <name>', 'unique name of the project to create')
    .requiredOption('--language <language>', `language of the repository: ${SUPPORTED_LANGUAGES.join(', ')}`)
    .option('--framework <framework>', `framework, instead of detecting it: ${PROJECT_FRAMEWORKS.join(', ')}`)
    .option('--json', 'print the report as one JSON document')
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
  const options = command.opts<{ name: string; language: string; framework?: string; json?: boolean }>();
  return { path: command.args[0], name: options.name, language: options.language, framework: options.framework, json: options.json === true };
}

/** Checks the values `commander` cannot: a blank name, the language and the framework. */
function validate(parsed: ParsedArguments): IndexOptions {
  if (parsed.name.trim() === '') throw new CliError('USAGE', 2, '--name must not be blank');
  if (parsed.language !== 'php') {
    const message = parsed.language === 'typescript' ? 'typescript: not available yet (CM-HU-18)' : `${parsed.language}: not supported`;
    throw new CliError('UNSUPPORTED_LANGUAGE', 2, message, { allowed: [...SUPPORTED_LANGUAGES] });
  }
  if (parsed.framework !== undefined && !(PROJECT_FRAMEWORKS as readonly string[]).includes(parsed.framework)) {
    throw new CliError('UNSUPPORTED_FRAMEWORK', 2, `${parsed.framework}: not supported`, { allowed: [...PROJECT_FRAMEWORKS] });
  }
  return { path: parsed.path, name: parsed.name, language: 'php', framework: parsed.framework as ProjectFramework | undefined };
}
