import { collectFingerprintInputs, fingerprint } from '../seed/fingerprint.js';

// The seed header and project rows as `cache:build` (DIS-26) and `verify` (DIS-44) read them: the two
// fingerprints of the header, the ones the seed build computes now, and a project's indexed commit.
// Kept outside `packages/cli/src/seed/`, whose files are inputs of the seed fingerprint.

/** The header fingerprints of a seed, or the ones the current code computes. */
export interface SeedFingerprints {
  /** The analyzer fingerprint. */
  analyzer: string;
  /** The contract fingerprint. */
  contract: string;
}

/**
 * The two fingerprints of a seed's header (its leading `--` lines).
 *
 * @param sql The seed's SQL.
 * @returns The pair, or `undefined` when one is missing.
 */
export function headerFingerprints(sql: string): SeedFingerprints | undefined {
  const header: string[] = [];
  for (const line of sql.split('\n')) {
    if (!line.startsWith('--')) break;
    header.push(line.trimEnd());
  }
  const value = (name: string): string | undefined =>
    header.find((line) => line.startsWith(`-- ${name}: `))?.slice(`-- ${name}: `.length);
  const analyzer = value('analyzer-fingerprint');
  const contract = value('contract-fingerprint');
  return analyzer === undefined || contract === undefined ? undefined : { analyzer, contract };
}

/**
 * The `indexed_commit` of the project named `name` in the seed's `INSERT INTO project` statements, as
 * `renderSeedDump` writes them (explicit columns, literal values).
 *
 * @param sql The seed's SQL.
 * @param name The project's name.
 * @returns The commit, or `undefined` when the project is absent or has none.
 */
export function indexedCommitOf(sql: string, name: string): string | undefined {
  for (const line of sql.split('\n')) {
    const match = /^INSERT INTO project \(([^)]*)\) VALUES \((.*)\);\s*$/.exec(line);
    if (match === null) continue;
    const columns = match[1].split(',').map((column) => column.trim());
    const values = literals(match[2]);
    const row = new Map(columns.map((column, i) => [column, values[i]]));
    if (row.get('name') === name) return row.get('indexed_commit') ?? undefined;
  }
  return undefined;
}

/** The values of a `VALUES (…)` list: quoted strings unquoted (`''` → `'`), anything else as written; `NULL` as `null`. */
function literals(list: string): Array<string | null> {
  const values: Array<string | null> = [];
  const pattern = /\s*(?:E?'((?:[^']|'')*)'|([^,]+?))\s*(?:,|$)/gy;
  let match: RegExpExecArray | null;
  while (pattern.lastIndex < list.length && (match = pattern.exec(list)) !== null) {
    if (match[1] !== undefined) values.push(match[1].replace(/''/g, "'"));
    else values.push(match[2] === 'NULL' ? null : match[2]);
  }
  return values;
}

/**
 * The fingerprints the seed build would write now.
 *
 * @param repoRoot The repository root.
 * @returns The analyzer and contract fingerprints of the code at `repoRoot`.
 */
export function currentSeedFingerprints(repoRoot: string): SeedFingerprints {
  const inputs = collectFingerprintInputs(repoRoot);
  return { analyzer: fingerprint(inputs.analyzer), contract: fingerprint(inputs.contract) };
}
