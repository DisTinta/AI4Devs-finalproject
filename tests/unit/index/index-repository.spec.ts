import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EmptyRepository, ForbiddenPathError, INDEX_PHASES, IndexingDisabled, InvalidGraph, NotAGitRepository, ProjectNameTaken, REDACTION_MARKER, indexRepository } from '@codemind/core';
import type {
  AnalysisResult,
  AnalyzerPort,
  GitHistory,
  GitPort,
  IndexDependencies,
  IndexInput,
  IndexPhase,
  KnowledgeGraph,
  NewProject,
  SaveGraphResult,
  SourceFile,
  SourceTree,
  SourceTreePort,
  StorePort,
} from '@codemind/core';

// Spec: openspec/specs/repository-indexing/spec.md → "Indexing order and no
// partial write", "Input hygiene before analysis", "Secrets never reach the store", "Framework
// detection by manifest". Each `it` named after a scenario is that scenario. Every port is an
// in-memory fake recording its calls in one shared log, so the order across ports can be asserted.

const SHA = 'a'.repeat(40);

/** What the fakes return or throw; every field has a working default. */
interface FakeOptions {
  realPaths?: Map<string, string>;
  realPathError?: (requested: string) => Error | undefined;
  tree?: SourceTree;
  readFilesError?: Error;
  analyze?: (files: SourceFile[]) => AnalysisResult;
  history?: GitHistory;
  readHistoryError?: Error;
  createProjectError?: Error;
}

/** The fakes, their shared call log, and what they received. */
interface World {
  deps: IndexDependencies;
  log: string[];
  phases: IndexPhase[];
  analyzed: SourceFile[][];
  created: NewProject[];
  saved: KnowledgeGraph[];
}

/** A default analysis: one `source` file per input, no symbols, no edges, no diagnostics. */
function plainAnalysis(files: SourceFile[]): AnalysisResult {
  return { files: files.map((file) => ({ path: file.path, kind: 'source' })), symbols: [], edges: [], diagnostics: [] };
}

