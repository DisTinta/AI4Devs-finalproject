import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { InvalidImpactRequest, ProjectNotFound } from '@codemind/core';
import type { impact, ImpactReport, LlmPort, SourceTreePort, StorePort } from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import type { AppDeps, AppOptions } from '../../../packages/api/src/app';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createInMemoryStore } from '../../support/in-memory-store';
import { createScriptedLlm } from '../../support/scripted-llm';
import { counting, defaultDeps, errorBody, logStream } from './support';
import type { Counted } from './support';

// Spec: openspec/changes/http-impact/specs/http-impact/spec.md (DIS-95). Each `it` is the scenario it
// is named after. The app is built with `buildApp` over an in-memory store holding the acme-shop
// subset; the store, the model and the source tree are wrapped by `counting()`, so "without a store
// call" and "no model call" are observed as no call on them. Where a scenario says "a use case
// that…", the `impact` seam of `buildApp` stands for the use case.

const CHANGE = 'cambiar los descuentos de DiscountService';
const SMILE = '\u{1F600}';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** What a test may choose when building the impact app. */
interface ImpactAppOptions {
  /** The use case seam; core's `impact` when absent. */
  impact?: typeof impact;
  /** The rate limit; one that never trips when absent. */
  rateLimit?: AppOptions['rateLimit'];
  /** The logger options; no logger when absent. */
  logger?: AppOptions['logger'];
  /** Replaces any of the doubles. */
  deps?: Partial<AppDeps>;
}

/** The ready app, the stored project's id and the counted ports. */
interface ImpactApp {
  app: FastifyInstance;
  projectId: string;
  store: Counted<StorePort>;
  llm: Counted<LlmPort>;
  source: Counted<SourceTreePort>;
}

/** The app over the acme-shop subset in memory, an evaluation-mode model and an empty source tree, all counted. */
async function impactApp(options: ImpactAppOptions = {}): Promise<ImpactApp> {
  const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
  const store = counting(loaded.store);
  const llm = counting(createScriptedLlm('evaluation').llm);
  const source = counting(createInMemorySourceTree({}).source);
  const built = await buildApp(
    { ...defaultDeps(), store: store.port, llm: llm.port, source: source.port, ...options.deps },
    {
      rateLimit: options.rateLimit ?? { max: 1_000_000, windowMs: 60_000 },
      ...(options.logger !== undefined && { logger: options.logger }),
      ...(options.impact !== undefined && { impact: options.impact }),
    },
  );
  await built.ready();
  app = built;
  return { app: built, projectId: loaded.projectIds[0]!, store, llm, source };
}

