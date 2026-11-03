import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { sha256 } from '../../../scripts/annotation-agreement.mjs';
import {
  calledNames,
  checkAnnotations,
  formatAgreement,
  formatRatio,
  measure,
  readSeed,
  runMeasureGraph,
  type Seed,
  type SiteInput,
} from '../../../scripts/measure-graph.mjs';

// Spec: openspec/changes/graph-quality-measurement/specs/graph-quality/spec.md (DIS-79 design D5, D9).
// Each test is one scenario, named after it. The CLI tests run on a temporary copy of the repository
// inputs under os.tmpdir(), never on the repository itself.

const REPOSITORY = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const USAGE = 'Usage: node scripts/measure-graph.mjs [--root <dir>]';
const REPORT = 'docs/measurements/annotation-agreement.md';
const SEED = 'seeds/graph-dump.sql';
const OUTPUT = 'docs/measurements/graph-quality.json';
const TS_ANNOTATIONS = 'fixtures/annotations/task-api.callsites.json';
const INPUT_FILES = [
  REPORT,
  'docs/measurements/annotation/acme-shop.sites.json',
  'docs/measurements/annotation/task-api.sites.json',
  'docs/measurements/annotation/control.json',
  'docs/measurements/annotation/panelist-1.json',
  'docs/measurements/annotation/panelist-2.json',
  'docs/measurements/annotation/resolution.json',
  'docs/measurements/annotation/agreement.json',
  'fixtures/annotations/acme-shop.callsites.json',
  TS_ANNOTATIONS,
  SEED,
];

const copies: string[] = [];

afterEach(() => {
  for (const copy of copies.splice(0)) rmSync(copy, { recursive: true, force: true });
});

/** A temporary copy of the files the script reads (design D9). */
function makeCopy(): string {
  const root = mkdtempSync(join(tmpdir(), 'measure-graph-'));
  copies.push(root);
  for (const path of INPUT_FILES) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(REPOSITORY, path), join(root, path));
  }
  return root;
}

/** Stream doubles that collect what is written. */
function streams() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: { write: (chunk: string) => out.push(chunk) },
    stderr: { write: (chunk: string) => err.push(chunk) },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

describe('Measurement output and CLI', () => {
  it('An unknown argument is a usage error', () => {
    // Arrange
    const root = makeCopy();
    const cases = [['--verbose'], ['--root'], ['--root', 'a', '--root', 'b']];

    for (const args of cases) {
      // Act
      const io = streams();
      const code = runMeasureGraph(args, { root, stdout: io.stdout, stderr: io.stderr });

      // Assert
      expect(code, args.join(' ')).toBe(2);
      expect(io.err()).toBe(`${USAGE}\n`);
      expect(io.out()).toBe('');
      expect(existsSync(join(root, OUTPUT))).toBe(false);
    }
  });
});

describe('Freeze check before measuring', () => {
  it('A frozen annotation file was modified', () => {
    // Arrange: one space appended to a frozen file, and a seed that cannot be parsed
    const root = makeCopy();
    writeFileSync(join(root, TS_ANNOTATIONS), `${readFileSync(join(root, TS_ANNOTATIONS), 'utf8')} `);
    writeFileSync(join(root, SEED), 'INSERT INTO edge (id) VALUES (\n');
    const io = streams();

    // Act
    const code = runMeasureGraph([], { root, stdout: io.stdout, stderr: io.stderr });

    // Assert
    expect(code).toBe(1);
    const lines = io.err().trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(TS_ANNOTATIONS);
    expect(io.err()).not.toContain(SEED);
    expect(existsSync(join(root, OUTPUT))).toBe(false);
  });

  it('The agreement report is missing', () => {
    // Arrange: a copy without the report, and a copy whose report has no hash table
    const missing = makeCopy();
    rmSync(join(missing, REPORT));
    const noHashes = makeCopy();
    writeFileSync(join(noHashes, REPORT), '# Informe\n\nSin tabla de hashes.\n');

    // Act
    const first = streams();
    const firstCode = runMeasureGraph([], { root: missing, stdout: first.stdout, stderr: first.stderr });
    const second = streams();
    const secondCode = runMeasureGraph([], { root: noHashes, stdout: second.stdout, stderr: second.stderr });

    // Assert
    expect(firstCode).toBe(1);
    expect(first.err()).toContain(REPORT);
    expect(existsSync(join(missing, OUTPUT))).toBe(false);
    expect(secondCode).toBe(1);
    const lines = second.err().trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.startsWith(`${REPORT}: `)).toBe(true);
    expect(existsSync(join(noHashes, OUTPUT))).toBe(false);
  });
});

