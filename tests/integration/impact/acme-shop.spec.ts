import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createPostgresStore, loadSeed } from '@codemind/adapter-store-postgres';
import { impact } from '@codemind/core';
import type { ImpactReport } from '@codemind/core';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';

// Spec: openspec/changes/impact-graph/specs/impact/spec.md (DIS-89) → "Impact over the indexed
// acme-shop seed". Each `it` is the scenario it is named after. The seed is loaded inside the harness
// transaction, deleting only the projects named like the seed's (the scoped pattern of
// tests/integration/api/ask.spec.ts, DIS-110 design D3); the transaction is reverted when the test ends,
// and with it the `query_log` row every `impact` call writes since DIS-90 (spec
// openspec/changes/impact-risk-cli/specs/impact/spec.md, which the last two tests follow).

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
const Q2 = 'cambiar los descuentos de DiscountService';

describeWithDatabase('impact over the acme-shop seed (integration)', () => {
  const db = useTransactionPerTest();

  /** The seed loaded into the harness transaction, and acme-shop's store and id. */
  async function loaded(): Promise<{ store: ReturnType<typeof createPostgresStore>; projectId: string }> {
    const names = seedProjects(SEED).map((project) => project.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    const store = createPostgresStore({ transaction: db() });
    const projectId = (await store.listProjects()).find((project) => project.name === 'acme-shop')!.id;
    return { store, projectId };
  }

  /** The report of `Q2` over the seed with `maxHops`, answered. */
  async function q2(maxHops: number): Promise<Extract<ImpactReport, { status: 'answered' }>> {
    const { store, projectId } = await loaded();
    const report = await impact(store, { projectId, change: Q2, maxHops });
    if (report.status !== 'answered') throw new Error(`expected an answered report, got ${report.reason}`);
    return report;
  }

  it('Q2 is reproduced over the seed', async () => {
    // Arrange / Act
    const report = await q2(2);

    // Assert
    expect(report.status).toBe('answered');
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'DiscountService', hops: 0 }));
    expect(report.direct).toContainEqual(expect.objectContaining({ symbol: 'PriceCalculator', hops: 1, resolution: 'exact' }));
    for (const symbol of ['CheckoutController', 'OrderController', 'RecalculateTotals', 'SendOrderConfirmation']) {
      expect(report.indirect).toContainEqual(expect.objectContaining({ symbol, hops: 2, resolution: 'heuristic' }));
    }
    expect(report.tests.map((test) => test.symbol)).toEqual(
      expect.arrayContaining(['DiscountServiceTest', 'PriceCalculatorTest', 'OrderPricingTest']),
    );
    expect(report.indirect.map((entry) => entry.symbol)).not.toContain('OrderObserver');
    const every = [...report.direct, ...report.indirect, ...report.tests];
    expect(every.every((entry) => entry.origin === 'graph')).toBe(true);
    // The files of kind `test`, read from the loaded seed rather than guessed from the path (task 12.6.2).
    const { rows } = await db().query<{ path: string }>(
      "SELECT f.path FROM file f JOIN project p ON p.id = f.project_id WHERE p.name = 'acme-shop' AND f.kind = 'test'",
    );
    const testFiles = new Set(rows.map((row) => row.path));
    expect(testFiles.size).toBeGreaterThan(0);
    expect([...report.direct, ...report.indirect].filter((entry) => testFiles.has(entry.file))).toEqual([]);
  });

  it('A dependant three hops away needs three hops', async () => {
    // Arrange / Act
    const report = await q2(3);

    // Assert
    expect(report.indirect).toContainEqual(expect.objectContaining({ symbol: 'OrderObserver', hops: 3 }));
  });

  // Spec: openspec/changes/impact-risk-cli/specs/impact/spec.md (DIS-90).
  it('Q2 over the seed is high risk', async () => {
    // Arrange / Act
    const report = await q2(2);

    // Assert
    expect(report.risk.level).toBe('HIGH');
    expect(report.risk.rationale).toBe(
      '10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.',
    );
  });

  it('An impact call over the seed writes its row', async () => {
    // Arrange
    const { store, projectId } = await loaded();
    const count = async (): Promise<number> =>
      Number(
        (
          await db().query<{ n: string }>(
            "SELECT count(*) AS n FROM query_log q JOIN project p ON p.id = q.project_id WHERE p.name = 'acme-shop' AND q.capability = 'impact'",
          )
        ).rows[0].n,
      );
    const before = await count();

    // Act
    await impact(store, { projectId, change: Q2, maxHops: 2 });

    // Assert
    expect(await count()).toBe(before + 1);
    const { rows } = await db().query<{ question: string; cost_usd: string; latency_ms: number }>(
      "SELECT q.question, q.cost_usd, q.latency_ms FROM query_log q JOIN project p ON p.id = q.project_id WHERE p.name = 'acme-shop' AND q.capability = 'impact'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe(Q2);
    expect(Number(rows[0].cost_usd)).toBe(0);
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(1);
  });
});
