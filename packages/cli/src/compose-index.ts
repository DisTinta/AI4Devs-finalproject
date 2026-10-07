import pg from 'pg';
import type { ClientBase } from 'pg';
import { authorHashSaltFromEnv, createGitSourceTree, createSimpleGitHistory } from '@codemind/adapter-git';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import { createPhpAnalyzer } from '@codemind/analyzer-php';
import { confinePath, DomainError, indexRepository, InvalidGraph } from '@codemind/core';
import type {
  AnalyzerPort,
  GitPort,
  IndexPhase,
  IndexReport,
  ProjectFramework,
  ProjectLanguage,
  SourceTreePort,
  StorePort,
} from '@codemind/core';
import { escapeLiteral } from './render-report.js';

/** How long the default transaction waits for the database to accept the connection. */
const CONNECTION_TIMEOUT_MS = 10_000;

/** The process environment, or the subset a test passes. */
export type Environment = Record<string, string | undefined>;

/** One database transaction owned by the command. */
export interface IndexTransaction {
  /** The client inside the transaction; the store binds its writes to it. */
  client: ClientBase;
  /** Makes the indexing's writes permanent. */
  commit(): Promise<void>;
  /** Undoes every write of the indexing. */
  rollback(): Promise<void>;
  /** Gives the connection back; called once, whatever happened. */
  release(): Promise<void>;
}

/**
 * Opens the transaction of one indexing. The default connects to `DATABASE_URL` and runs `BEGIN`;
 * the integration tests open a savepoint on the harness client instead (design D4).
 */
export type OpenTransaction = () => Promise<IndexTransaction>;

/** The ports an indexing composes, with the store bound to the command's transaction. */
export interface IndexPorts {
  /** Reads the repository's files at `HEAD`. */
  sourceTree: SourceTreePort;
  /** Reads the repository's history. */
  git: GitPort;
  /** Analyses the redacted files. */
  analyzer: AnalyzerPort;
  /** Builds the store on the transaction's client. */
  store(client: ClientBase): StorePort;
}

/** Builds the ports from the author-hash salt. A test seam: the default is {@link defaultPorts}. */
export type PortsFactory = (authorHashSalt: string) => IndexPorts;

/** The validated arguments of an indexing. */
export interface IndexOptions {
  /** Repository path as typed, absolute or relative to `ALLOWED_REPOS_DIR`. */
  path: string;
  /** Unique name of the project to create. */
  name: string;
  /** Language of the repository. */
  language: ProjectLanguage;
  /** Explicit framework; detected from the manifests when absent. */
  framework?: ProjectFramework;
}

/** What {@link indexWithEnvironment} needs besides the options. */
export interface IndexEnvironment {
  /** Where `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` and `DATABASE_URL` are read. */
  env: Environment;
  /** Called once with each phase when it starts. */
  onProgress: (phase: IndexPhase) => void;
  /** Opens the transaction; defaults to a `pg.Client` on `DATABASE_URL`. */
  openTransaction?: OpenTransaction;
  /** Builds the ports; defaults to the real adapters. */
  ports?: PortsFactory;
}

/**
 * A failure the CLI itself detects (usage, configuration), already carrying its stable code, exit
 * code, message and details.
 */