const ACME = 'fixtures/annotations/acme-shop.callsites.json';

/** An annotation text with `count` sites of ids `s1…`, in format `formatVersion`. */
function annotationText(count: number, formatVersion = 1, ids?: string[]): string {
  const sites = Array.from({ length: count }, (_, index) => ({ id: ids?.[index] ?? `s${index + 1}` }));
  return JSON.stringify({ fixture: 'acme-shop', language: 'php', formatVersion, sites });
}

/** Rewrites a copy's file and the hash the copy's report records for it, so the freeze check passes. */
function rewriteFrozen(root: string, path: string, text: string): void {
  const old = sha256(readFileSync(join(root, path)));
  writeFileSync(join(root, path), text);
  const report = readFileSync(join(root, REPORT), 'utf8');
  writeFileSync(join(root, REPORT), report.replace(old, sha256(text)));
}

describe('Annotation files are complete', () => {
  it('An annotation file has 49 sites', () => {
    // Act
    const short = checkAnnotations('acme-shop', annotationText(49));
    const version = checkAnnotations('acme-shop', annotationText(50, 2));
    const repeated = checkAnnotations('acme-shop', annotationText(50, 1, ['s1', 's1', ...Array.from({ length: 48 }, (_, i) => `t${i}`)]));
    const notJson = checkAnnotations('acme-shop', '{ not json');
    const complete = checkAnnotations('acme-shop', annotationText(50));

    // Assert
    expect(short).toHaveLength(1);
    expect(short[0]).toContain(ACME);
    expect(short[0]).toContain('49');
    for (const problems of [version, repeated, notJson]) {
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(ACME);
    }
    expect(complete).toEqual([]);
  });

  it('An annotation file has 49 sites through the CLI', () => {
    // Arrange: the copy's acme-shop file loses one site and its report row gets the new hash
    const root = makeCopy();
    const data = JSON.parse(readFileSync(join(root, ACME), 'utf8')) as { sites: unknown[] };
    data.sites.pop();
    rewriteFrozen(root, ACME, `${JSON.stringify(data, null, 2)}\n`);
    const io = streams();

    // Act
    const code = runMeasureGraph([], { root, stdout: io.stdout, stderr: io.stderr });

    // Assert
    expect(code).toBe(1);
    expect(io.err()).toContain(ACME);
    expect(io.err()).toContain('49');
    expect(existsSync(join(root, OUTPUT))).toBe(false);
  });
});

/** One `project` line of the seed. */
function projectLine(id: string, name: string): string {
  return `INSERT INTO project (id, name, root_path, language, framework, is_sample) VALUES ('${id}', ${name}, 'x', 'php', NULL, true);`;
}

