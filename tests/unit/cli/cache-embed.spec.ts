import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiveLlmConfig } from '@codemind/adapter-llm';
import { LlmUnavailable } from '@codemind/core';
import type { LlmPort } from '@codemind/core';
import { runCacheEmbed } from '../../../packages/cli/src/cache-embed';
import type { CacheEmbedDeps } from '../../../packages/cli/src/cache-embed';
import { renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import type { GoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { writeAtomically } from '../../../packages/cli/src/cache/write-atomically';
import { embeddingVector } from '../../support/embedding-vector';
import { goldenFile, goldenVector } from '../../support/golden-file';
import { createScriptedLlm } from '../../support/scripted-llm';
import type { ScriptedLlmOptions } from '../../support/scripted-llm';

// Spec: openspec/changes/cache-hit-rate/specs/golden-answers/spec.md → "Golden embeddings command"
// (DIS-69 design S7). Each `it` named after a scenario is that scenario. The golden files live in a
// scratch repository root under the temp directory; the model is a scripted double, the database is
// never involved.

const USAGE_MESSAGE = 'usage: npm run cache:embed [-- --project <name>]';
/** A live model configuration with an embedding model. */
const LIVE_ENV = { LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder', LLM_EMBED_MODEL: 'nomic-embed-text' };
/** The content of a golden file the command must never read: it is not a golden file at all. */
const PREVIOUS = 'previous content of a golden file\n';

const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A scratch repository root whose `seeds/cache` holds `files` (name to content). */
function scratchRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'codemind-cache-embed-'));
  scratchDirs.push(root);
  mkdirSync(join(root, 'seeds', 'cache'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'seeds', 'cache', name), content);
  return root;
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  /** The error line of stderr, parsed. */
  error: { code: string; message: string; details: Record<string, unknown> };
  /** The configurations the model client was built with, and the arguments after each. */
  built: Array<{ config: LiveLlmConfig; extra: unknown[] }>;
  /** The texts of every embedding request, in order. */
  embeddings: string[][];
}

/** Runs the command over the scratch `root` with `env`, and a scripted model built with `model`. */
async function run(argv: string[], root: string, env: Record<string, string | undefined>, model: ScriptedLlmOptions = {}, seams: Partial<CacheEmbedDeps> = {}): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const built: Run['built'] = [];
  const scripted = createScriptedLlm('live', undefined, undefined, model);
  const exit = await runCacheEmbed(argv, {
    env,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    repoRoot: root,
    createLlm: ((config: LiveLlmConfig, ...extra: unknown[]): LlmPort => {
      built.push({ config, extra });
      return scripted.llm;
    }) as CacheEmbedDeps['createLlm'],
    ...seams,
  });
  const lines = stderr.split('\n').filter((line) => line !== '');
  return {
    exit,
    stdout,
    stderr,
    error: lines.length === 0 ? (undefined as never) : (JSON.parse(lines[0]!) as { error: Run['error'] }).error,
    built,
    embeddings: scripted.embeddings,
  };
}

