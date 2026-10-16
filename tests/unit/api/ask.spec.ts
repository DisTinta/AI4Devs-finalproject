import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { LLM_REQUIRED_MESSAGE } from '@codemind/core';
import type {
  explain,
  ExplainAnswer,
  ExplainDependencies,
  ExplainEvent,
  ExplainRequest,
  AnswerEvidence,
  AnswerStatement,
  AnswerUsage,
  AnsweredExplain,
  LlmPort,
  SourceTreePort,
  StorePort,
  UnknownExplain,
} from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import type { AppDeps, AppOptions } from '../../../packages/api/src/app';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createInMemoryStore } from '../../support/in-memory-store';
import { createScriptedLlm } from '../../support/scripted-llm';
import { counting, defaultDeps, errorBody } from './support';
import type { Counted } from './support';

// Spec: openspec/changes/ask-endpoint/specs/http-ask/spec.md (DIS-78). Each `it` is the scenario it
// is named after. The app is built with `buildApp` over an in-memory store holding the acme-shop
// subset; the store, the model and the source tree are wrapped by `counting()`, so "without asking"
// is observed as no call on any of them. Where a scenario says "a use case that…", the `explain`
// seam of `buildApp` stands for the use case.

const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const SMILE = '\u{1F600}';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** What a test may choose when building the ask app. */
interface AskAppOptions {
  /** The use case seam; core's `explain` when absent. */
  explain?: typeof explain;
  /** The rate limit; one that never trips when absent. */
  rateLimit?: AppOptions['rateLimit'];
  /** The logger options; no logger when absent. */
  logger?: AppOptions['logger'];
  /** Replaces any of the doubles. */
  deps?: Partial<AppDeps>;
}

/** The ready app, the stored project's id and the counted ports. */
interface AskApp {
  app: FastifyInstance;
  projectId: string;
  store: Counted<StorePort>;
  llm: Counted<LlmPort>;
  source: Counted<SourceTreePort>;
}

/** The app over the acme-shop subset in memory, an evaluation-mode model and an empty source tree, all counted. */
async function askApp(options: AskAppOptions = {}): Promise<AskApp> {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  const store = counting(loaded.store);
  const llm = counting(createScriptedLlm('evaluation').llm);
  const source = counting(createInMemorySourceTree({}).source);
  const built = await buildApp(
    { ...defaultDeps(), store: store.port, llm: llm.port, source: source.port, ...options.deps },
    {
      rateLimit: options.rateLimit ?? { max: 1_000_000, windowMs: 60_000 },
      ...(options.logger !== undefined && { logger: options.logger }),
      ...(options.explain !== undefined && { explain: options.explain }),
    },
  );
  await built.ready();
  app = built;
  return { app: built, projectId: loaded.projectIds[0]!, store, llm, source };
}

