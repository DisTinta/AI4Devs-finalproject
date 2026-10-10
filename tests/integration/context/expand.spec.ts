import { expect, it } from 'vitest';
import { expand } from '@codemind/core';
import type { NewProject, StorePort } from '@codemind/core';
import { createPostgresStore } from '../../../packages/adapters/store-postgres/src/index';
import { describeWithDatabase, useTransactionPerTest } from '../helpers/db';
import { unique } from '../helpers/factories';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';

// Spec: openspec/changes/context-engine-anchor-expand/specs/context-engine/spec.md → "Graph expansion
// of the anchor", scenario "The expansion never leaves the project". It runs against Postgres because
// the guard is the traversal statement's project filter, which the in-memory double cannot break
// (verify-against-spec, DIS-27). Edges between the two projects, which the graph writer never
// produces, are inserted directly so that a missing filter would show.

describeWithDatabase('Context Engine expansion over Postgres (DIS-27)', () => {
  const db = useTransactionPerTest();

  /** A project input for the acme-shop subset, with a unique name. */
  function acmeProject(): NewProject {
    return { ...ACME_SHOP_PROJECT, name: unique('acme-shop'), isSample: false };
  }

  /** Creates a project holding the acme-shop subset and returns its id. */
  async function acmeShop(store: StorePort): Promise<string> {
    const projectId = await store.createProject(acmeProject());
    await store.saveGraph(projectId, acmeShopGraph());
    return projectId;
  }

  /** The id of the project's file at `path`. */
  async function fileId(projectId: string, path: string): Promise<string> {
    const { rows } = await db().query<{ id: string }>('SELECT id FROM file WHERE project_id = $1 AND path = $2', [
      projectId,
      path,
    ]);
    return rows[0].id;
  }

  it('The expansion never leaves the project', async () => {
    // Arrange
    const store = createPostgresStore({ transaction: db() });
    const first = await acmeShop(store);
    const second = await acmeShop(store);
    const anchors = (await store.findSymbols(first, 'PriceCalculator')).filter(
      (s) => s.name === 'PriceCalculator' || s.name === 'PriceCalculator::compute',
    );
    const [foreignSymbol] = (await store.findSymbols(second, 'TaxService::taxFor')).filter(
      (s) => s.name === 'TaxService::taxFor',
    );
    const firstFile = await fileId(first, 'app/Services/PriceCalculator.php');
    const foreignFile = await fileId(second, 'README.md');
    // Edges of the first project that touch the second project's nodes, from and to the anchor.
    await db().query(
      `INSERT INTO edge (project_id, source_file_id, source_symbol_id, target_symbol_id, target_file_id, kind, resolution, extractor)
       VALUES ($1, $2, NULL, $3, NULL, 'calls', 'exact', 'test-extractor'),
              ($1, $4, NULL, NULL, $2, 'co_changed', 'heuristic', 'test-extractor'),
              ($1, NULL, $5, $6, NULL, 'calls', 'exact', 'test-extractor')`,
      [first, firstFile, foreignSymbol.id, foreignFile, foreignSymbol.id, anchors[0].id],
    );

    // Act
    const neighbors = await expand(store, first, anchors, 3);

    // Assert
    expect(neighbors.length).toBeGreaterThan(0);
    const { rows } = await db().query<{ id: string }>(
      `SELECT id FROM file WHERE project_id = $1
       UNION ALL SELECT s.id FROM symbol s JOIN file f ON f.id = s.file_id WHERE f.project_id = $1`,
      [first],
    );
    const ownIds = new Set(rows.map((row) => row.id));
    expect(neighbors.filter((n) => !ownIds.has(n.id))).toEqual([]);
  });
});