function world(options: FakeOptions = {}): World {
  const log: string[] = [];
  const phases: IndexPhase[] = [];
  const analyzed: SourceFile[][] = [];
  const created: NewProject[] = [];
  const saved: KnowledgeGraph[] = [];
  const sourceTree: SourceTreePort = {
    async realPath(requested) {
      log.push(`realPath ${requested}`);
      const error = options.realPathError?.(requested);
      if (error) throw error;
      return options.realPaths?.get(requested) ?? requested;
    },
    async readFiles(root) {
      log.push(`readFiles ${root}`);
      if (options.readFilesError) throw options.readFilesError;
      return options.tree ?? { files: [{ path: 'app/A.php', content: '<?php\n' }], skipped: [] };
    },
  };
  const analyzer: AnalyzerPort = {
    async analyze(input) {
      log.push('analyze');
      analyzed.push(input.files);
      return (options.analyze ?? plainAnalysis)(input.files);
    },
  };
  const git: GitPort = {
    async readHistory(repoPath) {
      log.push(`readHistory ${repoPath}`);
      if (options.readHistoryError) throw options.readHistoryError;
      return options.history ?? { head: SHA, commits: [{ sha: SHA, message: 'feat: a' }], fileCommits: [{ file: 'app/A.php', sha: SHA }] };
    },
  };
  const store = {
    async createProject(project: NewProject) {
      log.push('createProject');
      created.push(project);
      if (options.createProjectError) throw options.createProjectError;
      return 'project-1';
    },
    async saveGraph(projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult> {
      log.push(`saveGraph ${projectId}`);
      saved.push(graph);
      return {
        files: graph.files.length,
        filesDeleted: 0,
        symbols: graph.symbols.length,
        edges: graph.edges.length,
        commits: graph.commits.length,
        fileCommits: graph.fileCommits.length,
      };
    },
  } as unknown as StorePort;
  return { deps: { sourceTree, analyzer, git, store, onProgress: (phase) => phases.push(phase) }, log, phases, analyzed, created, saved };
}

/** The default input: `acme-shop` inside `/repos`, PHP, no explicit framework. */
function input(overrides: Partial<IndexInput> = {}): IndexInput {
  return { repoPath: 'acme-shop', allowedRoot: '/repos', name: 'acme-shop', language: 'php', ...overrides };
}

const ROOT = path.resolve('/repos');
const REPO = path.resolve('/repos/acme-shop');

describe('index repository', () => {
  it('Progress phases are reported once and in order', async () => {
    // Arrange
    const w = world();

    // Act
    await indexRepository(w.deps, input());

    // Assert
    expect(w.phases).toEqual([...INDEX_PHASES]);
    expect(w.phases).toEqual(['confine', 'read', 'redact', 'analyze', 'history', 'save']);
    expect(w.log).toEqual([`realPath ${ROOT}`, `realPath ${REPO}`, `readFiles ${REPO}`, 'analyze', `readHistory ${REPO}`, 'createProject', 'saveGraph project-1']);
  });

  it('A path outside the allowed root is rejected before reading', async () => {
    // Arrange
    const w = world();

    // Act
    const run = indexRepository(w.deps, input({ repoPath: '../etc' }));

    // Assert
    await expect(run).rejects.toBeInstanceOf(ForbiddenPathError);
    expect(w.phases).toEqual(['confine']);
    expect(w.log).toEqual([]);
  });

  it('Indexing is disabled without an allowed root', async () => {
    // Arrange
    const w = world();

    // Act
    const run = indexRepository(w.deps, input({ allowedRoot: '' }));

    // Assert
    await expect(run).rejects.toBeInstanceOf(IndexingDisabled);
    expect(w.phases).toEqual(['confine']);
    expect(w.log).toEqual([]);
  });

  it('A symbolic link escaping the allowed root is rejected before reading', async () => {
    // Arrange
    const elsewhere = path.resolve('/elsewhere/acme-shop');
    const w = world({ realPaths: new Map([[REPO, elsewhere]]) });

    // Act
    const error = await indexRepository(w.deps, input()).catch((caught: unknown) => caught);

    // Assert
    expect(error).toBeInstanceOf(ForbiddenPathError);
    expect(w.phases).toEqual(['confine']);
    expect(w.log).toEqual([`realPath ${ROOT}`, `realPath ${REPO}`]);
    expect((error as ForbiddenPathError).requestedPath).toBe('acme-shop');
    // `elsewhere` without separators: '/elsewhere' never matches on Windows, where it is C:\elsewhere.
    expect((error as Error).message).not.toContain('elsewhere');
    expect((error as Error).message).not.toContain(elsewhere);
  });

  it('An allowed root that does not exist disables indexing', async () => {
    // Arrange
    const w = world({ realPathError: (requested) => (requested === ROOT ? new NotAGitRepository(requested) : undefined) });

    // Act
    const run = indexRepository(w.deps, input());

    // Assert
    await expect(run).rejects.toBeInstanceOf(IndexingDisabled);
    expect(w.phases).toEqual(['confine']);
    expect(w.log.filter((call) => !call.startsWith('realPath'))).toEqual([]);
  });

  it('A failure reading the source tree writes nothing', async () => {
    // Arrange
    const failure = new NotAGitRepository(REPO);
    const w = world({ readFilesError: failure });

    // Act
    const run = indexRepository(w.deps, input());

    // Assert
    await expect(run).rejects.toBe(failure);
    expect(w.phases.at(-1)).toBe('read');
    expect(w.log.at(-1)).toBe(`readFiles ${REPO}`);
  });

  it('A failure reading the history writes nothing', async () => {
    // Arrange
    const failure = new NotAGitRepository(REPO);
    const failing = world({ readHistoryError: failure });
    const empty = world({ history: { head: undefined, commits: [], fileCommits: [] } });

    // Act
    const failingRun = indexRepository(failing.deps, input());
    const emptyRun = indexRepository(empty.deps, input());

    // Assert
    await expect(failingRun).rejects.toBe(failure);
    await expect(emptyRun).rejects.toBeInstanceOf(EmptyRepository);
    await expect(emptyRun).rejects.toMatchObject({ code: 'EMPTY_REPOSITORY', repoPath: REPO });
    for (const w of [failing, empty]) {
      expect(w.phases.at(-1)).toBe('history');
      expect(w.log.at(-1)).toBe(`readHistory ${REPO}`);
    }
  });

  it('An invalid graph creates no project', async () => {
    // Arrange: an edge to a symbol the analysis does not return.
    const w = world({
      analyze: (files) => ({
        ...plainAnalysis(files),
        edges: [
          {
            kind: 'calls',
            source: { file: 'app/A.php' },
            target: { symbol: { file: 'app/A.php', name: 'Missing', startLine: 1 } },
            resolution: 'exact',
            extractor: 'test',
          },
        ],
      }),
    });

    // Act
    const run = indexRepository(w.deps, input());

    // Assert
    await expect(run).rejects.toBeInstanceOf(InvalidGraph);
    expect(w.phases.at(-1)).toBe('save');
    expect(w.log).not.toContain('createProject');
    expect(w.log).not.toContain('saveGraph project-1');
  });

  it('A taken project name saves no graph', async () => {
    // Arrange
    const failure = new ProjectNameTaken('acme-shop');
    const w = world({ createProjectError: failure });

    // Act
    const run = indexRepository(w.deps, input());

    // Assert
    await expect(run).rejects.toBe(failure);
    expect(w.phases.at(-1)).toBe('save');
    expect(w.log.at(-1)).toBe('createProject');
  });

  it('Malformed, repeated and binary entries never reach the analyzer', async () => {
    // Arrange
    const first: SourceFile = { path: 'app/A.php', content: '<?php // first\n' };
    const bell = 'app/C' + String.fromCharCode(7) + '.php';
    const w = world({
      tree: {
        files: [
          first,
          { path: 'app/A.php', content: '<?php // second\n' },
          { path: 'app\\B.php', content: '<?php\n' },
          { path: '/abs.php', content: '<?php\n' },
          { path: '', content: '<?php\n' },
          { path: bell, content: '<?php\n' },
          { path: 'app/D.php', content: '<?php' + String.fromCharCode(0) + '\n' },
        ],
        skipped: [{ path: 'lib/link.php', reason: 'symlink' }],
      },
      history: {
        head: SHA,
        commits: [{ sha: SHA, message: 'feat: a' }],
        fileCommits: [
          { file: 'app/A.php', sha: SHA },
          { file: 'app/gone.php', sha: SHA },
        ],
      },
    });

    // Act
    const report = await indexRepository(w.deps, input());

    // Assert
    expect(w.analyzed).toEqual([[first]]);
    expect(report.skipped).toEqual([
      { path: '', reason: 'invalid-path' },
      { path: '/abs.php', reason: 'invalid-path' },
      { path: 'app/A.php', reason: 'duplicate-path' },
      { path: bell, reason: 'invalid-path' },
      { path: 'app/D.php', reason: 'binary-content' },
      { path: 'app\\B.php', reason: 'invalid-path' },
      { path: 'lib/link.php', reason: 'symlink' },
    ]);
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0].commits).toEqual([{ sha: SHA, message: 'feat: a' }]);
    expect(w.saved[0].fileCommits).toEqual([{ file: 'app/A.php', sha: SHA }]);
  });

  it('The analyzer only receives redacted content', async () => {
    // Arrange: a synthetic AWS access key id, built here so no secret-shaped literal is committed.
    const key = 'AK' + 'IA' + 'Z7Q2W4E6R8T0Y1U3';
    const w = world({
      tree: {
        files: [
          { path: 'config/aws.php', content: `<?php return ['key' => '${key}'];\n` },
          { path: 'app/Clean.php', content: '<?php final class Clean {}\n' },
        ],
        skipped: [],
      },
    });

    // Act
    await indexRepository(w.deps, input());

    // Assert
    const received = w.analyzed[0].find((file) => file.path === 'config/aws.php');
    expect(received?.content).toContain(REDACTION_MARKER);
    for (let start = 0; start + 8 <= key.length; start++) expect(received?.content).not.toContain(key.slice(start, start + 8));
    const saved = new Map(w.saved[0].files.map((file) => [file.path, file]));
    expect(saved.get('config/aws.php')?.redacted).toBe(true);
    expect(saved.get('app/Clean.php')?.redacted).toBe(false);
  });

  it('A secret in a commit message is redacted', async () => {
    // Arrange: a synthetic AWS access key id, built here so no secret-shaped literal is committed.
    const key = 'AK' + 'IA' + 'Z7Q2W4E6R8T0Y1U3';
    const w = world({
      history: {
        head: SHA,
        commits: [{ sha: SHA, message: `fix: rotate credentials\n\nold key ${key} removed` }],
        fileCommits: [{ file: 'app/A.php', sha: SHA }],
      },
    });

    // Act
    const report = await indexRepository(w.deps, input());

    // Assert
    const message = w.saved[0].commits[0].message ?? '';
    expect(message).toContain(REDACTION_MARKER);
    expect(message).not.toContain(key);
    expect(report.commitEvents).toEqual([{ commit: SHA, line: 3, column: 9, rule: 'aws-access-key-id' }]);
    const serialised = JSON.stringify(report);
    for (let start = 0; start + 8 <= key.length; start++) expect(serialised).not.toContain(key.slice(start, start + 8));
  });

  it('An explicit framework wins over detection', async () => {
    // Arrange
    const laravel: SourceFile = { path: 'composer.json', content: JSON.stringify({ require: { 'laravel/framework': '^11.0' } }) };
    const detected = world({ tree: { files: [laravel], skipped: [] } });
    const explicit = world({ tree: { files: [laravel], skipped: [] } });

    // Act
    const detectedReport = await indexRepository(detected.deps, input());
    const explicitReport = await indexRepository(explicit.deps, input({ framework: 'none' }));

    // Assert
    expect(detected.created[0].framework).toBe('laravel');
    expect(detectedReport).toMatchObject({ framework: 'laravel', frameworkSource: 'detected' });
    expect(explicit.created[0].framework).toBe('none');
    expect(explicitReport).toMatchObject({ framework: 'none', frameworkSource: 'explicit' });
  });

  describe('extra cases', () => {
    it('hashes the redacted content with SHA-256 and keeps a commit without message as is', async () => {
      // Arrange: SHA-256 of "abc" is the FIPS 180-2 test vector.
      const key = 'AK' + 'IA' + 'Z7Q2W4E6R8T0Y1U3';
      const w = world({
        tree: {
          files: [
            { path: 'abc.txt', content: 'abc' },
            { path: 'config/aws.php', content: `<?php return ['key' => '${key}'];\n` },
          ],
          skipped: [],
        },
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
      });

      // Act
      await indexRepository(w.deps, input());

      // Assert
      const [abc, aws] = w.saved[0].files;
      expect(abc.contentHash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      const redacted = `<?php return ['key' => '${REDACTION_MARKER}'];\n`;
      expect(aws.contentHash).toBe(createHash('sha256').update(redacted, 'utf8').digest('hex'));
      expect(w.saved[0].commits).toEqual([{ sha: SHA }]);
    });

    it('orders events and skipped entries in byte order and counts edges by resolution', async () => {
      // Arrange: U+FFFD sorts before U+1F600 in byte order, after it in UTF-16 code unit order (`<`);
      // a path sorts before its extension; after an equal U+FFFF the next character still decides.
      const key = 'AK' + 'IA' + 'Z7Q2W4E6R8T0Y1U3';
      const secret = `'${key}'\n`;
      const w = world({
        tree: {
          files: [
            { path: '😀.php', content: secret },
            { path: '�.php', content: secret },
            { path: 'b.php.bak', content: secret },
            { path: 'b.php', content: secret },
            { path: 'x￿b.php', content: secret },
            { path: 'x￿a.php', content: secret },
            { path: 'a.php', content: secret + secret },
          ],
          skipped: [
            { path: 'z/sub', reason: 'submodule' },
            { path: 'z/sub', reason: 'binary-content' },
          ],
        },
        analyze: (files) => ({
          ...plainAnalysis(files),
          edges: [
            { kind: 'imports', source: { file: 'a.php' }, target: { file: 'b.php' }, resolution: 'exact', extractor: 'test' },
            { kind: 'extends', source: { file: 'a.php' }, target: { file: 'b.php' }, resolution: 'exact', extractor: 'test' },
            { kind: 'describes', source: { file: 'b.php' }, target: { file: 'a.php' }, resolution: 'heuristic', extractor: 'test' },
          ],
        }),
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
      });

      // Act
      const report = await indexRepository(w.deps, input());

      // Assert
      expect(report.events.map((event) => [event.file, event.line])).toEqual([
        ['a.php', 1],
        ['a.php', 2],
        ['b.php', 1],
        ['b.php.bak', 1],
        ['x￿a.php', 1],
        ['x￿b.php', 1],
        ['�.php', 1],
        ['😀.php', 1],
      ]);
      expect(report.skipped).toEqual([
        { path: 'z/sub', reason: 'binary-content' },
        { path: 'z/sub', reason: 'submodule' },
      ]);
      expect(report.edges).toEqual({ total: 3, exact: 2, heuristic: 1 });
    });

    it('propagates a failure resolving the root that is not a missing path', async () => {
      // Arrange
      const failure = new Error('EACCES: permission denied');
      const w = world({ realPathError: (requested) => (requested === ROOT ? failure : undefined) });

      // Act / Assert
      await expect(indexRepository(w.deps, input())).rejects.toBe(failure);
      expect(w.phases).toEqual(['confine']);
    });

    it('rejects a file the analyzer did not receive with InvalidGraph naming its path, before createProject', async () => {
      // Arrange: the analyzer returns a file it was never given, like an edge to a symbol it does not return.
      const w = world({
        analyze: (files) => ({ ...plainAnalysis(files), files: [...plainAnalysis(files).files, { path: 'generated.php', kind: 'source' }] }),
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
      });

      // Act
      const error = await indexRepository(w.deps, input()).catch((caught: unknown) => caught);

      // Assert
      expect(error).toBeInstanceOf(InvalidGraph);
      // Element and field follow the GraphViolation contract; only the wording is free.
      expect((error as InvalidGraph).violations).toEqual([expect.objectContaining({ element: 'files[1]', field: 'path' })]);
      expect((error as InvalidGraph).message).toContain('"generated.php"');
      expect(w.phases.at(-1)).toBe('save');
      expect(w.log).not.toContain('createProject');
      expect(w.saved).toEqual([]);
    });

    it('rejects a file the analyzer did not return with InvalidGraph naming its path, before createProject', async () => {
      // Arrange: the analyzer drops one of the two files it was given.
      const w = world({
        tree: {
          files: [
            { path: 'app/A.php', content: '<?php\n' },
            { path: 'app/Lost.php', content: '<?php\n' },
          ],
          skipped: [],
        },
        analyze: (files) => plainAnalysis(files.filter((file) => file.path !== 'app/Lost.php')),
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [{ file: 'app/Lost.php', sha: SHA }] },
      });
      let report: unknown;

      // Act
      const error = await indexRepository(w.deps, input()).then(
        (resolved) => {
          report = resolved;
        },
        (caught: unknown) => caught,
      );

      // Assert
      expect(report).toBeUndefined();
      expect(error).toBeInstanceOf(InvalidGraph);
      expect((error as InvalidGraph).violations).toEqual([expect.objectContaining({ element: 'files', field: 'path' })]);
      expect((error as InvalidGraph).message).toContain('"app/Lost.php"');
      expect(w.phases.at(-1)).toBe('save');
      expect(w.log).not.toContain('createProject');
      expect(w.saved).toEqual([]);
    });

    it('names every missing and every extra path in one InvalidGraph', async () => {
      // Arrange: two given files left out and one file never given.
      const w = world({
        tree: {
          files: [
            { path: 'app/A.php', content: '<?php\n' },
            { path: 'app/Lost1.php', content: '<?php\n' },
            { path: 'app/Lost2.php', content: '<?php\n' },
          ],
          skipped: [],
        },
        analyze: (files) => {
          const kept = plainAnalysis(files.filter((file) => file.path === 'app/A.php'));
          return { ...kept, files: [...kept.files, { path: 'app/Extra.php', kind: 'source' }] };
        },
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
      });

      // Act
      const error = await indexRepository(w.deps, input()).catch((caught: unknown) => caught);

      // Assert
      expect(error).toBeInstanceOf(InvalidGraph);
      expect((error as InvalidGraph).violations).toHaveLength(3);
      for (const path of ['app/Lost1.php', 'app/Lost2.php', 'app/Extra.php']) {
        expect((error as InvalidGraph).message).toContain(`"${path}"`);
      }
      expect(w.log).not.toContain('createProject');
    });

    it('saves one exact edge when an exact and a heuristic edge share kind, source and target', async () => {
      // Arrange: the code-analysis dedup rule; the heuristic edge comes first on purpose.
      const edge = { kind: 'calls', source: { file: 'a.php' }, target: { file: 'b.php' }, extractor: 'test' } as const;
      const w = world({
        tree: {
          files: [
            { path: 'a.php', content: '<?php\n' },
            { path: 'b.php', content: '<?php\n' },
          ],
          skipped: [],
        },
        analyze: (files) => ({ ...plainAnalysis(files), edges: [{ ...edge, resolution: 'heuristic' }, { ...edge, resolution: 'exact' }] }),
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
      });

      // Act
      const report = await indexRepository(w.deps, input());

      // Assert
      expect(w.saved[0].edges).toEqual([{ ...edge, resolution: 'exact' }]);
      expect(report.edges).toEqual({ total: 1, exact: 1, heuristic: 0 });
    });

    it('returns a report that survives a JSON round trip unchanged', async () => {
      // Arrange: every collection of the report populated.
      const key = 'AK' + 'IA' + 'Z7Q2W4E6R8T0Y1U3';
      const w = world({
        tree: { files: [{ path: 'config/keys.php', content: `<?php return '${key}';\n` }], skipped: [{ path: 'lib/link.php', reason: 'symlink' }] },
        analyze: (files) => ({ ...plainAnalysis(files), diagnostics: [{ path: 'config/keys.php', line: 1, message: 'note' }] }),
        history: { head: SHA, commits: [{ sha: SHA, message: `chore: ${key}` }], fileCommits: [] },
      });

      // Act
      const report = await indexRepository(w.deps, input());

      // Assert
      expect(report.events).toHaveLength(1);
      expect(report.commitEvents).toHaveLength(1);
      expect(report.skipped).toHaveLength(1);
      expect(JSON.parse(JSON.stringify(report))).toStrictEqual(report);
    });

    it('saves every file with redacted and a 64-hex contentHash', async () => {
      // Arrange
      const key = 'AK' + 'IA' + 'Z7Q2W4E6R8T0Y1U3';
      const w = world({
        tree: {
          files: [
            { path: 'app/A.php', content: '<?php\n' },
            { path: 'config/keys.php', content: `<?php return '${key}';\n` },
          ],
          skipped: [],
        },
        history: { head: SHA, commits: [{ sha: SHA }], fileCommits: [] },
      });

      // Act
      await indexRepository(w.deps, input());

      // Assert
      expect(w.saved[0].files).toHaveLength(2);
      for (const file of w.saved[0].files) {
        expect(typeof file.redacted, file.path).toBe('boolean');
        expect(file.contentHash, file.path).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('computes co-change weights with the unfiltered links', async () => {
      // Arrange: a.php and b.php share two commits; a third commit touches a.php and a gone path.
      const shas = ['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)];
      const w = world({
        tree: {
          files: [
            { path: 'a.php', content: '<?php\n' },
            { path: 'b.php', content: '<?php\n' },
          ],
          skipped: [],
        },
        history: {
          head: shas[0],
          commits: shas.map((sha) => ({ sha })),
          fileCommits: [
            { file: 'a.php', sha: shas[0] },
            { file: 'b.php', sha: shas[0] },
            { file: 'a.php', sha: shas[1] },
            { file: 'b.php', sha: shas[1] },
            { file: 'a.php', sha: shas[2] },
            { file: 'gone.php', sha: shas[2] },
          ],
        },
      });

      // Act
      await indexRepository(w.deps, input());

      // Assert
      const coChanged = w.saved[0].edges.filter((edge) => edge.kind === 'co_changed');
      expect(coChanged).toHaveLength(1);
      expect(coChanged[0].weight).toBeCloseTo(2 / 3);
      expect(w.saved[0].fileCommits.some((link) => link.file === 'gone.php')).toBe(false);
    });

    it('treats empty, dot and dot-dot segments as invalid paths', async () => {
      // Arrange
      const w = world({
        tree: {
          files: ['app//A.php', './A.php', 'app/../A.php', 'app/', 'ok/A.php'].map((p) => ({ path: p, content: '<?php\n' })),
          skipped: [],
        },
      });

      // Act
      const report = await indexRepository(w.deps, input());

      // Assert
      expect(w.analyzed[0].map((file) => file.path)).toEqual(['ok/A.php']);
      expect(report.skipped.map((entry) => entry.reason)).toEqual(['invalid-path', 'invalid-path', 'invalid-path', 'invalid-path']);
    });

    it('propagates an error thrown by the progress callback', async () => {
      // Arrange
      const failure = new Error('progress sink failed');
      const w = world();
      w.deps.onProgress = (phase) => {
        if (phase === 'analyze') throw failure;
      };

      // Act / Assert
      await expect(indexRepository(w.deps, input())).rejects.toBe(failure);
      expect(w.log).not.toContain('analyze');
    });

    it('works without a progress callback', async () => {
      // Arrange
      const w = world();
      delete w.deps.onProgress;

      // Act / Assert
      await expect(indexRepository(w.deps, input())).resolves.toMatchObject({ projectId: 'project-1', indexedCommit: SHA });
    });
  });
});