export class CliError extends Error {
  /**
   * @param code Stable code.
   * @param exit Exit code: `2` for usage errors, `1` otherwise.
   * @param message Message to print; never holds a secret, a real path or a database URL.
   * @param details Structured details, JSON-serialisable.
   */
  constructor(
    readonly code: string,
    readonly exit: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/** The database refused or did not answer the connection. Carries nothing of the driver's error. */
export class DatabaseUnavailable extends Error {
  constructor() {
    super('cannot connect to the database');
    this.name = 'DatabaseUnavailable';
  }
}

/** A failure as the CLI prints it: one `{"error":{code,message,details}}` line and an exit code. */
export interface CliFailure {
  /** Stable code. */
  code: string;
  /** Exit code of the process. */
  exit: number;
  /** Message built by the CLI. */
  message: string;
  /** Structured details. */
  details: Record<string, unknown>;
}

/**
 * Maps any error to what the CLI prints. Messages are built from the code and from the path and
 * name **as typed**; the `message` of a domain or unknown error is never reused, since
 * `NotAGitRepository` and `EmptyRepository` hold the real absolute path and an unknown error can hold
 * anything (design D6).
 *
 * @param error What was thrown.
 * @param typed The path and name as the user typed them.
 * @returns The failure to print.
 */
export function toCliError(error: unknown, typed: { path: string; name: string }): CliFailure {
  if (error instanceof CliError) {
    return { code: error.code, exit: error.exit, message: error.message, details: error.details };
  }
  if (error instanceof DatabaseUnavailable) return failure('DATABASE_UNAVAILABLE', error.message);
  if (error instanceof DomainError) {
    const path = escapeLiteral(typed.path);
    switch (error.code) {
      case 'INDEXING_DISABLED':
        return failure(error.code, 'indexing disabled (fixtures-only mode)');
      case 'FORBIDDEN_PATH':
        return failure(error.code, `${path} is outside the allowed repositories directory`);
      case 'NOT_A_GIT_REPOSITORY':
        return failure(error.code, `${path} is not the root of a git repository`);
      case 'EMPTY_REPOSITORY':
        return failure(error.code, `${path} has no commits`);
      case 'PROJECT_NAME_TAKEN':
        return failure(error.code, `project name ${escapeLiteral(typed.name)} is already taken`);
      case 'INVALID_GRAPH':
        return failure(error.code, 'the analysis produced an invalid graph; nothing was saved', {
          violations: (error as InvalidGraph).violations,
        });
    }
  }
  return failure('INTERNAL', 'unexpected error; nothing was saved');
}

function failure(code: string, message: string, details: Record<string, unknown> = {}): CliFailure {
  return { code, exit: 1, message, details };
}

/**
 * The real adapters: the Git source tree and history, the PHP analyzer, and the Postgres store on
 * the transaction's client.
 *
 * @param authorHashSalt Trimmed `AUTHOR_HASH_SALT`.
 * @returns The ports.
 */
export function defaultPorts(authorHashSalt: string): IndexPorts {
  return {
    sourceTree: createGitSourceTree(),
    git: createSimpleGitHistory({ authorHashSalt }),
    analyzer: createPhpAnalyzer(),
    store: (client) => createPostgresStore({ transaction: client }),
  };
}

/**
 * The default transaction: a `pg.Client` on `connectionString` with a connection timeout, then
 * `BEGIN`. A failure to connect or to begin becomes {@link DatabaseUnavailable}, dropping the
 * driver's error, whose message can name the host and port.
 *
 * @param connectionString Trimmed `DATABASE_URL`.
 * @returns The factory.
 */
export function defaultOpenTransaction(connectionString: string): OpenTransaction {
  return async () => {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
    // A connection error after `connect` is emitted as an event; without a listener it would crash the
    // process instead of rejecting the pending query, which already reports it.
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.query('BEGIN');
    } catch {
      await client.end().catch(() => undefined);
      throw new DatabaseUnavailable();
    }
    return {
      client,
      commit: async () => {
        await client.query('COMMIT');
      },
      rollback: async () => {
        await client.query('ROLLBACK');
      },
      release: () => client.end(),
    };
  };
}

/**
 * The composition root of `index` (design D3): reads and trims the environment, checks the allowed
 * root, the path and the configuration before connecting, then runs the indexing inside one
 * transaction it owns — commit on success, rollback on any error, always release.
 *
 * @param options The validated arguments.
 * @param environment The environment, the progress callback and the test seams.
 * @returns The report of the committed indexing.
 * @throws IndexingDisabled, ForbiddenPathError, CliError (`MISSING_CONFIG`), DatabaseUnavailable, or
 *   whatever the indexing throws, after rolling back.
 */
export async function indexWithEnvironment(options: IndexOptions, environment: IndexEnvironment): Promise<IndexReport> {
  const { env } = environment;
  const allowedRoot = env.ALLOWED_REPOS_DIR?.trim() ?? '';
  confinePath(options.path, allowedRoot);
  let authorHashSalt: string;
  try {
    authorHashSalt = authorHashSaltFromEnv(env);
  } catch {
    throw missingConfig('AUTHOR_HASH_SALT');
  }
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '') throw missingConfig('DATABASE_URL');

  const ports = (environment.ports ?? defaultPorts)(authorHashSalt);
  const transaction = await (environment.openTransaction ?? defaultOpenTransaction(databaseUrl))();
  try {
    const report = await indexRepository(
      {
        sourceTree: ports.sourceTree,
        git: ports.git,
        analyzer: ports.analyzer,
        store: ports.store(transaction.client),
        onProgress: environment.onProgress,
      },
      { repoPath: options.path, allowedRoot, name: options.name, language: options.language, framework: options.framework },
    );
    await transaction.commit();
    return report;
  } catch (error) {
    // The first error wins: a rollback that fails too (a lost connection) must not hide it.
    await transaction.rollback().catch(() => undefined);
    throw error;
  } finally {
    await transaction.release().catch(() => undefined);
  }
}

function missingConfig(variable: string): CliError {
  return new CliError('MISSING_CONFIG', 1, `${variable} is not set`, { variable });
}