describe('Requirement: Golden embeddings command', () => {
  it('Embedding arguments and configuration are checked before any file', async () => {
    // Arrange: previous files that are not golden files, so a read would fail with INVALID_SEED
    const files = { 'acme-shop.json': PREVIOUS, 'task-api.json': PREVIOUS };
    const root = scratchRoot(files);
    const cases: Array<{ argv: string[]; env: Record<string, string | undefined> }> = [
      { argv: ['Q1'], env: {} },
      { argv: ['--all'], env: {} },
      { argv: ['--project=acme-shop'], env: {} },
      { argv: ['--project'], env: {} },
      { argv: ['--project', 'acme-shop', '--project', 'task-api'], env: {} },
      { argv: ['--project', 'nope'], env: {} },
      { argv: [], env: { LLM_BASE_URL: '', LLM_API_KEY: '' } },
      { argv: [], env: { LLM_BASE_URL: 'ftp://x', LLM_MODEL: 'qwen2.5-coder', LLM_EMBED_MODEL: 'nomic-embed-text' } },
      { argv: [], env: { LLM_BASE_URL: LIVE_ENV.LLM_BASE_URL, LLM_MODEL: LIVE_ENV.LLM_MODEL } },
      { argv: [], env: { ...LIVE_ENV, LLM_EMBED_MODEL: '   ' } },
    ];

    // Act
    const runs: Run[] = [];
    for (const { argv, env } of cases) runs.push(await run(argv, root, env));

    // Assert
    for (const result of runs) {
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.built).toEqual([]);
      expect(result.embeddings).toEqual([]);
    }
    expect(runs.slice(0, 5).map((result) => [result.error.code, result.error.message, result.error.details])).toEqual(
      Array.from({ length: 5 }, () => ['USAGE', USAGE_MESSAGE, {}]),
    );
    expect(runs[5]!.error).toEqual({ code: 'USAGE', message: 'unknown golden project', details: { allowed: ['acme-shop', 'task-api'] } });
    expect([runs[6]!.error.code, runs[6]!.error.details]).toEqual(['MISSING_CONFIG', { variable: 'LLM_BASE_URL' }]);
    expect([runs[7]!.error.code, runs[7]!.error.details]).toEqual(['LLM_CONFIG_INVALID', { variable: 'LLM_BASE_URL' }]);
    for (const result of runs.slice(8)) expect([result.error.code, result.error.details]).toEqual(['MISSING_CONFIG', { variable: 'LLM_EMBED_MODEL' }]);
    for (const [name, content] of Object.entries(files)) {
      expect(readFileSync(join(root, 'seeds', 'cache', name), 'utf8')).toBe(content);
    }
  });

  it('Golden question embeddings are written without touching the answers', async () => {
    // Arrange: previous files, the first entry of each already holding a vector; a model answering each key with its own vector
    const previous = previousFiles();
    const root = scratchRoot(previous);
    const answered = new Map<string, number[]>();
    const embed = (texts: readonly string[]): number[][] =>
      texts.map((text) => {
        if (!answered.has(text)) answered.set(text, embeddingVector(answered.size + 1, 0.5));
        return answered.get(text)!;
      });

    // Act
    const result = await run([], root, { ...LIVE_ENV, LLM_TIMEOUT_MS: '45000' }, { embed });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      'acme-shop: 3 question embeddings -> seeds/cache/acme-shop.json\ntask-api: 3 question embeddings -> seeds/cache/task-api.json\n',
    );
    const keys = [...goldenFile().entries, ...goldenFile({ project: 'task-api' }).entries].map((entry) => entry.questionNormalized);
    expect(result.embeddings).toEqual(keys.map((key) => [key]));
    for (const name of ['acme-shop', 'task-api']) {
      const text = readFileSync(join(root, 'seeds', 'cache', `${name}.json`), 'utf8');
      const after = JSON.parse(text) as GoldenFile;
      expect(after.entries.map((entry) => entry.questionEmbedding)).toEqual(after.entries.map((entry) => answered.get(entry.questionNormalized)));
      expect(renderGoldenFile(after)).toBe(text);
      expect(withoutVectors(after)).toEqual(withoutVectors(JSON.parse(previous[`${name}.json`]!) as GoldenFile));
    }
    expect(result.built).toHaveLength(1);
    expect(result.built[0]!.config.timeoutMs).toBe(45_000);
    expect(result.built[0]!.extra).toEqual([]);
  });

  it('An invalid golden file stops the embedding before any request', async () => {
    // Arrange: a valid acme-shop file and a task-api file that is not JSON; then no task-api file
    const valid = renderGoldenFile(goldenFile());
    const embed = (texts: readonly string[]): number[][] => texts.map(() => embeddingVector(1));

    for (const taskApi of [{ 'task-api.json': '{"format":' }, {}] as Array<Record<string, string>>) {
      const root = scratchRoot({ 'acme-shop.json': valid, ...taskApi });

      // Act
      const result = await run([], root, LIVE_ENV, { embed });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.error).toEqual({
        code: 'INVALID_SEED',
        message: 'seeds/cache/task-api.json is not a loadable codemind golden file',
        details: { reason: 'cache', file: 'seeds/cache/task-api.json' },
      });
      expect(result.embeddings).toEqual([]);
      expect(readFileSync(join(root, 'seeds', 'cache', 'acme-shop.json'), 'utf8')).toBe(valid);
    }
  });

  it('A failed embedding leaves the golden file intact', async () => {
    // Arrange: known previous files and a configuration whose URL and key must never be printed
    const previous = previousFiles();
    const env = { LLM_BASE_URL: 'http://127.0.0.1:1/v1', LLM_API_KEY: 'k3y', LLM_MODEL: 'qwen2.5-coder', LLM_EMBED_MODEL: 'nomic-embed-text' };
    const acmeKeys = goldenFile().entries.map((entry) => entry.questionNormalized);
    const leaked = '0.123456';
    const good = (): number[] => embeddingVector(1, Number(leaked));
    const models: Array<{ embed: (texts: readonly string[]) => number[][]; reason: string }> = [
      { reason: 'timeout', embed: (texts) => (texts[0] === acmeKeys[1] ? failWith(new LlmUnavailable('timeout')) : texts.map(good)) },
      { reason: 'invalid-response', embed: (texts) => texts.map((text) => (text === acmeKeys[1] ? embeddingVector() : good())) },
      { reason: 'network', embed: (texts) => (acmeKeys.includes(texts[0]!) ? texts.map(good) : failWith(new LlmUnavailable('network'))) },
    ];

    for (const [index, { embed, reason }] of models.entries()) {
      const root = scratchRoot(previous);

      // Act
      const result = await run([], root, env, { embed });

      // Assert
      expect(result.exit).toBe(1);
      expect(result.error.code).toBe('LLM_UNAVAILABLE');
      expect(result.error.details).toEqual({ reason });
      // A failure of the model after a file was written keeps the model's message, not the INTERNAL one.
      expect(result.error.message).toBe('the language model is unavailable');
      const acmeAfter = readFileSync(join(root, 'seeds', 'cache', 'acme-shop.json'), 'utf8');
      const taskAfter = readFileSync(join(root, 'seeds', 'cache', 'task-api.json'), 'utf8');
      expect(taskAfter).toBe(previous['task-api.json']);
      if (index < 2) {
        expect(result.stdout).toBe('');
        expect(acmeAfter).toBe(previous['acme-shop.json']);
      } else {
        expect(result.stdout).toBe('acme-shop: 3 question embeddings -> seeds/cache/acme-shop.json\n');
        expect((JSON.parse(acmeAfter) as GoldenFile).entries.map((entry) => entry.questionEmbedding)).toEqual([good(), good(), good()]);
      }
      expect(readdirSync(join(root, 'seeds', 'cache')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
      const output = result.stdout + result.stderr;
      for (const secret of ['127.0.0.1:1', 'k3y', root, leaked, ...goldenQuestions()]) expect(output).not.toContain(secret);
    }
  });

  it('A failed write leaves the golden files intact', async () => {
    // Arrange: a model answering every entry, and a write that fails for one named file
    const previous = previousFiles();
    const embed = (texts: readonly string[]): number[][] => texts.map(() => embeddingVector(1, 0.25));
    const failingFor = (name: string): CacheEmbedDeps['write'] => (path, content) => {
      if (path.endsWith(name)) throw new Error('disk full');
      writeAtomically(path, content);
    };

    // Act
    const rootA = scratchRoot(previous);
    const first = await run([], rootA, LIVE_ENV, { embed }, { write: failingFor('acme-shop.json') });
    const rootB = scratchRoot(previous);
    const second = await run([], rootB, LIVE_ENV, { embed }, { write: failingFor('task-api.json') });

    // Assert
    expect(first.exit).toBe(1);
    expect(first.error).toEqual({ code: 'INTERNAL', message: 'cache embed failed; nothing was written', details: {} });
    expect(first.stdout).toBe('');
    for (const name of Object.keys(previous)) expect(readFileSync(join(rootA, 'seeds', 'cache', name), 'utf8')).toBe(previous[name]);
    expect(second.exit).toBe(1);
    expect(second.error).toEqual({
      code: 'INTERNAL',
      message:
        'cache embed failed after writing seeds/cache/acme-shop.json; seeds/cache/task-api.json was not written — ' +
        'run npm run cache:embed -- --project task-api',
      details: {},
    });
    expect(second.stdout).toBe('acme-shop: 3 question embeddings -> seeds/cache/acme-shop.json\n');
    expect((JSON.parse(readFileSync(join(rootB, 'seeds', 'cache', 'acme-shop.json'), 'utf8')) as GoldenFile).entries.map((entry) => entry.questionEmbedding)).toEqual(
      [embeddingVector(1, 0.25), embeddingVector(1, 0.25), embeddingVector(1, 0.25)],
    );
    expect(readFileSync(join(rootB, 'seeds', 'cache', 'task-api.json'), 'utf8')).toBe(previous['task-api.json']);
    for (const root of [rootA, rootB]) {
      expect(readdirSync(join(root, 'seeds', 'cache')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    }
  });
});

// Below the spec scenarios: argument shapes (added after the step 12 mutation run, for its meaningful
// survivors).
describe('cache:embed arguments', () => {
  it('Only the named project is embedded', async () => {
    // Arrange
    const previous = previousFiles();
    const root = scratchRoot(previous);

    // Act
    const result = await run(['--project', 'task-api'], root, LIVE_ENV, { embed: (texts) => texts.map(() => embeddingVector(1, 0.5)) });

    // Assert
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe('task-api: 3 question embeddings -> seeds/cache/task-api.json\n');
    expect(result.embeddings).toHaveLength(3);
    expect(readFileSync(join(root, 'seeds', 'cache', 'acme-shop.json'), 'utf8')).toBe(previous['acme-shop.json']);
    expect(readFileSync(join(root, 'seeds', 'cache', 'task-api.json'), 'utf8')).not.toBe(previous['task-api.json']);
  });

  it('A positional argument before a project name is a usage error', async () => {
    // Arrange
    const root = scratchRoot({ 'acme-shop.json': PREVIOUS, 'task-api.json': PREVIOUS });

    // Act
    const result = await run(['Q1', 'acme-shop'], root, LIVE_ENV);

    // Assert
    expect(result.exit).toBe(1);
    expect(result.error).toEqual({ code: 'USAGE', message: USAGE_MESSAGE, details: {} });
  });
});

/** Throws `error`: a model double that fails. */
function failWith(error: Error): never {
  throw error;
}

/** The previous golden files, each with a vector on its first entry. */
function previousFiles(): Record<string, string> {
  const withVector = (file: GoldenFile): GoldenFile => ({
    ...file,
    entries: file.entries.map((entry, i) => (i === 0 ? { ...entry, questionEmbedding: goldenVector(9) } : entry)),
  });
  return {
    'acme-shop.json': renderGoldenFile(withVector(goldenFile())),
    'task-api.json': renderGoldenFile(withVector(goldenFile({ project: 'task-api' }))),
  };
}

/** A copy of `file` with every `questionEmbedding` set to `null`. */
function withoutVectors(file: GoldenFile): GoldenFile {
  return { ...file, entries: file.entries.map((entry) => ({ ...entry, questionEmbedding: null })) };
}

/** The golden questions of both projects. */
function goldenQuestions(): string[] {
  return [...goldenFile().entries, ...goldenFile({ project: 'task-api' }).entries].map((entry) => entry.question);
}