/** `POST /api/projects/<projectId>/impact` with `payload`. */
function postImpact(target: FastifyInstance, projectId: string, payload: unknown, remoteAddress?: string): Promise<LightMyRequestResponse> {
  return target.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/impact`,
    payload: payload as Record<string, unknown>,
    ...(remoteAddress !== undefined && { remoteAddress }),
  });
}

/** The arguments the use case seam received. */
interface SeamCall {
  store: StorePort;
  request: unknown;
  options: { now: () => Date };
}

/** A use case seam that records its calls and answers with `answers()` (resolved or thrown). */
function useCase(answers: () => ImpactReport | Promise<ImpactReport> = () => unknownReport()): {
  impact: typeof impact;
  calls: SeamCall[];
} {
  const calls: SeamCall[] = [];
  const seam = (async (store: StorePort, request: unknown, options: { now: () => Date }) => {
    calls.push({ store, request, options });
    return answers();
  }) as typeof impact;
  return { impact: seam, calls };
}

/** An `unknown` report of the use case, with `events`. */
function unknownReport(events?: Extract<ImpactReport, { status: 'unknown' }>['events']): ImpactReport {
  return { status: 'unknown', reason: 'no-anchor', ...(events !== undefined && { events }) };
}

describe('impact request validation', () => {
  it('An invalid change answers VALIDATION_ERROR without a store call', async () => {
    // Arrange
    const recorded = useCase();
    const built = await impactApp({ impact: recorded.impact });
    const payloads = [
      { change: SMILE.repeat(4) },
      { change: SMILE.repeat(501) },
      { change: '       ' },
      { change: 'price\u0000calc' },
      {},
    ];

    // Act
    const responses = [];
    for (const payload of payloads) responses.push(await postImpact(built.app, built.projectId, payload));

    // Assert
    for (const response of responses) {
      expect(response.statusCode).toBe(400);
      const { error } = response.json();
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('invalid request');
      expect(error.details.issues.map((issue: { path: unknown }) => issue.path)).toContainEqual(['change']);
      for (const value of ['price', 'calc']) expect(response.body).not.toContain(value);
    }
    expect(built.store.calls()).toBe(0);
    expect(recorded.calls).toHaveLength(0);
  });

  it('A change at the length bounds is accepted', async () => {
    // Arrange
    const built = await impactApp();
    const shortest = SMILE.repeat(5);
    const longest = SMILE.repeat(500);

    // Act
    const atMin = await postImpact(built.app, built.projectId, { change: shortest });
    const atMax = await postImpact(built.app, built.projectId, { change: longest });

    // Assert
    expect(shortest).toHaveLength(10);
    expect(longest).toHaveLength(1_000);
    expect(atMin.statusCode).toBe(200);
    expect(atMax.statusCode).toBe(200);
  });

  it('An invalid hop limit or an extra key answers VALIDATION_ERROR', async () => {
    // Arrange
    const recorded = useCase();
    const built = await impactApp({ impact: recorded.impact });
    const payloads = [
      { change: CHANGE, maxHops: 0 },
      { change: CHANGE, maxHops: 4 },
      { change: CHANGE, maxHops: 1.5 },
      { change: CHANGE, maxHops: '2' },
      { change: CHANGE, hops: 2 },
      { change: CHANGE, projectId: built.projectId },
    ];

    // Act
    const responses = [];
    for (const payload of payloads) responses.push(await postImpact(built.app, built.projectId, payload));

    // Assert
    const codes = responses.map((response) => {
      expect(response.statusCode).toBe(400);
      const { error } = response.json();
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.issues).toHaveLength(1);
      expect(response.body).not.toContain('descuentos');
      return error.details.issues[0].code;
    });
    expect(codes).toEqual(['too_small', 'too_big', 'invalid_type', 'invalid_type', 'unrecognized_keys', 'unrecognized_keys']);
    expect(built.store.calls()).toBe(0);
    expect(recorded.calls).toHaveLength(0);
  });

  it('A malformed project id answers VALIDATION_ERROR on impact', async () => {
    // Arrange
    const built = await impactApp();
    const ids = ['not-a-uuid', '123', built.projectId.replaceAll('-', '')];

    // Act
    const responses = [];
    for (const id of ids) responses.push(await postImpact(built.app, id, { change: CHANGE }));

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

  it('The hop limit is forwarded only when sent', async () => {
    // Arrange
    const recorded = useCase();
    const built = await impactApp({ impact: recorded.impact });

    // Act
    const responses = [
      await postImpact(built.app, built.projectId, { change: CHANGE }),
      await postImpact(built.app, built.projectId, { change: CHANGE, maxHops: 1 }),
      await postImpact(built.app, built.projectId, { change: CHANGE, maxHops: 3 }),
    ];

    // Assert
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(recorded.calls.map((call) => call.request)).toEqual([
      { projectId: built.projectId, change: CHANGE },
      { projectId: built.projectId, change: CHANGE, maxHops: 1 },
      { projectId: built.projectId, change: CHANGE, maxHops: 3 },
    ]);
    expect(Object.keys(recorded.calls[0]!.request as object).sort()).toEqual(['change', 'projectId']);
    for (const call of recorded.calls) expect(call.options.now()).toEqual(new Date('2026-10-16T12:00:00Z'));
  });
});

/** A UUID of any version, in any letter case. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Every object key at any depth of `value`. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

describe('impact project resolution', () => {
  it('An unknown project answers PROJECT_NOT_FOUND on impact', async () => {
    // Arrange
    const recorded = useCase();
    const built = await impactApp({ impact: recorded.impact });
    const unknownId = randomUUID();

    // Act
    const anchored = await postImpact(built.app, unknownId, { change: CHANGE });
    const unanchored = await postImpact(built.app, unknownId, { change: SMILE.repeat(5) });

    // Assert
    for (const response of [anchored, unanchored]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(errorBody('PROJECT_NOT_FOUND', 'project not found'));
      expect(response.body).not.toContain(unknownId);
    }
    expect(recorded.calls).toHaveLength(0);
  });

  it("forwards the stored project's id, not the id as sent in the path", async () => {
    // Arrange: an upper-case id resolves the project; the use case gets its own id.
    const recorded = useCase();
    const built = await impactApp({ impact: recorded.impact });
    const sent = built.projectId.toUpperCase();

    // Act
    const response = await postImpact(built.app, sent, { change: CHANGE });

    // Assert
    expect(sent).not.toBe(built.projectId);
    expect(response.statusCode).toBe(200);
    expect(recorded.calls.map((call) => (call.request as { projectId: string }).projectId)).toEqual([built.projectId]);
  });
});

describe('impact answered response', () => {
  it('An answered report over the in-memory subset makes no model call', async () => {
    // Arrange: a store that also records the `query_log` writes it receives.
    const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
    const writes: unknown[] = [];
    const recording: StorePort = {
      ...loaded.store,
      saveQueryLog: async (entry) => {
        writes.push(entry);
        return loaded.store.saveQueryLog(entry);
      },
    };
    const built = await impactApp({ deps: { store: recording } });

    // Act
    const response = await postImpact(built.app, loaded.projectIds[0]!, { change: CHANGE });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('answered');
    expect(Object.keys(body)).toEqual(['status', 'direct', 'indirect', 'tests', 'docs', 'history', 'risk']);
    expect(built.llm.calls()).toBe(0);
    expect(built.source.calls()).toBe(0);
    expect(writes).toHaveLength(1);
  });

  it('Fields the use case adds are not sent', async () => {
    // Arrange
    const extra = { fileId: '3f2b8c1e-7a44-4d0e-9b55-0a1b2c3d4e5f' };
    const sha = 'a'.repeat(40);
    const report = {
      status: 'answered',
      direct: [{ symbol: 'DiscountService', file: 'app/Services/DiscountService.php', origin: 'graph', resolution: 'exact', hops: 0, ...extra }],
      indirect: [{ symbol: 'OrderController', file: 'app/Http/OrderController.php', origin: 'graph', resolution: 'heuristic', hops: 2, ...extra }],
      tests: [{ symbol: 'DiscountServiceTest', file: 'tests/DiscountServiceTest.php', origin: 'graph', ...extra }],
      docs: [
        { path: 'docs/pricing.md', stale: true, staleSince: sha, ...extra },
        { path: 'README.md', stale: false, staleSince: sha, ...extra },
      ],
      history: [{ file: 'app/Services/ShippingService.php', coChangeRate: 0.5, prs: [], origin: 'git', ...extra }],
      risk: { level: 'MEDIUM', rationale: 'a rationale', ...extra },
      events: [{ type: 'query_not_logged', code: 'store-write-failed' }],
      usage: { inputTokens: 0 },
    } as unknown as ImpactReport;
    const recorded = useCase(() => report);
    const built = await impactApp({ impact: recorded.impact });

    // Act
    const response = await postImpact(built.app, built.projectId, { change: CHANGE });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body)).toEqual(['status', 'direct', 'indirect', 'tests', 'docs', 'history', 'risk']);
    expect(keysOf(body)).not.toContain('fileId');
    expect(response.body).not.toContain(extra.fileId);
    expect(body).not.toHaveProperty('events');
    expect(body).not.toHaveProperty('usage');
    expect(body.docs).toEqual([
      { path: 'docs/pricing.md', stale: true, staleSince: sha },
      { path: 'README.md', stale: false },
    ]);
    expect(body.history).toEqual([{ file: 'app/Services/ShippingService.php', coChangeRate: 0.5, prs: [], origin: 'git' }]);
    expect(body.direct).toEqual([{ symbol: 'DiscountService', file: 'app/Services/DiscountService.php', origin: 'graph', resolution: 'exact', hops: 0 }]);
    expect(body.indirect).toEqual([{ symbol: 'OrderController', file: 'app/Http/OrderController.php', origin: 'graph', resolution: 'heuristic', hops: 2 }]);
    expect(body.tests).toEqual([{ symbol: 'DiscountServiceTest', file: 'tests/DiscountServiceTest.php', origin: 'graph' }]);
    expect(body.risk).toEqual({ level: 'MEDIUM', rationale: 'a rationale' });
    expect(response.body).not.toMatch(UUID);
  });
});

describe('impact unknown response', () => {
  it('A change without search terms answers unknown', async () => {
    // Arrange
    const built = await impactApp();

    // Act
    const response = await postImpact(built.app, built.projectId, { change: SMILE.repeat(5) });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'unknown', reason: 'no-anchor' });
  });

  it('An unknown report with events sends no events', async () => {
    // Arrange
    const { stream, lines } = logStream();
    const recorded = useCase(() => unknownReport([{ type: 'query_not_logged', code: 'store-write-failed' }]));
    const built = await impactApp({ impact: recorded.impact, logger: { level: 'info', stream } });

    // Act
    const response = await postImpact(built.app, built.projectId, { change: CHANGE });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'unknown', reason: 'no-anchor' });
    const eventLines = lines.filter((line) => line.type === 'query_not_logged');
    expect(eventLines).toHaveLength(1);
    expect(eventLines[0]).toMatchObject({ type: 'query_not_logged', code: 'store-write-failed', level: 30 });
    const incoming = lines.find((line) => line.msg === 'incoming request');
    expect(typeof incoming?.reqId).toBe('string');
    expect(eventLines[0]!.reqId).toBe(incoming!.reqId);
  });
});

describe('impact error answers', () => {
  it('Domain errors of the impact use case map to their answers', async () => {
    // Arrange
    const errors = [new InvalidImpactRequest('maxHops'), new ProjectNotFound(randomUUID())];
    const pending = [...errors];
    const recorded = useCase(() => {
      throw pending.shift();
    });
    const built = await impactApp({ impact: recorded.impact });

    // Act
    const responses = [];
    for (let i = 0; i < errors.length; i++) responses.push(await postImpact(built.app, built.projectId, { change: CHANGE }));

    // Assert
    expect(responses.map((response) => [response.statusCode, response.json()])).toEqual([
      [400, { error: { code: 'INVALID_IMPACT_REQUEST', message: 'invalid request', details: { field: 'maxHops' } } }],
      [404, errorBody('PROJECT_NOT_FOUND', 'project not found')],
    ]);
    responses.forEach((response, i) => expect(response.body).not.toContain(errors[i]!.message));
  });

  it('Another error on impact answers INTERNAL', async () => {
    // Arrange: first the seam rejects, then core's use case over a store whose traversal read rejects.
    const failing = useCase(() => {
      throw new Error('pool failed at 10.0.0.5');
    });
    const first = await impactApp({ impact: failing.impact });
    const firstResponse = await postImpact(first.app, first.projectId, { change: CHANGE });
    await first.app.close();
    app = undefined;
    const loaded = createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] });
    const broken: StorePort = {
      ...loaded.store,
      neighbors: async () => {
        throw new Error('pool failed at 10.0.0.5');
      },
    };
    const second = await impactApp({ deps: { store: broken } });

    // Act
    const secondResponse = await postImpact(second.app, loaded.projectIds[0]!, { change: CHANGE });

    // Assert
    for (const response of [firstResponse, secondResponse]) {
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual(errorBody('INTERNAL', 'unexpected error'));
      expect(response.body).not.toContain('10.0.0.5');
    }
  });

  it('The impact route is rate limited', async () => {
    // Arrange
    const recorded = useCase();
    const built = await impactApp({ impact: recorded.impact, rateLimit: { max: 2, windowMs: 60_000 } });

    // Act
    const responses = [];
    for (let i = 0; i < 3; i++) responses.push(await postImpact(built.app, built.projectId, { change: CHANGE }, '10.0.0.1'));

    // Assert
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 429]);
    expect(responses[2]!.json().error.code).toBe('RATE_LIMITED');
    expect(recorded.calls).toHaveLength(2);
  });
});

describe('impact events', () => {
  it("A report's query_not_logged event is logged", async () => {
    // Arrange
    const { stream, lines } = logStream();
    const recorded = useCase(() => ({
      status: 'answered',
      direct: [],
      indirect: [],
      tests: [],
      docs: [],
      history: [],
      risk: { level: 'LOW', rationale: 'none' },
      events: [{ type: 'query_not_logged', code: 'store-write-failed' }],
    }));
    const built = await impactApp({ impact: recorded.impact, logger: { level: 'info', stream } });
    const change = 'SENTINEL-change-7b2c DiscountService';

    // Act
    const response = await postImpact(built.app, built.projectId, { change });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('events');
    const eventLines = lines.filter((line) => line.type === 'query_not_logged');
    expect(eventLines).toHaveLength(1);
    expect(eventLines[0]).toMatchObject({ code: 'store-write-failed', level: 30, msg: 'impact event' });
    const incoming = lines.find((line) => line.msg === 'incoming request');
    expect(typeof incoming?.reqId).toBe('string');
    expect(eventLines[0]!.reqId).toBe(incoming!.reqId);
    expect(lines.map((line) => JSON.stringify(line)).join('\n')).not.toContain('SENTINEL-change-7b2c');
  });
});

// Below the spec scenarios: boundaries of the impact route (added after the step 5 mutation run, for its
// meaningful survivors: a copied `prs`, the events of a report without any, the messages of the two
// custom rules and the `HIGH` level).
describe('impact route boundaries', () => {
  it('sends the pull requests of a history entry and each risk level', async () => {
    // Arrange
    const reportOf = (level: 'HIGH' | 'MEDIUM' | 'LOW'): ImpactReport => ({
      status: 'answered',
      direct: [],
      indirect: [],
      tests: [],
      docs: [],
      history: [{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24, 33, 55], origin: 'git' }],
      risk: { level, rationale: `rationale ${level}` },
    });
    const levels = ['HIGH', 'MEDIUM', 'LOW'] as const;
    const pending = [...levels];
    const recorded = useCase(() => reportOf(pending.shift()!));
    const built = await impactApp({ impact: recorded.impact });

    // Act
    const responses = [];
    for (let i = 0; i < levels.length; i++) responses.push(await postImpact(built.app, built.projectId, { change: CHANGE }));

    // Assert
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(responses.map((response) => response.json().risk)).toEqual(levels.map((level) => ({ level, rationale: `rationale ${level}` })));
    for (const response of responses) {
      expect(response.json().history).toEqual([{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24, 33, 55], origin: 'git' }]);
    }
  });

  it('logs nothing for a report without events', async () => {
    // Arrange
    const { stream, lines } = logStream();
    const recorded = useCase(() => unknownReport());
    const built = await impactApp({ impact: recorded.impact, logger: { level: 'info', stream } });

    // Act
    const response = await postImpact(built.app, built.projectId, { change: CHANGE });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(lines.filter((line) => line.msg === 'impact event')).toEqual([]);
  });

  it('names what is wrong with a blank change or one holding U+0000', async () => {
    // Arrange
    const built = await impactApp();

    // Act
    const blank = await postImpact(built.app, built.projectId, { change: '       ' });
    const withNul = await postImpact(built.app, built.projectId, { change: 'price\u0000calc' });

    // Assert
    expect(blank.json().error.details.issues).toEqual([{ path: ['change'], code: 'custom', message: 'change must not be only whitespace' }]);
    expect(withNul.json().error.details.issues).toEqual([{ path: ['change'], code: 'custom', message: 'change must not contain U+0000' }]);
  });
});

describe('impact in the OpenAPI document', () => {
  it('The document lists impact with its parameter, body and responses', async () => {
    // Arrange
    const built = await impactApp();

    // Act
    const response = await built.app.inject({ method: 'GET', url: '/docs/json' });

    // Assert
    expect(response.statusCode).toBe(200);
    const operation = response.json().paths['/api/projects/{projectId}/impact'].post;
    const projectId = operation.parameters.find((parameter: { name: string }) => parameter.name === 'projectId');
    expect(projectId).toMatchObject({ in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
    const body = operation.requestBody.content['application/json'].schema;
    expect(body.required).toEqual(['change']);
    expect(body.additionalProperties).toBe(false);
    expect(body.properties.change).toMatchObject({ type: 'string', minLength: 5, maxLength: 500 });
    expect(body.properties.maxHops).toMatchObject({ type: 'integer', minimum: 1, maximum: 3, default: 2 });
    const shapes = operation.responses['200'].content['application/json'].schema.anyOf;
    expect(shapes.map((shape: { properties: object }) => Object.keys(shape.properties).sort())).toEqual(
      expect.arrayContaining([
        ['direct', 'docs', 'history', 'indirect', 'risk', 'status', 'tests'],
        ['reason', 'status'],
      ]),
    );
    expect(shapes).toHaveLength(2);
    expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(['400', '404', '429', '500']));
  });
});