describe('The graph is read from the seed', () => {
  it("The seed reader agrees with the CLI's seed parser", () => {
    // Arrange
    const sql = readFileSync(join(REPOSITORY, SEED), 'utf8');

    // Act
    const seed = readSeed(sql);

    // Assert
    const expected = seedProjects(sql);
    expect(seed.projects.map((project) => [project.name, project.edgeCount])).toEqual(
      expected.map((project) => [project.name, project.edgeCount]),
    );
    expect(seed.projects.length).toBeGreaterThan(1);
    const header = /^-- analyzer-fingerprint: (.+)$/m.exec(sql);
    expect(seed.analyzerFingerprint).toBe(header?.[1]);
  });

  it('The seed reader reads E-strings, escapes and NULL as the CLI parser does', () => {
    // Arrange: an E'…' literal with a doubled backslash, an accent and a \u escape
    const sql = [
      '-- analyzer-fingerprint: sha256:abc',
      projectLine('p1', "E'a\\\\b é\\u0041 it''s'"),
    ].join('\n');

    // Act
    const seed = readSeed(sql);

    // Assert
    expect(seed.projects[0]?.name).toBe(seedProjects(sql)[0]?.name);
    expect(seed.projects[0]?.name).toBe("a\\b éA it's");
  });

  it('An edge row naming no project is a malformed line', () => {
    // Arrange
    const sql = [
      projectLine('p1', "'one'"),
      "INSERT INTO edge (id, project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id, kind, resolution, extractor, weight) VALUES ('e1', 'nope', NULL, NULL, NULL, NULL, 'calls', 'exact', 'x', NULL);",
    ].join('\n');

    // Act
    const read = () => readSeed(sql);

    // Assert
    expect(read).toThrow('seeds/graph-dump.sql:2');
  });

  it('A project of the annotations is not in the seed', () => {
    // Arrange: the copy's seed without any row of task-api
    const root = makeCopy();
    const lines = readFileSync(join(root, SEED), 'utf8').split('\n');
    const id = /'([^']+)', 'task-api'/.exec(lines.find((line) => line.startsWith('INSERT INTO project') && line.includes("'task-api'")) ?? '')?.[1] ?? '';
    const fileIds = lines
      .filter((line) => line.startsWith('INSERT INTO file (') && line.includes(`'${id}'`))
      .map((line) => /VALUES \('([^']+)'/.exec(line)?.[1] ?? '');
    const kept = lines.filter((line) => {
      if (/^INSERT INTO (project|file|edge) /.test(line)) return !line.includes(`'${id}'`);
      if (/^INSERT INTO (symbol|file_commit) /.test(line)) return !fileIds.some((fileId) => line.includes(`'${fileId}'`));
      return true;
    });
    writeFileSync(join(root, SEED), kept.join('\n'));
    const io = streams();

    // Act
    const code = runMeasureGraph([], { root, stdout: io.stdout, stderr: io.stderr });

    // Assert
    expect(id).not.toBe('');
    expect(code).toBe(1);
    expect(io.err()).toContain('task-api');
    expect(existsSync(join(root, OUTPUT))).toBe(false);
  });

  it('A malformed seed line is an error', () => {
    // Arrange: one edge line truncated before `);`
    const root = makeCopy();
    const lines = readFileSync(join(root, SEED), 'utf8').split('\n');
    const index = lines.findIndex((line) => line.startsWith('INSERT INTO edge '));
    lines[index] = (lines[index] ?? '').replace(/\);$/, '');
    writeFileSync(join(root, SEED), lines.join('\n'));
    const io = streams();
    const missing = makeCopy();
    rmSync(join(missing, SEED));
    const none = streams();

    // Act
    const code = runMeasureGraph([], { root, stdout: io.stdout, stderr: io.stderr });
    const missingCode = runMeasureGraph([], { root: missing, stdout: none.stdout, stderr: none.stderr });

    // Assert
    expect(code).toBe(1);
    expect(io.err().trimEnd().split('\n')).toEqual([expect.stringContaining(`${SEED}:${index + 1}`)]);
    expect(existsSync(join(root, OUTPUT))).toBe(false);
    expect(missingCode).toBe(1);
    expect(none.err()).toBe(`${SEED}: the file cannot be read\n`);
    expect(existsSync(join(missing, OUTPUT))).toBe(false);
  });
});

// ---- matching, attribution and measures on synthetic in-memory graphs (design D3, D4) ----

interface SymbolSpec {
  file: string;
  name: string;
  start: number;
  end: number;
}
interface EdgeSpec {
  from: { symbol: string } | { file: string };
  to: string;
  resolution?: string;
  kind?: string;
  project?: string;
}

/** A synthetic seed of the project `proj` (and an empty `other`): symbols by `<file>#<name>`, edges by those keys. */
function buildSeed(symbols: SymbolSpec[], edges: EdgeSpec[]): Seed {
  const key = (file: string, name: string) => `${file}#${name}`;
  const files = [...new Set(symbols.map((symbol) => symbol.file))];
  return {
    analyzerFingerprint: 'sha256:test',
    projects: [
      { id: 'p1', name: 'proj', language: 'php', edgeCount: edges.length },
      { id: 'p2', name: 'other', language: 'php', edgeCount: 0 },
    ],
    files: files.map((path) => ({ id: path, projectId: 'p1', path })),
    symbols: symbols.map((symbol) => ({
      id: key(symbol.file, symbol.name),
      fileId: symbol.file,
      name: symbol.name,
      startLine: symbol.start,
      endLine: symbol.end,
    })),
    edges: edges.map((edge, index) => ({
      id: `e${index + 1}`,
      projectId: edge.project ?? 'p1',
      sourceSymbolId: 'symbol' in edge.from ? edge.from.symbol : null,
      sourceFileId: 'file' in edge.from ? edge.from.file : null,
      targetSymbolId: edge.to,
      targetFileId: null,
      kind: edge.kind ?? 'calls',
      resolution: edge.resolution ?? 'exact',
      extractor: 'test',
    })),
  };
}

