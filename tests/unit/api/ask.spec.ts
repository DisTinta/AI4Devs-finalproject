import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { explain, LlmPort, SourceTreePort, StorePort } from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import type { AppDeps, AppOptions } from '../../../packages/api/src/app';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createInMemoryStore } from '../../support/in-memory-store';
import { createScriptedLlm } from '../../support/scripted-llm';
import { counting, defaultDeps } from './support';
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
});