/** `POST /api/projects/<projectId>/ask` with `payload`. */
function ask(target: FastifyInstance, projectId: string, payload: unknown, remoteAddress?: string): Promise<LightMyRequestResponse> {
  return target.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/ask`,
    payload: payload as Record<string, unknown>,
    ...(remoteAddress !== undefined && { remoteAddress }),
  });
}

/** Whether no counted port received a call. */
function noCalls(ports: Pick<AskApp, 'store' | 'llm' | 'source'>): boolean {
  return ports.store.calls() === 0 && ports.llm.calls() === 0 && ports.source.calls() === 0;
}

/** A use case seam that records its requests and answers with `answers()` (resolved or thrown). */
function useCase(answers: () => ExplainAnswer | Promise<ExplainAnswer> = () => unknownAnswer('no-anchor')): {
  explain: typeof explain;
  requests: ExplainRequest[];
} {
  const requests: ExplainRequest[] = [];
  const seam = (async (_dependencies: ExplainDependencies, request: ExplainRequest) => {
    requests.push(request);
    return answers();
  }) as typeof explain;
  return { explain: seam, requests };
}

/** An `UNKNOWN` answer of `explain` with `reason` and `events`. */
function unknownAnswer(reason: UnknownExplain['reason'], events: ExplainEvent[] = []): UnknownExplain {
  return {
    kind: 'unknown',
    answer: 'UNKNOWN',
    reason,
    ...(reason === 'llm-required' && { message: LLM_REQUIRED_MESSAGE }),
    statements: [],
    evidence: [],
    events,
  };
}

describe('ask request validation', () => {
  it('An invalid question answers VALIDATION_ERROR without asking', async () => {
    // Arrange
    const built = await askApp();
    const payloads = [
      { question: 'abc' },
      { question: SMILE.repeat(501) },
      { question: '       ' },
      { question: 'price\u0000calc' },
      {},
    ];

    // Act
    const responses = [];
    for (const payload of payloads) responses.push(await ask(built.app, built.projectId, payload));

    // Assert
    for (const response of responses) {
      expect(response.statusCode).toBe(400);
      const { error } = response.json();
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('invalid request');
      expect(error.details.issues.map((issue: { path: unknown }) => issue.path)).toContainEqual(['question']);
      for (const value of ['abc', 'price', 'calc']) expect(response.body).not.toContain(value);
    }
    expect(noCalls(built)).toBe(true);
  });

  it('A question at the length bounds is accepted', async () => {
    // Arrange
    const built = await askApp();
    const shortest = SMILE.repeat(5);
    const longest = SMILE.repeat(500);

    // Act
    const atMin = await ask(built.app, built.projectId, { question: shortest });
    const atMax = await ask(built.app, built.projectId, { question: longest });

    // Assert
    expect(shortest).toHaveLength(10);
    expect(longest).toHaveLength(1_000);
    expect(atMin.statusCode).toBe(200);
    expect(atMax.statusCode).toBe(200);
  });

  it('An invalid token budget, cache flag or extra key answers VALIDATION_ERROR', async () => {
    // Arrange
    const built = await askApp();
    const payloads = [
      { question: Q1, tokenBudget: 50 },
      { question: Q1, tokenBudget: 999 },
      { question: Q1, tokenBudget: 32_001 },
      { question: Q1, tokenBudget: 8000.5 },
      { question: Q1, tokenBudget: '8000' },
      { question: Q1, useCache: 'yes' },
      { question: Q1, hops: 2 },
      { question: Q1, x: 1 },
    ];

    // Act
    const responses = [];
    for (const payload of payloads) responses.push(await ask(built.app, built.projectId, payload));

    // Assert
    const codes = responses.map((response) => {
      expect(response.statusCode).toBe(400);
      const { error } = response.json();
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.issues).toHaveLength(1);
      return error.details.issues[0].code;
    });
    expect(codes).toEqual(['too_small', 'too_small', 'too_big', 'invalid_type', 'invalid_type', 'invalid_type', 'unrecognized_keys', 'unrecognized_keys']);
    expect(noCalls(built)).toBe(true);
  });

  it('A malformed project id answers VALIDATION_ERROR', async () => {
    // Arrange
    const built = await askApp();
    const ids = ['not-a-uuid', '123', built.projectId.replaceAll('-', '')];

    // Act
    const responses = [];
    for (const id of ids) responses.push(await ask(built.app, id, { question: Q1 }));

    // Assert
    responses.forEach((response, i) => {
      expect(response.statusCode).toBe(400);
      const { error } = response.json();
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.issues.map((issue: { path: unknown }) => issue.path)).toContainEqual(['projectId']);
      expect(response.body).not.toContain(ids[i]);
    });
    expect(built.store.calls()).toBe(0);
  });

  it('Optional fields are forwarded as the use case expects', async () => {
    // Arrange
    const recorded = useCase();
    const built = await askApp({ explain: recorded.explain });

    // Act
    const responses = [
      await ask(built.app, built.projectId, { question: Q1 }),
      await ask(built.app, built.projectId, { question: Q1, tokenBudget: 1000 }),
      await ask(built.app, built.projectId, { question: Q1, tokenBudget: 32_000, useCache: false }),
    ];

    // Assert
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(recorded.requests).toEqual([
      { projectId: built.projectId, question: Q1 },
      { projectId: built.projectId, question: Q1, tokenBudget: 1000 },
      { projectId: built.projectId, question: Q1, tokenBudget: 32_000 },
    ]);
  });
});

/** The usage of a canned answer: every number distinct, so a copied field is told apart. */
const USAGE: AnswerUsage = {
  inputTokens: 120,
  outputTokens: 30,
  baselineTokens: 900,
  baselineEstimator: 'chars-div-4',
  savingsPct: 86.7,
  costUsd: 0.0012,
  latencyMs: 42,
  cacheHit: false,
  generation: { inputTokens: 100, outputTokens: 20, costUsd: 0.001 },
  verification: { calls: 2, cacheHits: 1, inputTokens: 20, outputTokens: 10, costUsd: 0.0002, latencyMs: 7 },
};

/** An evidence entry of a canned answer with `id`, citing `path` lines 1–2 (its file id and excerpt named after the path). */
function evidenceOf(id: string, path = `app/${id}.php`): AnswerEvidence {
  return { id, fileId: `file-of-${path}`, path, startLine: 1, endLine: 2, excerpt: `excerpt of ${path}` };
}

/** A current statement of a canned answer citing `evidenceIds`. */
function statementOf(text: string, evidenceIds: string[]): AnswerStatement {
  return { text, type: 'FACT', status: 'current', verification: 'entailed', evidenceIds };
}

/** A stored answered `explain` result with `evidence` and `statements`. */
function answered(evidence: AnswerEvidence[], statements: AnswerStatement[], extra: Partial<AnsweredExplain> = {}): AnsweredExplain {
  return {
    kind: 'answered',
    persisted: true,
    answer: 'The final price is computed by PriceCalculator.',
    statements,
    evidence,
    priorClaims: [],
    events: [],
    usage: USAGE,
    confidence: 0.73,
    ...extra,
  } as AnsweredExplain;
}


/** Every object key at any depth of `value`. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

describe('ask answered response', () => {
  it('Evidence ids are renumbered in evidence order', async () => {
    // Arrange
    const [x, y, z] = ['00000000-0000-4000-8000-00000000000a', 'E7', 'evidence-Z'];
    const recorded = useCase(() => answered([evidenceOf(x!, 'app/X.php'), evidenceOf(y!, 'app/Y.php'), evidenceOf(z!, 'app/Z.php')], [
      statementOf('first statement', [y!, x!]),
      statementOf('second statement', [z!]),
    ]));
    const built = await askApp({ explain: recorded.explain });

    // Act
    const response = await ask(built.app, built.projectId, { question: Q1 });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.evidence.map((entry: { id: string; file: string }) => [entry.id, entry.file])).toEqual([
      ['ev-1', 'app/X.php'],
      ['ev-2', 'app/Y.php'],
      ['ev-3', 'app/Z.php'],
    ]);
    expect(body.statements.map((statement: { evidenceIds: string[] }) => statement.evidenceIds)).toEqual([['ev-2', 'ev-1'], ['ev-3']]);
    for (const id of [x!, y!, z!]) expect(response.body).not.toContain(id);
  });

  it('Internal fields of the answer are not sent', async () => {
    // Arrange
    const priorClaim = {
      id: '11111111-2222-4333-8444-555555555555',
      text: 'SENTINEL-prior-claim-text',
      type: 'INFERENCE' as const,
      status: 'current' as const,
      evidence: [evidenceOf('E9', 'app/Prior.php')],
    };
    const recorded = useCase(() =>
      answered(
        [evidenceOf('E1', 'app/Services/PriceCalculator.php')],
        [{ text: 'stale statement', type: 'INFERENCE', status: 'stale', warning: 'stale-evidence', verification: 'cited', evidenceIds: ['E1'] }],
        {
          persisted: false,
          priorClaims: [priorClaim],
          events: [
            { type: 'untrusted_content_flagged', source: 'question', pattern: 'ignore-instructions' },
            { type: 'claims_not_persisted', code: 'store-write-failed' },
          ],
        },
      ),
    );
    const built = await askApp({ explain: recorded.explain });

    // Act
    const response = await ask(built.app, built.projectId, { question: Q1 });

    // Assert
    expect(response.statusCode).toBe(200);
    const keys = keysOf(response.json());
    for (const key of ['fileId', 'priorClaims', 'events', 'persisted', 'kind', 'status', 'warning']) expect(keys).not.toContain(key);
    expect(response.body).not.toContain(priorClaim.text);
    expect(response.body).not.toContain(priorClaim.id);
  });

  it('A statement citing an unknown evidence id answers INTERNAL', async () => {
    // Arrange
    const recorded = useCase(() => answered([evidenceOf('X')], [statementOf('cites a missing id', ['Y'])]));
    const built = await askApp({ explain: recorded.explain });

    // Act
    const response = await ask(built.app, built.projectId, { question: Q1 });

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
  });
});

describe('ask UNKNOWN response', () => {
  it('Another UNKNOWN reason carries no message', async () => {
    // Arrange
    const broken: ExplainEvent = { type: 'evidence_broken', evidenceId: 'E1', path: 'app/Gone.php', startLine: 1, endLine: 2, reason: 'file-missing' };
    const answers = [unknownAnswer('no-anchor'), unknownAnswer('broken-evidence', [broken])];
    const recorded = useCase(() => answers.shift()!);
    const built = await askApp({ explain: recorded.explain });

    // Act
    const first = await ask(built.app, built.projectId, { question: Q1 });
    const second = await ask(built.app, built.projectId, { question: Q1 });

    // Assert
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [] });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ answer: 'UNKNOWN', reason: 'broken-evidence', statements: [], evidence: [] });
  });
});

describe('ask project resolution', () => {
  it('An unknown project answers PROJECT_NOT_FOUND', async () => {
    // Arrange
    const built = await askApp();
    const unknownId = randomUUID();

    // Act
    const anchored = await ask(built.app, unknownId, { question: Q1 });
    const unanchored = await ask(built.app, unknownId, { question: SMILE.repeat(5) });

    // Assert
    for (const response of [anchored, unanchored]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(errorBody('PROJECT_NOT_FOUND', 'project not found'));
      expect(response.body).not.toContain(unknownId);
    }
    expect(built.llm.calls()).toBe(0);
  });
});