/** A site of the synthetic project; `target` is `<file>#<symbol>` or `null` for a `none` site. */
function siteOf(id: string, file: string, line: number, call: string, expected: string, target: string | null, form = 'call'): SiteInput {
  const [targetFile = '', targetSymbol = ''] = (target ?? '').split('#');
  return {
    id,
    site: { file, line },
    form,
    call,
    expected,
    target: target === null ? null : { file: targetFile, symbol: targetSymbol },
  };
}

/** Measures one synthetic project and returns it. */
function measureOne(seed: Seed, sites: SiteInput[], language = 'php') {
  const result = measure({ seed, annotations: [{ fixture: 'proj', language, sites }] });
  const project = result.projects[0];
  if (project === undefined) throw new Error('no project measured');
  return project;
}

const A_RUN: SymbolSpec = { file: 'a.php', name: 'A::run', start: 20, end: 40 };
const B_M: SymbolSpec = { file: 'b.php', name: 'B::m', start: 1, end: 5 };

describe('Site matching and attribution', () => {
  it('An edge from the enclosing symbol to the annotated target is a hit', () => {
    // Arrange
    const seed = buildSeed([A_RUN, B_M], [{ from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m' }]);

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, '$b->m(', 'exact', 'b.php#B::m')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('tp');
    expect(project.sites[0]?.hit).toEqual({ resolution: 'exact', extractor: 'test' });
  });

  it("An edge from the site's file is in scope", () => {
    // Arrange: a route file whose call is in no symbol
    const seed = buildSeed([B_M], [{ from: { file: 'routes.php' }, to: 'b.php#B::m' }]);
    seed.files.push({ id: 'routes.php', projectId: 'p1', path: 'routes.php' });

    // Act
    const project = measureOne(seed, [siteOf('s1', 'routes.php', 9, "Route::get('/x', 'B@m')", 'exact', 'b.php#B::m')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('tp');
  });

  it('A positive site without a matching edge is a miss', () => {
    // Arrange
    const seed = buildSeed([A_RUN, B_M], []);

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, '$b->m(', 'heuristic', 'b.php#B::m')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('fn');
    expect(project.falseNegatives).toBe(1);
  });

  it('An edge with the called name to another target is a false positive', () => {
    // Arrange
    const c = { file: 'c.php', name: 'C::save', start: 1, end: 5 };
    const seed = buildSeed(
      [A_RUN, { file: 'b.php', name: 'B::save', start: 1, end: 5 }, c],
      [
        { from: { symbol: 'a.php#A::run' }, to: 'b.php#B::save' },
        { from: { symbol: 'a.php#A::run' }, to: 'c.php#C::save' },
      ],
    );

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, '$x->save(', 'exact', 'b.php#B::save')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('tp');
    expect(project.falsePositives).toBe(1);
    expect(project.sites[0]?.falsePositiveEdges).toEqual([{ file: 'c.php', symbol: 'C::save', resolution: 'exact' }]);
  });

  it('A none site with an attributed edge is a false positive', () => {
    // Arrange
    const seed = buildSeed(
      [A_RUN, { file: 'h.php', name: 'helper', start: 1, end: 3 }],
      [{ from: { symbol: 'a.php#A::run' }, to: 'h.php#helper' }],
    );

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, 'helper(', 'none', null)]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('fp');
    expect(project.falsePositives).toBe(1);
  });

  it('A none site without an attributed edge is a true negative', () => {
    // Arrange
    const seed = buildSeed([A_RUN, B_M], [{ from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m' }]);

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, 'helper(', 'none', null)]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('tn');
    expect(project.trueNegatives).toBe(1);
  });

  it('The called name of a route action, an array callable and a snake_case read', () => {
    // Act
    const route = calledNames({ ...siteOf('a', 'r.php', 1, "'App\\Http\\Controllers\\CheckoutController@store'", 'exact', null), form: 'call' }, 'php');
    const array = calledNames({ ...siteOf('b', 'r.php', 2, '[OrderController::class, \'show\']', 'exact', null), form: 'reference' }, 'php');
    const read = calledNames({ ...siteOf('c', 'r.php', 3, '$order->shipping_country', 'exact', null), form: 'read' }, 'php');
    const construct = calledNames({ ...siteOf('d', 'r.php', 4, 'new A(', 'exact', null), form: 'new' }, 'php');
    const constructTs = calledNames({ ...siteOf('e', 'r.ts', 4, 'new A(', 'exact', null), form: 'new' }, 'typescript');

    // Assert
    expect(route).toEqual(['store']);
    expect(array).toEqual(['show']);
    expect(read).toEqual(['shipping_country', 'shippingCountry', 'getShippingCountryAttribute']);
    expect(construct).toEqual(['__construct']);
    expect(constructTs).toEqual(['constructor']);
  });

  it("Two sites in one symbol do not count each other's hit as a false positive", () => {
    // Arrange
    const method: SymbolSpec = { file: 'a.ts', name: 'A::run', start: 10, end: 20 };
    const seed = buildSeed(
      [method, { file: 'x.ts', name: 'X::constructor', start: 1, end: 2 }, { file: 'y.ts', name: 'Y::constructor', start: 1, end: 2 }],
      [
        { from: { symbol: 'a.ts#A::run' }, to: 'x.ts#X::constructor' },
        { from: { symbol: 'a.ts#A::run' }, to: 'y.ts#Y::constructor' },
      ],
    );

    // Act
    const project = measureOne(
      seed,
      [
        siteOf('s1', 'a.ts', 12, 'new X(', 'exact', 'x.ts#X::constructor', 'new'),
        siteOf('s2', 'a.ts', 12, 'new Y(', 'exact', 'y.ts#Y::constructor', 'new'),
      ],
      'typescript',
    );

    // Assert
    expect(project.sites.map((entry) => entry.outcome)).toEqual(['tp', 'tp']);
    expect(project.falsePositives).toBe(0);
    expect(project.sites[0]?.attributedEdges).toHaveLength(2);
  });

  it('An edge of another kind or another project does not count', () => {
    // Arrange
    const seed = buildSeed(
      [A_RUN, B_M],
      [
        { from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m', kind: 'imports' },
        { from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m', project: 'p2' },
      ],
    );

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, '$b->m(', 'exact', 'b.php#B::m')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('fn');
    expect(project.callsEdges).toEqual({ exact: 0, heuristic: 0 });
  });

  it('A source symbol whose range ends before the site is out of scope', () => {
    // Arrange
    const seed = buildSeed([A_RUN, B_M], [{ from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m' }]);

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 41, '$b->m(', 'exact', 'b.php#B::m')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('fn');
  });

  it('Of two hits the one with the expected resolution is recorded', () => {
    // Arrange
    const seed = buildSeed(
      [A_RUN, B_M],
      [
        { from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m', resolution: 'exact' },
        { from: { symbol: 'a.php#A::run' }, to: 'b.php#B::m', resolution: 'heuristic' },
      ],
    );

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, '$b->m(', 'heuristic', 'b.php#B::m')]);

    // Assert
    expect(project.sites[0]?.outcome).toBe('tp');
    expect(project.sites[0]?.hit?.resolution).toBe('heuristic');
    expect(project.resolutionAgreement).toEqual({ agreed: 1, of: 1 });
    expect(project.falsePositives).toBe(0);
  });
});

describe('Measures per project', () => {
  it('Measures of a synthetic project', () => {
    // Arrange: 4 positive sites, 3 hits (2 with the expected resolution), 1 false-positive edge, 5 exact + 2 heuristic
    const symbols: SymbolSpec[] = [
      { file: 'a.php', name: 'A::run', start: 1, end: 100 },
      ...['m1', 'm2', 'm3', 'm4'].map((name) => ({ file: 'b.php', name: `B::${name}`, start: 1, end: 2 })),
      { file: 'c.php', name: 'C::m1', start: 1, end: 2 },
    ];
    const run = { symbol: 'a.php#A::run' };
    const seed = buildSeed(symbols, [
      { from: run, to: 'b.php#B::m1', resolution: 'exact' },
      { from: run, to: 'b.php#B::m2', resolution: 'exact' },
      { from: run, to: 'b.php#B::m3', resolution: 'heuristic' },
      { from: run, to: 'c.php#C::m1', resolution: 'exact' },
      { from: run, to: 'b.php#B::m4', resolution: 'exact' },
      { from: run, to: 'b.php#B::m4', resolution: 'exact' },
      { from: run, to: 'b.php#B::m4', resolution: 'heuristic' },
    ]);

    // Act: site 4 has no hit (its target m9 does not exist)
    const project = measureOne(seed, [
      siteOf('s1', 'a.php', 5, '$b->m1(', 'exact', 'b.php#B::m1'),
      siteOf('s2', 'a.php', 6, '$b->m2(', 'exact', 'b.php#B::m2'),
      siteOf('s3', 'a.php', 7, '$b->m3(', 'exact', 'b.php#B::m3'),
      siteOf('s4', 'a.php', 8, '$b->m9(', 'exact', 'b.php#B::m9'),
    ]);

    // Assert
    expect(project.positives).toBe(4);
    expect(project.truePositives).toBe(3);
    expect(project.falsePositives).toBe(1);
    expect(project.coverage).toBe(0.75);
    expect(project.precision).toBe(0.75);
    expect(project.resolutionAgreement).toEqual({ agreed: 2, of: 3 });
    expect(project.callsEdges).toEqual({ exact: 5, heuristic: 2 });
  });

  it('Undefined measures are null', () => {
    // Arrange
    const seed = buildSeed([A_RUN], []);

    // Act
    const project = measureOne(seed, [siteOf('s1', 'a.php', 28, 'helper(', 'none', null)]);

    // Assert
    expect(project.coverage).toBeNull();
    expect(project.precision).toBeNull();
  });

  it('Ratios are rounded half away from zero from the integers', () => {
    // 1/8 = 0.125 exactly, 1/16 = 0.0625: a tie at four decimals goes up
    expect(formatRatio(24, 31)).toBe('77,4 % (24/31)');
    expect(formatRatio(26, 26)).toBe('100,0 % (26/26)');
    expect(formatRatio(0, 0)).toBe('no definida');
    expect(formatRatio(1, 8)).toBe('12,5 % (1/8)');
    expect(formatRatio(1, 16)).toBe('6,3 % (1/16)');
    expect(formatAgreement({ fixture: 'acme-shop', n: 50, agreed: 50, percent: 100, kappa: 1 })).toBe(
      '`acme-shop`: concordancia 100 % (50/50), kappa 1',
    );
    expect(formatAgreement({ fixture: 'x', n: 50, agreed: 49, percent: 98, kappa: null })).toBe(
      '`x`: concordancia 98 % (49/50), kappa no definido',
    );
    expect(formatAgreement({ fixture: 'x', n: 50, agreed: 47, percent: 94.5, kappa: 0.875 })).toBe(
      '`x`: concordancia 94,5 % (47/50), kappa 0,875',
    );
  });
});

describe('Measurement output and CLI (run)', () => {
  it('The measurement is deterministic', () => {
    // Arrange
    const root = makeCopy();
    const first = streams();
    const second = streams();

    // Act
    const firstCode = runMeasureGraph([], { root, stdout: first.stdout, stderr: first.stderr });
    const firstJson = readFileSync(join(root, OUTPUT), 'utf8');
    rmSync(join(root, OUTPUT));
    const secondCode = runMeasureGraph([], { root, stdout: second.stdout, stderr: second.stderr });
    const secondJson = readFileSync(join(root, OUTPUT), 'utf8');

    // Assert
    expect(firstCode).toBe(0);
    expect(secondCode).toBe(0);
    expect(secondJson).toBe(firstJson);
    expect(firstJson.endsWith('}\n')).toBe(true);
    expect(firstJson).not.toContain(root);
    expect(firstJson).not.toContain(root.replace(/\\/g, '/'));
    const parsed = JSON.parse(firstJson) as { formatVersion: number; seed: { path: string; analyzerFingerprint: string }; projects: { fixture: string; language: string; sites: Record<string, unknown>[] }[] };
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.seed.path).toBe(SEED);
    expect(parsed.projects.map((project) => project.fixture)).toEqual(['acme-shop', 'task-api']);
    expect(Object.keys(parsed.projects[0] ?? {}).slice(0, 2)).toEqual(['fixture', 'language']);
    expect(Object.keys(parsed.projects[0]?.sites[0] ?? {})).toEqual([
      'id', 'call', 'site', 'expected', 'outcome', 'hit', 'attributedEdges', 'falsePositiveEdges',
    ]);
    const lines = first.out().trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.startsWith('acme-shop: cobertura ')).toBe(true);
    expect(lines[1]?.startsWith('task-api: cobertura ')).toBe(true);
    for (const line of lines) {
      expect(line).toMatch(/^[a-z-]+: cobertura (\d+,\d % \(\d+\/\d+\)|no definida) · precisión (\d+,\d % \(\d+\/\d+\)|no definida) · calls \d+ exact \/ \d+ heuristic$/);
    }
    expect(second.out()).toBe(first.out());
  });
});
