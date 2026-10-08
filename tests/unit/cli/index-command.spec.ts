import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import { EmptyRepository, NotAGitRepository, ProjectNameTaken } from '@codemind/core';
import type { AnalysisResult, GitHistory, KnowledgeGraph, NewProject, SaveGraphResult, SourceFile, SourceTree, StorePort } from '@codemind/core';
import { runIndexCommand } from '../../../packages/cli/src/commands/index-repository';
import { defaultPorts } from '../../../packages/cli/src/compose-index';
import { createLogger } from '../../../packages/cli/src/logger';
import type { IndexPorts, OpenTransaction } from '../../../packages/cli/src/compose-index';
import { CLI_VERSION } from '../../../packages/cli/src/version';

// Spec: openspec/specs/cli-indexing/spec.md. Each `it` named after a
// scenario is that scenario; the others are extra cases. The ports, the store and the transaction
// are in-memory fakes recording into one shared log, so the order of commit, rollback, release and
// the first write to stdout can be asserted. The real `indexRepository` runs between them.

const SHA = 'c'.repeat(40);
/** A synthetic AWS access key id, built here so no literal key sits in the repository. */
const AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const VALID_ENV = { ALLOWED_REPOS_DIR: '/repos', AUTHOR_HASH_SALT: 'test-salt', DATABASE_URL: 'postgres://fake/db' };
const VALID_ARGS = ['index', 'acme-shop', '--name', 'acme-shop', '--language', 'php'];

/** What the fakes return or throw; every field has a working default. */
interface FakeOptions {
  env?: Record<string, string | undefined>;
  realPaths?: Map<string, string>;
  tree?: SourceTree;
  readFilesError?: Error;
  analyze?: (files: SourceFile[]) => AnalysisResult;
  history?: GitHistory;
  readHistoryError?: Error;
  createProjectError?: Error;
  commitError?: Error;
  rollbackError?: Error;
  releaseError?: Error;
  /** Thrown by the first write to stdout, as a closed pipe would. */
  stdoutError?: Error;
  /** Use the default transaction factory (a real `pg.Client` on `DATABASE_URL`) instead of the fake. */
  defaultTransaction?: boolean;
}

/** The outcome of one run: exit code, both streams, the shared log and what the fakes received. */
interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  /** The projects the store was asked to create. */
  created: NewProject[];
  /** The roots `readFiles` was called with. */
  readRoots: string[];
}

function plainAnalysis(files: SourceFile[]): AnalysisResult {
  return { files: files.map((file) => ({ path: file.path, kind: 'source' })), symbols: [], edges: [], diagnostics: [] };
}

/** Runs the command with fake ports and a recording fake transaction. */
async function run(argv: string[], options: FakeOptions = {}): Promise<Run> {
  const log: string[] = [];
  const created: NewProject[] = [];
  const readRoots: string[] = [];
  let stdout = '';
  let stderr = '';
  const openTransaction: OpenTransaction = async () => {
    log.push('open');
    return {
      client: {} as ClientBase,
      commit: async () => {
        log.push('commit');
        if (options.commitError) throw options.commitError;
      },
      rollback: async () => {
        log.push('rollback');
        if (options.rollbackError) throw options.rollbackError;
      },
      release: async () => {
        log.push('release');
        if (options.releaseError) throw options.releaseError;
      },
    };
  };
  const store = {
    async createProject(project: NewProject) {
      log.push('createProject');
      created.push(project);
      if (options.createProjectError) throw options.createProjectError;
      return 'project-1';
    },
    async saveGraph(_projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
      log.push('saveGraph');
      return {
        files: graph.files.length,
        filesDeleted: 0,
        symbols: graph.symbols.length,
        edges: graph.edges.length,
        commits: graph.commits.length,
        fileCommits: graph.fileCommits.length,
      };
    },
  } as unknown as StorePort;
  const ports = (): IndexPorts => ({
    sourceTree: {
      realPath: async (requested) => options.realPaths?.get(requested) ?? requested,
      readFiles: async (root) => {
        readRoots.push(root);
        if (options.readFilesError) throw options.readFilesError;
        return options.tree ?? { files: [{ path: 'app/A.php', content: '<?php\n' }], skipped: [] };
      },
    },
    analyzer: { analyze: async (input) => (options.analyze ?? plainAnalysis)(input.files) },
    git: {
      readHistory: async () => {
        if (options.readHistoryError) throw options.readHistoryError;
        return options.history ?? { head: SHA, commits: [{ sha: SHA, message: 'feat: a' }], fileCommits: [{ file: 'app/A.php', sha: SHA }] };
      },
    },
    store: () => store,
  });
  const exit = await runIndexCommand(argv, {
    env: options.env ?? VALID_ENV,
    stdout: {
      write: (chunk: string) => {
        log.push('stdout');
        if (options.stdoutError) throw options.stdoutError;
        stdout += chunk;
      },
    },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    openTransaction: options.defaultTransaction ? undefined : openTransaction,
    ports,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, created, readRoots };
}

/** The `{"error":{…}}` line of a failed run (progress lines `[n/6] …` are not JSON and are skipped). */
function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  const lines = result.stderrLines
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => 'error' in line);
  expect(lines).toHaveLength(1);
  return lines[0].error as { code: string; message: string; details: Record<string, unknown> };
}

