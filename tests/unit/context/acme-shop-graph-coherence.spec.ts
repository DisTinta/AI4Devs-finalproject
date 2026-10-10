import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EdgeEndpoint } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from '../../support/acme-shop-graph';

// Not a scenario: the acme-shop subset of the Context Engine tests must stay a copy of the real
// index (DIS-27 design D7). Every file, symbol and edge of the subset must be a row of
// seeds/graph-dump.sql with the same values, so regenerating the seed with other values fails here.

type Row = Map<string, string | null>;

/** The `INSERT INTO <table>` rows of the seed, each as column → literal (`null` for `NULL`). */
function seedRows(sql: string, table: string): Row[] {
  const rows: Row[] = [];
  const pattern = new RegExp(`^INSERT INTO ${table} \\(([^)]*)\\) VALUES \\((.*)\\);$`);
  for (const line of sql.split('\n')) {
    const match = pattern.exec(line);
    if (match === null) continue;
    const columns = match[1].split(', ');
    const values = [...match[2].matchAll(/'((?:[^']|'')*)'|(NULL)|([^,\s]+)/g)].map((value) =>
      value[2] === 'NULL' ? null : (value[1]?.replace(/''/g, "'") ?? value[3]),
    );
    rows.push(new Map(columns.map((column, i) => [column, values[i]])));
  }
  return rows;
}

/** The acme-shop part of the seed, keyed the way the subset names things. */
function seedIndex(): { project: Row; files: Set<string>; symbols: Set<string>; edges: Set<string> } {
  const sql = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
  const project = seedRows(sql, 'project').find((row) => row.get('name') === ACME_SHOP_PROJECT.name) as Row;
  const projectId = project.get('id');
  const pathOf = new Map(
    seedRows(sql, 'file')
      .filter((row) => row.get('project_id') === projectId)
      .map((row) => [row.get('id'), row]),
  );
  const symbolOf = new Map(
    seedRows(sql, 'symbol')
      .filter((row) => pathOf.has(row.get('file_id')))
      .map((row) => [row.get('id'), row]),
  );
  const symbolKey = (row: Row): string =>
    [pathOf.get(row.get('file_id'))?.get('path'), row.get('name'), row.get('start_line')].join('|');
  const endpoint = (row: Row, side: 'source' | 'target'): string => {
    const symbolId = row.get(`${side}_symbol_id`);
    return symbolId === null
      ? `file:${pathOf.get(row.get(`${side}_file_id`))?.get('path')}`
      : `symbol:${symbolKey(symbolOf.get(symbolId) as Row)}`;
  };
  return {
    project,
    files: new Set(
      [...pathOf.values()].map((row) => [row.get('path'), row.get('kind'), row.get('loc')].join('|')),
    ),
    symbols: new Set(
      [...symbolOf.values()].map((row) =>
        [symbolKey(row), row.get('kind'), row.get('end_line'), row.get('signature')].join('|'),
      ),
    ),
    edges: new Set(
      seedRows(sql, 'edge')
        .filter((row) => row.get('project_id') === projectId)
        .map((row) =>
          [
            endpoint(row, 'source'),
            endpoint(row, 'target'),
            row.get('kind'),
            row.get('resolution'),
            row.get('extractor'),
            row.get('weight'),
          ].join('|'),
        ),
    ),
  };
}

/** An edge endpoint of the subset, keyed as `seedIndex` keys it. */
function endpointKey(endpoint: EdgeEndpoint): string {
  return endpoint.symbol === undefined
    ? `file:${endpoint.file}`
    : `symbol:${[endpoint.symbol.file, endpoint.symbol.name, endpoint.symbol.startLine].join('|')}`;
}

describe('acme-shop test subset', () => {
  it('Every file, symbol and edge of the subset is a row of the seed', () => {
    // Arrange
    const seed = seedIndex();
    const graph = acmeShopGraph();

    // Act
    const files = graph.files.map((f) => [f.path, f.kind, String(f.loc)].join('|'));
    const symbols = graph.symbols.map((s) =>
      [s.file, s.name, s.startLine, s.kind, s.endLine, s.signature ?? null].join('|'),
    );
    const edges = graph.edges.map((e) =>
      [endpointKey(e.source), endpointKey(e.target), e.kind, e.resolution, e.extractor, e.weight ?? null].join('|'),
    );

    // Assert
    expect([seed.project.get('root_path'), seed.project.get('language'), seed.project.get('framework')]).toEqual([
      ACME_SHOP_PROJECT.rootPath,
      ACME_SHOP_PROJECT.language,
      ACME_SHOP_PROJECT.framework,
    ]);
    expect(files.filter((f) => !seed.files.has(f))).toEqual([]);
    expect(symbols.filter((s) => !seed.symbols.has(s))).toEqual([]);
    expect(edges.filter((e) => !seed.edges.has(e))).toEqual([]);
    // The co-change scenario relies on these two being in the subset.
    expect(symbols.some((s) => s.startsWith('app/Services/DiscountService.php|DiscountService|'))).toBe(true);
    expect(edges).toContain(
      'file:app/Services/DiscountService.php|file:app/Services/ShippingService.php|co_changed|heuristic|git|1',
    );
  });
});
