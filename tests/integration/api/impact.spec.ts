import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import type { StorePort } from '@codemind/core';
import { buildApp } from '../../../packages/api/src/app';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createScriptedLlm } from '../../support/scripted-llm';

// Spec: openspec/changes/http-impact/specs/http-impact/spec.md (DIS-95), the scenarios over the seed.
// Each `it` is the scenario it is named after. As in tests/integration/api/ask.spec.ts, inside the
// harness transaction (reverted when the test ends) the projects named like the seed's are deleted and
// the seed loaded; the app is built with `buildApp` over a store bound to that transaction and driven
// with `inject`. The impact makes no model call and reads no source, so the model and the source tree
// are doubles.

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
const Q2 = 'cambiar los descuentos de DiscountService';
/** A UUID of any version, in any letter case. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const KEYS = ['direct', 'docs', 'history', 'indirect', 'risk', 'status', 'tests'];
const RATIONALE = '10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.';

describeWithDatabase('POST /api/projects/{projectId}/impact over the seed (integration)', () => {
  const db = useTransactionPerTest();
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /** Loads the seed in the harness transaction (deleting only the projects named like the seed's); returns the store and acme-shop's id. */
  async function seeded(): Promise<{ store: StorePort; projectId: string }> {
    const names = seedProjects(SEED).map((project) => project.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    const store = createPostgresStore({ transaction: db() });
    const projectId = (await store.listProjects()).find((project) => project.name === 'acme-shop')!.id;
    return { store, projectId };
  }

  /** The ready app over `store`. */
  async function appOver(store: StorePort): Promise<FastifyInstance> {
    app = await buildApp(
      { store, llm: createScriptedLlm('evaluation').llm, source: createInMemorySourceTree({}).source, now: () => new Date(), workspaceRoot: '/workspace' },
      { rateLimit: { max: 1000, windowMs: 60_000 } },
    );
    await app.ready();
    return app;
  }

  /** The `impact` rows of `query_log` of project `projectId`. */
  async function impactRows(projectId: string): Promise<number> {
    const { rows } = await db().query<{ n: number }>("SELECT count(*)::int AS n FROM query_log WHERE project_id = $1 AND capability = 'impact'", [
      projectId,
    ]);
    return rows[0]!.n;
  }

  it('Q2 answers only the public fields over the seed', async () => {
    // Arrange
    const { store, projectId } = await seeded();
    const target = await appOver(store);
    const before = await impactRows(projectId);

    // Act
    const response = await target.inject({ method: 'POST', url: `/api/projects/${projectId}/impact`, payload: { change: Q2, maxHops: 2 } });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(KEYS);
    expect(body.status).toBe('answered');
    expect(body.direct).toContainEqual(expect.objectContaining({ symbol: 'DiscountService', hops: 0 }));
    expect(body.direct).toContainEqual(expect.objectContaining({ symbol: 'PriceCalculator', hops: 1, resolution: 'exact' }));
    for (const symbol of ['CheckoutController', 'OrderController', 'RecalculateTotals', 'SendOrderConfirmation']) {
      expect(body.indirect).toContainEqual(expect.objectContaining({ symbol, hops: 2, resolution: 'heuristic' }));
    }
    expect(body.tests.map((test: { symbol: string }) => test.symbol)).toEqual(
      expect.arrayContaining(['DiscountServiceTest', 'PriceCalculatorTest', 'OrderPricingTest']),
    );
    for (const entry of [...body.direct, ...body.indirect]) {
      expect(Object.keys(entry).sort()).toEqual(['file', 'hops', 'origin', 'resolution', 'symbol']);
    }
    for (const entry of body.tests) expect(Object.keys(entry).sort()).toEqual(['file', 'origin', 'symbol']);
    for (const entry of [...body.direct, ...body.indirect, ...body.tests]) {
      expect(entry.origin).toBe('graph');
      expect(entry.file).not.toBe('app/Services/ShippingService.php');
    }
    expect(body.docs).toEqual([{ path: 'README.md', stale: false }]);
    expect(body.history).toEqual([{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24, 33, 55], origin: 'git' }]);
    expect(body.risk).toEqual({ level: 'HIGH', rationale: RATIONALE });
    expect(response.body).not.toMatch(UUID);
    for (const key of ['events', 'usage', 'projectId']) expect(response.body).not.toContain(`"${key}"`);
    expect(response.body).not.toContain('descuentos');
    expect((await impactRows(projectId)) - before).toBe(1);
  });

  it('An upper-case project id resolves the same project on impact', async () => {
    // Arrange
    const { store, projectId } = await seeded();
    const target = await appOver(store);
    const send = (id: string) => target.inject({ method: 'POST', url: `/api/projects/${id}/impact`, payload: { change: Q2 } });

    // Act
    const lower = await send(projectId);
    const upper = await send(projectId.toUpperCase());

    // Assert
    expect(projectId.toUpperCase()).not.toBe(projectId);
    expect(upper.statusCode).toBe(200);
    expect(upper.json().status).toBe('answered');
    expect(upper.json()).toEqual(lower.json());
  });
});