/** Asserts that every stderr line is a JSON object: no free text of the argument parser's own. */
function expectOnlyJsonOnStderr(result: Run): void {
  for (const line of result.stderrLines) expect(() => JSON.parse(line)).not.toThrow();
}

describe('index command: arguments', () => {
  it('Help and version exit with zero', async () => {
    // Act
    const help = await run(['index', '--help']);
    const version = await run(['index', '--version']);

    // Assert
    expect(help.exit).toBe(0);
    // Help wraps at the terminal width, so compare it with whitespace collapsed.
    const helpText = help.stdout.replace(/\s+/g, ' ');
    expect(helpText).toContain('Usage: codemind index [options] <path>');
    expect(helpText).toContain('Index a repository inside ALLOWED_REPOS_DIR and save its knowledge graph');
    expect(helpText).toContain('path repository path, absolute or relative to ALLOWED_REPOS_DIR');
    expect(helpText).toContain('unique name of the project to create');
    expect(helpText).toContain('language of the repository: php');
    expect(helpText).toContain('framework, instead of detecting it: laravel, fastify, none');
    expect(helpText).toContain('print the report as one JSON document');
    expect(help.stderr).toBe('');
    expect(version.exit).toBe(0);
    expect(version.stdout).toBe(`${CLI_VERSION}\n`);
    expect(version.stderr).toBe('');
    expect(help.log.concat(version.log)).not.toContain('open');
  });

  it('An unsupported language is a usage error', async () => {
    // Act
    const cobol = await run(['index', 'acme-shop', '--name', 'acme-shop', '--language', 'cobol']);
    const typescript = await run(['index', 'acme-shop', '--name', 'acme-shop', '--language', 'typescript']);

    // Assert
    for (const result of [cobol, typescript]) {
      expect(result.exit).toBe(2);
      expect(errorOf(result)).toMatchObject({ code: 'UNSUPPORTED_LANGUAGE', details: { allowed: ['php'] } });
      expect(result.log).toEqual([]);
      expect(result.stdout).toBe('');
    }
    expect(errorOf(cobol).message).toBe('cobol: not supported');
    expect(errorOf(typescript).message).toBe('typescript: not available yet (CM-HU-18)');
  });

  it('An unsupported framework is a usage error', async () => {
    // Act
    const result = await run([...VALID_ARGS, '--framework', 'symfony']);

    // Assert
    expect(result.exit).toBe(2);
    expect(errorOf(result)).toEqual({
      code: 'UNSUPPORTED_FRAMEWORK',
      message: 'symfony: not supported',
      details: { allowed: ['laravel', 'fastify', 'none'] },
    });
    expect(result.log).toEqual([]);
    expect(result.stdout).toBe('');
  });

  it('A missing or blank name is a usage error', async () => {
    // Act
    const missing = await run(['index', 'acme-shop', '--language', 'php']);
    const blank = await run(['index', 'acme-shop', '--name', '   ', '--language', 'php']);

    // Assert
    for (const result of [missing, blank]) {
      expect(result.exit).toBe(2);
      expect(errorOf(result).code).toBe('USAGE');
      expectOnlyJsonOnStderr(result);
      expect(result.log).toEqual([]);
      expect(result.stdout).toBe('');
    }
    expect(errorOf(missing).message).toBe("required option '--name <name>' not specified");
    expect(errorOf(blank).message).toBe('--name must not be blank');
  });

  it('reports an unknown option, a missing path or an extra argument as a usage error', async () => {
    for (const argv of [[...VALID_ARGS, '--bogus'], ['index', '--name', 'x', '--language', 'php'], [...VALID_ARGS, 'extra']]) {
      const result = await run(argv);
      expect(result.exit).toBe(2);
      expect(errorOf(result).code).toBe('USAGE');
      expect(errorOf(result).message).not.toMatch(/^error:/);
      expectOnlyJsonOnStderr(result);
    }
  });

  it('checks the arguments before the environment', async () => {
    const result = await run(['index', 'acme-shop', '--name', 'x', '--language', 'cobol'], { env: {} });

    expect(errorOf(result).code).toBe('UNSUPPORTED_LANGUAGE');
  });

  it('uses one version constant equal to the CLI package version', () => {
    const pkg = JSON.parse(readFileSync(path.resolve('packages/cli/package.json'), 'utf8')) as { version: string };

    expect(CLI_VERSION).toBe(pkg.version);
  });
});

