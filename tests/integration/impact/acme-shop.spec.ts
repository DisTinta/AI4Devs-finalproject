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
// and `impact` writes nothing.

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
const Q2 = 'cambiar los descuentos de DiscountService';

describeWithDatabase('impact over the acme-shop seed (integration)', () => {
  const db = useTransactionPerTest();

  /** The report of `Q2` over the seed with `maxHops`, answered. */
  async function q2(maxHops: number): Promise<Extract<ImpactReport, { status: 'answered' }>> {
    const names = seedProjects(SEED).map((project) => project.name);
    await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);
    await loadSeed(db(), { sql: SEED, projectNames: names });
    const store = createPostgresStore({ transaction: db() });
    const projectId = (await store.listProjects()).find((project) => project.name === 'acme-shop')!.id;
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
});
