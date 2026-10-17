import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPostgresStore } from '@codemind/adapter-store-postgres';
import type { LiveLlmConfig } from '@codemind/adapter-llm';
import { LlmUnavailable, normalizeQuestion, parseStoredResponse } from '@codemind/core';
import { runCacheBuild } from '../../../packages/cli/src/cache-build';
import type { CacheBuildDeps } from '../../../packages/cli/src/cache-build';
import { answerFingerprint } from '../../../packages/cli/src/cache/answer-fingerprint';
import { GOLDEN_QUESTIONS } from '../../../packages/cli/src/cache/demo-questions';
import { checkGoldenFile, renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import type { GoldenFile } from '../../../packages/cli/src/cache/golden-file';
import type { OpenTransaction } from '../../../packages/cli/src/compose-index';
import { createScriptedLlm, modelOutput, promptView } from '../../support/scripted-llm';
import type { PromptView, Script, ScriptedLlm } from '../../support/scripted-llm';
import { databaseUrl, describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md. Each `it` is the scenario it
// is named after. `fixtures/acme-shop` is copied (without `.git`) under a temporary workspace `T`
// (`T/fixtures/acme-shop`) and its history rebuilt there once, in `beforeAll`; the build's own
// `buildHistory` is then a no-op (audit F18). Each attempt's transaction is a savepoint on the harness
// client, so its rollback is observable and every row is reverted when the test ends. The model is the
// scripted double in live mode; the seed is the versioned one, and `seedFingerprints` returns its own
// header pair, so the suite does not depend on the seed being rebuilt (DIS-26 design C9).

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SEED_PATH = resolve(WORKSPACE_ROOT, 'seeds/graph-dump.sql');
const SEED = readFileSync(SEED_PATH, 'utf8');
const HEADER = {
  analyzer: /^-- analyzer-fingerprint: (\S+)$/m.exec(SEED)![1],
  contract: /^-- contract-fingerprint: (\S+)$/m.exec(SEED)![1],
};
const ENV = { DATABASE_URL: databaseUrl, LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LLM_MODEL: 'qwen2.5-coder' };
/** History rebuild, then up to nine `explain` calls over the seed. */
const TIMEOUT_MS = 180_000;
const AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';

type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

let T = '';

beforeAll(async () => {
  const { buildOne } = (await import(pathToFileURL(resolve(WORKSPACE_ROOT, 'fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  T = mkdtempSync(join(tmpdir(), 'codemind-cache-build-'));
  const acmeShop = join(T, 'fixtures', 'acme-shop');
  cpSync(resolve(WORKSPACE_ROOT, 'fixtures/acme-shop'), acmeShop, { recursive: true, filter: (source) => basename(source) !== '.git' });
  await buildOne('acme-shop', { dir: acmeShop, manifest: resolve(WORKSPACE_ROOT, 'fixtures/history/acme-shop.commits.mjs') });
}, TIMEOUT_MS);

afterAll(() => {
  if (T !== '') rmSync(T, { recursive: true, force: true });
});

/** The golden question id a prompt asks about. */
function questionId(prompt: PromptView): string {
  const golden = GOLDEN_QUESTIONS.find(({ question }) => prompt.question.includes(question));
  return golden?.id ?? '?';
}

/** A valid answer of one statement citing the first span of the prompt. */
function validAnswer(prompt: PromptView, text = 'El código responde a la pregunta.'): string {
  return modelOutput(`Respuesta a ${questionId(prompt)}.`, [{ text, evidenceIds: [prompt.evidence[0].id] }]);
}

interface Run {
  exit: number;
  stdout: string;
  stderr: string;
  stderrLines: string[];
  log: string[];
  model: ScriptedLlm;
  configs: LiveLlmConfig[];
}

/** The ids of the questions the model was asked with the purpose `answer`, in order. */
function askedIds(model: ScriptedLlm): string[] {
  return model.requests.filter((request) => request.purpose === 'answer').map((request) => questionId(promptView(request)));
}

function savepointTransaction(client: Client, log: string[]): OpenTransaction {
  return async () => {
    log.push('open');
    await client.query('SAVEPOINT cache_build');
    return {
      client,
      commit: async () => {
        log.push('commit');
        await client.query('RELEASE SAVEPOINT cache_build');
      },
      rollback: async () => {
        log.push('rollback');
        await client.query('ROLLBACK TO SAVEPOINT cache_build');
      },
      release: async () => void log.push('release'),
    };
  };
}

async function build(
  client: Client,
  options: { argv?: string[]; script?: Script; output: string; seedPath?: string; env?: Record<string, string | undefined>; seams?: Partial<CacheBuildDeps> },
): Promise<Run> {
  const log: string[] = [];
  const configs: LiveLlmConfig[] = [];
  const model = createScriptedLlm('live', options.script ?? ((prompt) => validAnswer(prompt)));
  let stdout = '';
  let stderr = '';
  const exit = await runCacheBuild(options.argv ?? [], {
    env: options.env ?? ENV,
    stdout: { write: (chunk: string) => void (stdout += chunk) },
    stderr: { write: (chunk: string) => void (stderr += chunk) },
    workspaceRoot: T,
    seedPath: options.seedPath ?? SEED_PATH,
    outputPath: options.output,
    buildHistory: async () => void log.push('history'),
    seedFingerprints: () => HEADER,
    openTransaction: savepointTransaction(client, log),
    createLlm: (config) => {
      configs.push(config);
      return model.llm;
    },
    ...options.seams,
  });
  return { exit, stdout, stderr, stderrLines: stderr.split('\n').filter((line) => line !== ''), log, model, configs };
}

function errorOf(run: Run): { code: string; message: string; details: Record<string, unknown> } {
  expect(run.stderrLines).toHaveLength(1);
  return (JSON.parse(run.stderrLines[0]) as { error: { code: string; message: string; details: Record<string, unknown> } }).error;
}

/** A fresh output path in a directory that does not exist yet. */
function freshOutput(): string {
  return join(T, unique('out'), 'nested', 'acme-shop.json');
}

/** An output path holding `content`. */
function previousOutput(content: string): string {
  const output = freshOutput();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
  return output;
}

/** The project ids and every row of the tables the build could touch, in a stable order. */
async function snapshot(client: Client): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [table, order] of [
    ['project', 'id'],
    ['claim', 'id'],
    ['evidence', 'id'],
    ['query_log', 'id'],
    ['cache_entry', 'id'],
  ]) {
    result[table] = (await client.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
  }
  return result;
}

/** The `file` rows of the seed: id → path. */
function seedFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const line of SEED.split('\n')) {
    const match = /^INSERT INTO file \(id, project_id, path,[^)]*\) VALUES \('([^']+)', '[^']+', '((?:[^']|'')*)'/.exec(line);
    if (match !== null) files.set(match[1], match[2].replace(/''/g, "'"));
  }
  return files;
}