describe('index command: checks before connecting', () => {
  it('Indexing is disabled before connecting without an allowed root', async () => {
    for (const ALLOWED_REPOS_DIR of [undefined, '', '   ']) {
      // Act
      const result = await run(VALID_ARGS, { env: { ...VALID_ENV, ALLOWED_REPOS_DIR } });

      // Assert
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'INDEXING_DISABLED', message: 'indexing disabled (fixtures-only mode)', details: {} });
      expect(result.log).toEqual([]);
    }
  });

  it('A path outside the allowed root is rejected before connecting', async () => {
    for (const repoPath of ['../etc', '/tmp/otro']) {
      // Act
      const result = await run(['index', repoPath, '--name', 'x', '--language', 'php']);

      // Assert
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({
        code: 'FORBIDDEN_PATH',
        message: `${JSON.stringify(repoPath)} is outside the allowed repositories directory`,
        details: {},
      });
      expect(result.log).toEqual([]);
    }
  });

  it('Missing configuration fails before connecting', async () => {
    const cases: [string, string | undefined][] = [
      ['AUTHOR_HASH_SALT', undefined],
      ['AUTHOR_HASH_SALT', ''],
      ['AUTHOR_HASH_SALT', '  '],
      ['DATABASE_URL', undefined],
      ['DATABASE_URL', ''],
      ['DATABASE_URL', ' \t'],
    ];
    for (const [variable, value] of cases) {
      // Act
      const result = await run(VALID_ARGS, { env: { ...VALID_ENV, [variable]: value } });

      // Assert
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'MISSING_CONFIG', message: `${variable} is not set`, details: { variable } });
      expect(result.log).toEqual([]);
    }
  });

  it('On error stdout stays empty', async () => {
    // Act
    const result = await run([...VALID_ARGS, '--json'], { env: { ...VALID_ENV, ALLOWED_REPOS_DIR: '' } });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe('');
    expect(errorOf(result).code).toBe('INDEXING_DISABLED');
  });

  it('A failure is logged with its code and exit', async () => {
    // Act
    const result = await run(VALID_ARGS, { env: { ...VALID_ENV, ALLOWED_REPOS_DIR: '' } });

    // Assert
    expect(result.stderrLines).toContain('{"level":"error","event":"index_failed","code":"INDEXING_DISABLED","exit":1}');
    expect(errorOf(result).code).toBe('INDEXING_DISABLED');
  });

  it('logs a usage error with exit 2', async () => {
    const result = await run(['index', 'acme-shop', '--language', 'php']);

    expect(result.stderrLines).toContain('{"level":"error","event":"index_failed","code":"USAGE","exit":2}');
  });
});

