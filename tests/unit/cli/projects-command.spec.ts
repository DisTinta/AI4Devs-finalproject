import type { ClientBase } from 'pg';
import { describe, expect, it } from 'vitest';
import type { Project } from '@codemind/core';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { formatProjectLine, runProjectsCommand } from '../../../packages/cli/src/commands/projects';

// Spec: openspec/changes/seed-load-and-projects/specs/cli-projects/spec.md → "Project listing". The
// `it` named after a scenario is that scenario; the others are extra cases. The transaction factory
// and the listing are fakes recording into one shared log.

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
}

interface FakeOptions {
  env?: Record<string, string | undefined>;
  projects?: Project[];
  listError?: Error;
  /** Use the real default transaction factory instead of the fake. */
  realFactory?: boolean;
}

async function run(argv: string[], options: FakeOptions = {}): Promise<Run> {
  const log: string[] = [];
  let stdout = '';
  let stderr = '';
  const openTransaction: OpenTransaction = async () => {
    log.push('open');
    return {
      client: {} as ClientBase,
      commit: async () => void log.push('commit'),
      rollback: async () => void log.push('rollback'),
      release: async () => void log.push('release'),
    };
  };
  const exit = await runProjectsCommand(argv, {
    env: options.env ?? { DATABASE_URL: 'postgres://fake/db' },
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    ...(options.realFactory ? {} : { openTransaction }),
    listProjects: async () => {
      log.push('list');
      if (options.listError) throw options.listError;
      return options.projects ?? [];
    },
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log };
}

function errorOf(result: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(result.stdout).toBe('');
  expect(result.stderrLines).toHaveLength(1);
  return (JSON.parse(result.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'mine',
    rootPath: '/repos/mine',
    language: 'php',
    isSample: false,
    nodeCount: 0,
    edgeCount: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('runProjectsCommand', () => {
  it('Configuration, connection and usage errors', async () => {
    // Missing configuration, without opening a connection.
    for (const env of [{}, { DATABASE_URL: '   ' }]) {
      const result = await run(['projects'], { env });
      expect(result.exit).toBe(1);
      const error = errorOf(result);
      expect(error.code).toBe('MISSING_CONFIG');
      expect(error.details).toEqual({ variable: 'DATABASE_URL' });
      expect(result.log).toEqual([]);
    }

    // Unreachable database, through the real default factory.
    const unreachable = await run(['projects'], { env: { DATABASE_URL: 'postgres://u:s3cret@127.0.0.1:1/db' }, realFactory: true });
    expect(unreachable.exit).toBe(1);
    expect(errorOf(unreachable).code).toBe('DATABASE_UNAVAILABLE');
    for (const output of [unreachable.stdout, unreachable.stderr]) {
      expect(output).not.toContain('postgres://');
      expect(output).not.toContain('s3cret');
      expect(output).not.toContain('u:');
    }

    // Usage: an extra argument and an unknown option.
    for (const argv of [['projects', 'extra'], ['projects', '--json']]) {
      const result = await run(argv);
      expect(result.exit).toBe(2);
      expect(errorOf(result).code).toBe('USAGE');
      expect(result.log).toEqual([]);
    }

    // Help, with no configuration at all.
    const help = await run(['projects', '--help'], { env: {} });
    expect(help.exit).toBe(0);
    expect(help.stdout).toContain('Usage: codemind projects');
    expect(help.stderr).toBe('');
    expect(help.log).toEqual([]);

    // Version, with no configuration at all, as the `index` command does.
    const version = await run(['projects', '--version'], { env: {} });
    expect(version.exit).toBe(0);
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+/);
    expect(version.stderr).toBe('');
    expect(version.log).toEqual([]);
  }, 20_000);

  it('prints one line per project and rolls the read back, never committing', async () => {
    const result = await run(['projects'], {
      projects: [
        project({ name: 'acme-shop', id: 'a794456d-6d1b-5b55-a360-13fec83dc7bc', framework: 'laravel', isSample: true, nodeCount: 174, edgeCount: 170, indexedAt: new Date('2024-05-06T09:31:00.000Z') }),
        project(),
      ],
    });

    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      'acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample\n' +
        'mine  00000000-0000-4000-8000-000000000001  php/-  0 nodes · 0 edges  not indexed\n',
    );
    expect(result.log).toEqual(['open', 'list', 'rollback', 'release']);
  });

  it('names the missing variable, strips the parser prefix from usage errors, and describes the command', async () => {
    expect(errorOf(await run(['projects'], { env: {} })).message).toBe('DATABASE_URL is not set');

    const usage = errorOf(await run(['projects', 'extra']));
    expect(usage.message).toMatch(/^too many arguments/);

    const help = await run(['projects', '--help'], { env: {} });
    expect(help.stdout).toContain('List every stored project, sample or indexed, with its counts');
  });

  it('prints no projects for an empty listing', async () => {
    const result = await run(['projects']);

    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('no projects\n');
  });

  it('reports an unexpected store error as INTERNAL, rolled back and released', async () => {
    const result = await run(['projects'], { listError: new Error('boom at /secret/path') });

    expect(result.exit).toBe(1);
    expect(errorOf(result)).toEqual({ code: 'INTERNAL', message: 'unexpected error; nothing was changed', details: {} });
    expect(result.stderr).not.toContain('/secret/path');
    expect(result.log).toEqual(['open', 'list', 'rollback', 'release']);
  });
});

describe('formatProjectLine', () => {
  it('fills the template with two spaces between fields', () => {
    expect(formatProjectLine(project({ framework: 'fastify', nodeCount: 3, edgeCount: 2, indexedAt: new Date('2025-02-03T04:05:06.007Z') }))).toBe(
      'mine  00000000-0000-4000-8000-000000000001  php/fastify  3 nodes · 2 edges  2025-02-03T04:05:06.007Z',
    );
  });

  it('marks a sample, writes - without framework and not indexed without indexedAt', () => {
    expect(formatProjectLine(project({ isSample: true }))).toBe(
      'mine  00000000-0000-4000-8000-000000000001  php/-  0 nodes · 0 edges  not indexed sample',
    );
  });
});
