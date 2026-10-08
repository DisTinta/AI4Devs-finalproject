import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One input of a fingerprint: a repository-relative path (or a synthetic `deps:` entry) and its content. */
export interface FingerprintInput {
  /** Repository-relative path with `/` separators, or `deps:<name>@<version>`. */
  path: string;
  /** Content; empty for a synthetic entry. */
  content: string;
}

/** The inputs of the two header fingerprints (DIS-91 design D6). */
export interface FingerprintInputs {
  /** Everything that produces the seed's rows, plus the resolved parser versions. */
  analyzer: FingerprintInput[];
  /** The analyzer port and the `.up.sql` migrations. */
  contract: FingerprintInput[];
}

/**
 * Directories whose every file feeds the analyzer fingerprint: everything that produces the seed's
 * rows — the analyzer, the indexing core, the history and store adapters, the seed renderer and the
 * sample fixture with its history manifest (DIS-91 design D4). Paths with a `.git` segment are skipped
 * (`fixtures/acme-shop/.git` exists after the history rebuild).
 */
const ANALYZER_DIRECTORIES = [
  'packages/analyzers/php/src',
  'packages/core/src/index',
  'packages/core/src/knowledge',
  'packages/cli/src/seed',
  'packages/adapters/git/src',
  'packages/adapters/store-postgres/src',
  'fixtures/history',
  'fixtures/acme-shop',
];

/** Single files that feed the analyzer fingerprint, for the same reason. */
const ANALYZER_FILES = ['packages/cli/src/seed-build.ts', 'packages/cli/src/compose-index.ts', 'fixtures/build-history.mjs'];

/** Parser packages whose resolved version feeds the analyzer fingerprint. */
const PARSER_DEPENDENCIES = ['tree-sitter-php', 'web-tree-sitter'];

const ANALYZER_PORT = 'packages/core/src/ports/AnalyzerPort.ts';
const MIGRATIONS_DIRECTORY = 'packages/adapters/store-postgres/migrations';

/**
 * SHA-256 of `inputs`, independent of their order and of line endings: inputs sorted by path (code
 * unit order), each hashed as its path, NUL, its content with CRLF turned into LF, NUL.
 *
 * @param inputs The inputs.
 * @returns `sha256:<64 lowercase hex>`.
 */
export function fingerprint(inputs: FingerprintInput[]): string {
  const hash = createHash('sha256');
  const sorted = [...inputs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const input of sorted) {
    hash.update(input.path, 'utf8').update('\0').update(input.content.replace(/\r\n/g, '\n'), 'utf8').update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Reads the fingerprint inputs from the working tree at `repoRoot`. Analyzer: everything that produces
 * the seed's rows — every file under the analyzer directories (skipping any `.git` entry) and the
 * analyzer files — plus one `deps:<name>@<version>` entry per parser dependency resolved in
 * `package-lock.json`. Contract: the analyzer port and every `.up.sql` migration. Each list is sorted
 * by path.
 *
 * @param repoRoot The repository root.
 * @returns The analyzer and contract inputs.
 * @throws Error when `package-lock.json` does not resolve a parser dependency, or a file cannot be read.
 */
export function collectFingerprintInputs(repoRoot: string): FingerprintInputs {
  const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, { version?: string }>;
  };
  const deps = PARSER_DEPENDENCIES.map((name) => {
    const version = lock.packages?.[`node_modules/${name}`]?.version;
    if (version === undefined) throw new Error(`fingerprint: package-lock.json does not resolve ${name}`);
    return { path: `deps:${name}@${version}`, content: '' };
  });
  const analyzer = [
    ...deps,
    ...ANALYZER_DIRECTORIES.flatMap((directory) => filesUnder(repoRoot, directory)),
    ...ANALYZER_FILES.map((path) => read(repoRoot, path)),
  ];
  const migrations = readdirSync(join(repoRoot, MIGRATIONS_DIRECTORY))
    .filter((name) => name.endsWith('.up.sql'))
    .map((name) => read(repoRoot, `${MIGRATIONS_DIRECTORY}/${name}`));
  const contract = [read(repoRoot, ANALYZER_PORT), ...migrations];
  return { analyzer: sortByPath(analyzer), contract: sortByPath(contract) };
}

/** Every file under `directory`, recursively (no `recursive` option: `Dirent.parentPath` needs Node 20.12). */
function filesUnder(repoRoot: string, directory: string): FingerprintInput[] {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git') return [];
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(repoRoot, path);
    return entry.isFile() ? [read(repoRoot, path)] : [];
  });
}

function read(repoRoot: string, path: string): FingerprintInput {
  return { path, content: readFileSync(join(repoRoot, path), 'utf8') };
}

function sortByPath(inputs: FingerprintInput[]): FingerprintInput[] {
  return inputs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