describe('index command: transaction, report and log', () => {
  it('A successful indexing commits and releases', async () => {
    // Act
    const result = await run(VALID_ARGS);

    // Assert
    expect(result.exit).toBe(0);
    expect(result.log.filter((entry) => entry !== 'stdout')).toEqual(['open', 'createProject', 'saveGraph', 'commit', 'release']);
    expect(result.log.indexOf('stdout')).toBeGreaterThan(result.log.indexOf('commit'));
    expect(result.stdout).toContain('Indexed project project-1');
    expect(result.created).toEqual([{ name: 'acme-shop', rootPath: path.resolve('/repos/acme-shop'), language: 'php', framework: 'none' }]);
    expect(result.stderrLines).toEqual(['[1/6] confine', '[2/6] read', '[3/6] redact', '[4/6] analyze', '[5/6] history', '[6/6] save']);
  });

  it('A failed indexing rolls back and releases', async () => {
    // Act
    const result = await run(VALID_ARGS, {
      analyze: () => {
        throw new Error('parser crashed');
      },
    });

    // Assert
    expect(result.exit).toBe(1);
    expect(result.log).toEqual(['open', 'rollback', 'release']);
    expect(result.stdout).toBe('');
  });

  it('Every redaction is logged without the secret', async () => {
    // Arrange: one file and one commit message holding the synthetic key.
    const tree: SourceTree = {
      files: [
        { path: 'config/keys.php', content: `<?php\nreturn ['key' => '${AWS_KEY}'];\n` },
        { path: 'app/A.php', content: '<?php\n' },
      ],
      skipped: [],
    };
    const history: GitHistory = { head: SHA, commits: [{ sha: SHA, message: `chore: rotate ${AWS_KEY}` }], fileCommits: [] };

    // Act
    const result = await run(VALID_ARGS, { tree, history });

    // Assert
    expect(result.exit).toBe(0);
    const redactions = result.stderrLines
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.event === 'secret_redacted');
    expect(redactions).toEqual([
      { level: 'info', event: 'secret_redacted', source: 'file', file: 'config/keys.php', line: 2, column: 19, rule: 'aws-access-key-id' },
      { level: 'info', event: 'secret_redacted', source: 'commit', commit: SHA, line: 1, column: 15, rule: 'aws-access-key-id' },
    ]);
    expect(result.stdout).not.toContain(AWS_KEY);
    expect(result.stderr).not.toContain(AWS_KEY);
  });

  it('A failure while or after committing says the project may have been saved', async () => {
    // Act
    const commitFails = await run(VALID_ARGS, { commitError: new Error('connection lost during COMMIT') });
    const stdoutFails = await run(VALID_ARGS, { stdoutError: new Error('EPIPE') });

    // Assert
    for (const result of [commitFails, stdoutFails]) {
      expect(result.exit).toBe(1);
      expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error; the project may have been saved', details: {} });
      expect(result.log).toContain('release');
    }
    expect(stdoutFails.log.filter((entry) => entry !== 'stdout')).toEqual(['open', 'createProject', 'saveGraph', 'commit', 'release']);
  });

  it('A failed release after a commit is ignored', async () => {
    // Act
    const result = await run(VALID_ARGS, { releaseError: new Error('connection already closed') });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('Indexed project project-1');
    expect(result.stderr).not.toContain('"error"');
    expect(result.log.filter((entry) => entry !== 'stdout')).toEqual(['open', 'createProject', 'saveGraph', 'commit', 'release']);
  });

  it('A failed indexing logs no redaction', async () => {
    // Arrange: a file holding the synthetic key, and a name that is already taken.
    const tree: SourceTree = { files: [{ path: 'config/keys.php', content: `<?php\nreturn ['key' => '${AWS_KEY}'];\n` }], skipped: [] };

    // Act
    const result = await run(VALID_ARGS, { tree, createProjectError: new ProjectNameTaken('acme-shop') });

    // Assert
    expect(result.exit).toBe(1);
    expect(errorOf(result).code).toBe('PROJECT_NAME_TAKEN');
    expect(result.stderr).not.toContain('secret_redacted');
    expect(result.stdout + result.stderr).not.toContain(AWS_KEY);
  });

  it('Control characters are escaped in the log, the JSON report and the error', async () => {
    // Arrange: untrusted strings holding U+009B, the one-byte CSI. Core skips a path with a C1
    // control as `invalid-path`, so this file reaches the output only as a skipped entry: it is never
    // redacted, analysed or logged.
    const keyFile = 'k\u009b2J.php';
    const tree: SourceTree = {
      files: [{ path: keyFile, content: `<?php\nreturn ['key' => '${AWS_KEY}'];\n` }],
      skipped: [{ path: 's\u009b.php', reason: 'invalid-path' }],
    };
    const analyze = (files: SourceFile[]): AnalysisResult => ({ ...plainAnalysis(files), diagnostics: [{ path: keyFile, message: 'bad\u009b' }] });
    const ghost = (files: SourceFile[]): AnalysisResult => ({ ...plainAnalysis(files), files: [...plainAnalysis(files).files, { path: 'g\u009b.php', kind: 'source' }] });
    const rawControl = /[\u007f-\u009f]/;

    // Act
    const json = await run([...VALID_ARGS, '--json'], { tree, analyze });
    const invalid = await run(VALID_ARGS, { analyze: ghost });

    // Assert
    expect(json.exit).toBe(0);
    for (const result of [json, invalid]) {
      expect(result.stdout).not.toMatch(rawControl);
      expect(result.stderr).not.toMatch(rawControl);
    }
    const redaction = json.stderrLines.filter((line) => line.includes('secret_redacted')).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(redaction.filter((line) => line.file === keyFile)).toEqual([]);
    const report = JSON.parse(json.stdout) as { skipped: { path: string; reason: string }[]; diagnostics: { message: string }[] };
    expect(report.skipped).toEqual([
      { path: keyFile, reason: 'invalid-path' },
      { path: 's\u009b.php', reason: 'invalid-path' },
    ]);
    expect(report.diagnostics.map((entry) => entry.message)).toEqual(['bad\u009b']);
    expect(invalid.exit).toBe(1);
    const error = errorOf(invalid);
    expect(error.code).toBe('INVALID_GRAPH');
    expect(error.details.violations).toEqual([expect.objectContaining({ message: expect.stringContaining('g\u009b.php') })]);
  });

  it("A redaction event's file path is escaped in its log line", () => {
    // Arrange: core no longer indexes a path with a C1 control, so the event is built here, with the
    // fields the command logs for a file redaction.
    const lines: string[] = [];
    const logger = createLogger({ write: (chunk: string) => lines.push(chunk) });

    // Act
    logger.info({ event: 'secret_redacted', source: 'file', file: 'k\u009b2J.php', line: 2, column: 15, rule: 'aws-access-key-id' });

    // Assert
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/[\u007f-\u009f]/);
    expect(JSON.parse(lines[0])).toMatchObject({ event: 'secret_redacted', file: 'k\u009b2J.php' });
  });

  it('An unexpected error is reported as INTERNAL', async () => {
    // Arrange
    const absolute = path.resolve('/home/someone/secret-place/repo');

    // Act
    const result = await run(VALID_ARGS, { readHistoryError: new Error(`git failed in ${absolute}`) });

    // Assert
    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error; nothing was saved', details: {} });
    expect(result.stdout + result.stderr).not.toContain(absolute);
    expect(result.stderr).not.toContain('someone');
  });

  it('prints the report as one JSON document with --json', async () => {
    const result = await run([...VALID_ARGS, '--json', '--framework', 'fastify']);

    expect(result.exit).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(report).toMatchObject({ projectId: 'project-1', indexedCommit: SHA, framework: 'fastify', frameworkSource: 'explicit' });
    expect(result.stdout.trimEnd().split('\n')).toHaveLength(1);
  });

  it('keeps the first error when the rollback also fails, and still releases', async () => {
    const result = await run(VALID_ARGS, { createProjectError: new ProjectNameTaken('acme-shop'), rollbackError: new Error('connection lost') });

    expect(result.exit).toBe(1);
    expect(errorOf(result).code).toBe('PROJECT_NAME_TAKEN');
    expect(result.log).toEqual(['open', 'createProject', 'rollback', 'release']);
  });

  it('rolls back, exits 1 and prints nothing when the commit fails', async () => {
    const result = await run(VALID_ARGS, { commitError: new Error('serialization failure') });

    expect(result.exit).toBe(1);
    expect(errorOf(result).code).toBe('INTERNAL');
    expect(result.log).toEqual(['open', 'createProject', 'saveGraph', 'commit', 'rollback', 'release']);
    expect(result.stdout).toBe('');
  });

  it('reports an invalid graph with its violations', async () => {
    const result = await run(VALID_ARGS, {
      analyze: (files) => ({ ...plainAnalysis(files), files: [...plainAnalysis(files).files, { path: 'ghost.php', kind: 'source' }] }),
    });

    expect(result.exit).toBe(1);
    const error = errorOf(result);
    expect(error.code).toBe('INVALID_GRAPH');
    expect(error.message).toBe('the analysis produced an invalid graph; nothing was saved');
    expect(error.details.violations).toEqual([expect.objectContaining({ field: 'path', message: expect.stringContaining('ghost.php') })]);
    expect(result.log).toEqual(['open', 'rollback', 'release']);
  });

  it('names a taken project name as a JSON literal', async () => {
    const result = await run(['index', 'acme-shop', '--name', 'x"y', '--language', 'php'], { createProjectError: new ProjectNameTaken('x"y') });

    expect(errorOf(result)).toEqual({ code: 'PROJECT_NAME_TAKEN', message: 'project name "x\\"y" is already taken', details: {} });
  });

  it('reports a symbolic link escaping the root by the path as typed, after rolling back', async () => {
    const realPaths = new Map([[path.resolve('/repos/acme-shop'), path.resolve('/elsewhere/real')]]);

    const result = await run(VALID_ARGS, { realPaths });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'FORBIDDEN_PATH', message: '"acme-shop" is outside the allowed repositories directory', details: {} });
    expect(result.stderr).not.toContain('elsewhere');
    expect(result.log).toEqual(['open', 'rollback', 'release']);
  });

  it('reports a missing repository and an empty one by the path as typed, never the real path', async () => {
    const real = path.resolve('/repos/acme-shop');
    const missing = await run(VALID_ARGS, { readFilesError: new NotAGitRepository(real) });
    const empty = await run(VALID_ARGS, { readFilesError: new EmptyRepository(real) });

    expect(errorOf(missing)).toEqual({ code: 'NOT_A_GIT_REPOSITORY', message: '"acme-shop" is not the root of a git repository', details: {} });
    expect(errorOf(empty)).toEqual({ code: 'EMPTY_REPOSITORY', message: '"acme-shop" has no commits', details: {} });
    expect(missing.stderr + empty.stderr).not.toContain(real.replace(/\\/g, '\\\\'));
    expect(missing.stderr + empty.stderr).not.toContain(real);
  });

  it('trims ALLOWED_REPOS_DIR before resolving the repository path', async () => {
    const result = await run(VALID_ARGS, { env: { ...VALID_ENV, ALLOWED_REPOS_DIR: '  /repos \t' } });

    expect(result.exit).toBe(0);
    expect(result.readRoots).toEqual([path.resolve('/repos/acme-shop')]);
  });

  it('maps an error that only looks like a domain error to INTERNAL', async () => {
    const lookalike = Object.assign(new Error('taken'), { code: 'PROJECT_NAME_TAKEN' });

    const result = await run(VALID_ARGS, { createProjectError: lookalike });

    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error; nothing was saved', details: {} });
  });

  it('reports a refused connection of the default transaction as DATABASE_UNAVAILABLE, without the URL', async () => {
    // Nothing listens on port 1: the connection is refused at once, no database is needed.
    const url = 'postgres://u:s3cret@127.0.0.1:1/db';

    const result = await run(VALID_ARGS, { env: { ...VALID_ENV, DATABASE_URL: url }, defaultTransaction: true });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} });
    expect(result.stderr).not.toContain('s3cret');
  });
});

describe('default ports', () => {
  it('builds the real adapters, with the store bound to the given client', () => {
    const ports = defaultPorts('test-salt');

    expect(typeof ports.sourceTree.readFiles).toBe('function');
    expect(typeof ports.git.readHistory).toBe('function');
    expect(typeof ports.analyzer.analyze).toBe('function');
    expect(typeof ports.store({} as ClientBase).saveGraph).toBe('function');
  });
});