/** A previous golden file whose fingerprints and models match the current ones. */
const PREVIOUS_KNOWN = '{"previous": true}\n';

describeWithDatabase('cache build (integration)', () => {
  const db = useTransactionPerTest();

  it(
    'The golden answers are generated with a scripted model',
    async () => {
      // Arrange
      const before = await snapshot(db());
      const output = freshOutput();

      // Act
      const run = await build(db(), { output });

      // Assert
      expect(run.exit).toBe(0);
      expect(run.stderr).toBe('');
      expect(existsSync(dirname(output))).toBe(true);
      const lines = run.stdout.split('\n');
      expect(lines.slice(0, 3).map((line) => line.replace(/answered in \d+ s/, 'answered in N s'))).toEqual([
        'Q1: answered in N s (attempt 1/3)',
        'Q3: answered in N s (attempt 1/3)',
        'Q4: answered in N s (attempt 1/3)',
      ]);
      expect(lines.slice(3)).toEqual(['acme-shop: 3 golden answers -> acme-shop.json', '']);
      const text = readFileSync(output, 'utf8');
      const file = checkGoldenFile(JSON.parse(text), { seedProjectNames: ['acme-shop'], fileName: 'acme-shop.json' }) as GoldenFile;
      expect(file).toBeDefined();
      expect(renderGoldenFile(file)).toBe(text);
      expect(file.project).toBe('acme-shop');
      expect(file.seed).toEqual({ analyzerFingerprint: HEADER.analyzer, contractFingerprint: HEADER.contract });
      expect(file.answerFingerprint).toBe(answerFingerprint(WORKSPACE_ROOT));
      expect(file.generatedWith).toEqual({ model: 'qwen2.5-coder', verifyModel: 'qwen2.5-coder' });
      expect(file.entries.map(({ id, question, questionNormalized, reviews }) => ({ id, question, questionNormalized, reviews }))).toEqual(
        GOLDEN_QUESTIONS.map(({ id, question }) => ({ id, question, questionNormalized: normalizeQuestion(question), reviews: [] })),
      );
      const files = seedFiles();
      for (const entry of file.entries) {
        const response = parseStoredResponse(entry.response);
        expect(response?.kind).toBe('answered');
        if (response?.kind !== 'answered') continue;
        expect(response.priorClaims).toEqual([]);
        for (const evidence of response.evidence) expect(files.get(evidence.fileId)).toBe(evidence.path);
      }
      expect(run.log).toEqual(['history', 'open', 'rollback', 'release', 'open', 'rollback', 'release', 'open', 'rollback', 'release']);
      expect(await snapshot(db())).toEqual(before);
    },
    TIMEOUT_MS,
  );

  it(
    'An invalid model output is retried',
    async () => {
      // Arrange
      let q3 = 0;
      const script: Script = (prompt) => {
        if (questionId(prompt) !== 'Q3') return validAnswer(prompt);
        q3 += 1;
        return q3 === 1 ? 'this is not JSON' : validAnswer(prompt);
      };
      const output = freshOutput();

      // Act
      const run = await build(db(), { output, script });

      // Assert
      expect(run.exit).toBe(0);
      expect(run.stderr).toBe('');
      const file = JSON.parse(readFileSync(output, 'utf8')) as GoldenFile;
      expect(file.entries.map((entry) => entry.id)).toEqual(['Q1', 'Q3', 'Q4']);
      const lines = run.stdout.split('\n').map((line) => line.replace(/answered in \d+ s/, 'answered in N s'));
      const failed = lines.indexOf('Q3: attempt 1/3 not cacheable (invalid-model-output)');
      expect(failed).toBeGreaterThan(-1);
      expect(lines[failed + 1]).toBe('Q3: answered in N s (attempt 2/3)');
    },
    TIMEOUT_MS,
  );

  it(
    'A question without a cacheable answer fails without writing',
    async () => {
      // Arrange
      const before = await snapshot(db());
      const cases: [Script, Record<string, string>, string, number][] = [
        [(prompt) => (questionId(prompt) === 'Q3' ? 'not JSON' : validAnswer(prompt)), { id: 'Q3', reason: 'invalid-model-output' }, 'Q3: attempt 3/3 not cacheable (invalid-model-output)', 3],
        [(prompt) => (questionId(prompt) === 'Q1' ? modelOutput('Nada.', []) : validAnswer(prompt)), { id: 'Q1', reason: 'no-evidence' }, 'Q1: attempt 3/3 not cacheable (no-evidence)', 3],
        [
          (prompt) => (questionId(prompt) === 'Q4' ? validAnswer(prompt, `La clave ${AWS_KEY} aparece en el código.`) : validAnswer(prompt)),
          { id: 'Q4', reason: 'unsafe-content' },
          'Q4: attempt 1/3 not cacheable (unsafe-content)',
          1,
        ],
      ];
      for (const [script, details, lastLine, attempts] of cases) {
        const output = previousOutput(PREVIOUS_KNOWN);

        // Act
        const run = await build(db(), { output, script });

        // Assert
        expect(run.exit).toBe(1);
        const error = errorOf(run);
        expect(error.code).toBe('GOLDEN_NOT_CACHEABLE');
        expect(error.details).toEqual(details);
        const lines = run.stdout.split('\n').filter((line) => line !== '');
        expect(lines.at(-1)).toBe(lastLine);
        expect(askedIds(run.model).filter((id) => id === details.id)).toHaveLength(attempts);
        expect(run.stdout + run.stderr).not.toContain(AWS_KEY);
        expect(readFileSync(output, 'utf8')).toBe(PREVIOUS_KNOWN);
        expect(readdirSync(dirname(output))).toEqual(['acme-shop.json']);
        expect(await snapshot(db())).toEqual(before);
      }
    },
    TIMEOUT_MS * 2,
  );

  it(
    'A model that keeps timing out is reported as unavailable',
    async () => {
      // Arrange
      const output = previousOutput(PREVIOUS_KNOWN);
      const script: Script = () => {
        throw new LlmUnavailable('timeout');
      };

      // Act
      const run = await build(db(), { output, script });

      // Assert
      expect(run.exit).toBe(1);
      expect(run.stdout).toBe(
        ['Q1: attempt 1/3 not cacheable (timeout)', 'Q1: attempt 2/3 not cacheable (timeout)', 'Q1: attempt 3/3 not cacheable (timeout)', ''].join('\n'),
      );
      const error = errorOf(run);
      expect(error.code).toBe('LLM_UNAVAILABLE');
      expect(error.details.reason).toBe('timeout');
      expect(readFileSync(output, 'utf8')).toBe(PREVIOUS_KNOWN);
    },
    TIMEOUT_MS,
  );

  it(
    'Only the named question is regenerated',
    async () => {
      // Arrange: a full build, then a review added to Q1 by hand.
      const output = freshOutput();
      const first = await build(db(), { output });
      expect(first.exit).toBe(0);
      const reviewed = JSON.parse(readFileSync(output, 'utf8')) as GoldenFile;
      reviewed.entries[0].reviews = [{ by: 'author', date: '2026-10-17' }];
      writeFileSync(output, renderGoldenFile(reviewed));

      // Act
      const partial = await build(db(), {
        output,
        argv: ['Q3'],
        script: (prompt) => validAnswer(prompt, 'Los cupones se validan en CouponValidator.'),
      });

      // Assert
      expect(partial.exit).toBe(0);
      expect(askedIds(partial.model)).toEqual(['Q3']);
      expect(partial.stdout.split('\n').at(-2)).toBe('acme-shop: 3 golden answers -> acme-shop.json');
      const after = JSON.parse(readFileSync(output, 'utf8')) as GoldenFile;
      expect(after.entries.map((entry) => entry.id)).toEqual(['Q1', 'Q3', 'Q4']);
      expect(after.entries[0]).toEqual(reviewed.entries[0]);
      expect(after.entries[2]).toEqual(reviewed.entries[2]);
      expect(after.entries[1].reviews).toEqual([]);
      expect(JSON.stringify(after.entries[1].response)).toContain('Los cupones se validan en CouponValidator.');

      // And a run without arguments regenerates the three, every `reviews` empty.
      const full = await build(db(), { output });
      expect(full.exit).toBe(0);
      expect(askedIds(full.model)).toEqual(['Q1', 'Q3', 'Q4']);
      expect((JSON.parse(readFileSync(output, 'utf8')) as GoldenFile).entries.map((entry) => entry.reviews)).toEqual([[], [], []]);
    },
    TIMEOUT_MS * 2,
  );

  it(
    'A missing or outdated seed is refused',
    async () => {
      // Arrange
      const seeds = join(T, unique('seeds'));
      mkdirSync(seeds);
      const stale = join(seeds, 'stale.sql');
      writeFileSync(stale, SEED.replace(HEADER.analyzer, `sha256:${'0'.repeat(64)}`));
      const moved = join(seeds, 'moved.sql');
      writeFileSync(moved, SEED.replace(/'[0-9a-f]{40}', 174, 170/, `'${'f'.repeat(40)}', 174, 170`));
      expect(readFileSync(moved, 'utf8')).not.toBe(SEED);
      const cases: [string, string, string][] = [
        [join(seeds, 'graph-dump.sql'), 'INVALID_SEED', 'missing'],
        [stale, 'GOLDEN_STALE', 'seed'],
        [moved, 'GOLDEN_STALE', 'seed'],
      ];
      for (const [seedPath, code, reason] of cases) {
        const output = previousOutput(PREVIOUS_KNOWN);

        // Act
        const run = await build(db(), { output, seedPath });

        // Assert
        expect(run.exit).toBe(1);
        expect(run.stdout).toBe('');
        expect(errorOf(run)).toEqual({
          code,
          message: code === 'INVALID_SEED' ? 'graph-dump.sql is not a loadable codemind seed (missing)' : 'seed out of date: run npm run seed:build',
          details: { reason },
        });
        expect(run.log.filter((entry) => entry === 'open')).toEqual([]);
        expect(run.model.requests).toEqual([]);
        expect(readFileSync(output, 'utf8')).toBe(PREVIOUS_KNOWN);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'A non-sample acme-shop blocks the cache build',
    async () => {
      // Arrange
      await db().query('DELETE FROM project');
      const store = createPostgresStore({ transaction: db() });
      const id = await store.createProject({ name: 'acme-shop', rootPath: '/repos/acme', language: 'php' });
      const before = await snapshot(db());
      const output = previousOutput(PREVIOUS_KNOWN);

      // Act
      const run = await build(db(), { output });

      // Assert
      expect(run.exit).toBe(1);
      expect(errorOf(run)).toEqual({
        code: 'PROJECT_NAME_TAKEN',
        message: 'a project named "acme-shop" already exists and is not a sample',
        details: { name: 'acme-shop' },
      });
      expect(run.model.requests).toEqual([]);
      expect(run.log).toEqual(['history', 'open', 'rollback', 'release']);
      expect(await snapshot(db())).toEqual(before);
      expect((await store.getProject(id)).name).toBe('acme-shop');
      expect(readFileSync(output, 'utf8')).toBe(PREVIOUS_KNOWN);
    },
    TIMEOUT_MS,
  );

  it(
    'Unreachable services are reported without their URLs',
    async () => {
      // Arrange
      const output = previousOutput(PREVIOUS_KNOWN);
      const env = { DATABASE_URL: 'postgres://u:s3cret@127.0.0.1:1/db', LLM_BASE_URL: 'http://127.0.0.1:1/v1', LLM_API_KEY: 'k3y', LLM_MODEL: 'qwen2.5-coder' };

      // Act: the default transaction and model, on the unreachable URLs.
      const run = await build(db(), { output, env, seams: { openTransaction: undefined, createLlm: undefined } });

      // Assert
      expect(run.exit).toBe(1);
      expect(errorOf(run).code).toBe('DATABASE_UNAVAILABLE');
      for (const leak of ['s3cret', 'u:', 'k3y', '127.0.0.1:1']) expect(run.stdout + run.stderr).not.toContain(leak);
      expect(readFileSync(output, 'utf8')).toBe(PREVIOUS_KNOWN);
    },
    TIMEOUT_MS,
  );
});
