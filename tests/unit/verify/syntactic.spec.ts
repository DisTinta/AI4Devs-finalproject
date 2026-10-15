import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVIDENCE_BROKEN_REASONS, MAX_EVIDENCE_TEXT_CHARS, redactSecrets, REDACTION_MARKER, SourceUnavailable, verifyCitations } from '@codemind/core';
import type { Citation } from '@codemind/core';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import type { SourceContents } from '../../support/in-memory-source-tree';

// Spec: openspec/changes/evidence-verifier-syntactic/specs/evidence-verification/spec.md → "Syntactic
// citation check" and "Expected text of a cited range" (DIS-68). Each test is one scenario, named after
// it, over the in-memory source tree double.

const ROOT = '/repos/acme';
const C = 'c'.repeat(40);

/** A content of `lines` numbered lines, each ending with a line feed. */
function numbered(path: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `// ${path} line ${i + 1}\n`).join('');
}

/** Lines `start..end` (from 1) of `content`, joined by line feeds, as the pack cuts them. */
function linesOf(content: string, start: number, end: number): string {
  return content.split('\n').slice(start - 1, end).join('\n');
}

/** The double over `files` at `C` under `ROOT`. */
function sourceOf(files: Record<string, string>, failures?: Record<string, unknown>) {
  const contents: SourceContents = { [ROOT]: { [C]: files } };
  return createInMemorySourceTree(contents, failures);
}

/** A citation of `path` lines `start..end` whose excerpt is the text of those lines in `content`. */
function citation(path: string, content: string, start: number, end: number): Citation {
  return { path, startLine: start, endLine: end, excerpt: linesOf(content, start, end) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Requirement: Syntactic citation check', () => {
  it('Valid citations are cited and each path is read once', async () => {
    // Arrange
    const a = numbered('app/A.php', 30);
    const b = numbered('app/B.php', 50);
    const double = sourceOf({ 'app/A.php': a, 'app/B.php': b });
    const citations = [citation('app/A.php', a, 10, 24), citation('app/B.php', b, 30, 41), citation('app/A.php', a, 10, 24)];
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, citations);
    const again = await verifyCitations(double.source, ROOT, C, citations);

    // Assert
    expect(verdicts).toEqual([{ verification: 'cited' }, { verification: 'cited' }, { verification: 'cited' }]);
    expect(double.batchReads).toEqual([
      { root: ROOT, commit: C, paths: ['app/A.php', 'app/B.php'] },
      { root: ROOT, commit: C, paths: ['app/A.php', 'app/B.php'] },
    ]);
    expect(double.calls).toEqual({ readFileAt: 0, readFilesAt: 2 });
    expect(again).toEqual(verdicts);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('A missing file or a range out of the file is broken', async () => {
    // Arrange
    const b = numbered('app/B.php', 20);
    const double = sourceOf({ 'app/B.php': b });
    const citations: Citation[] = [
      { path: 'app/Gone.php', startLine: 1, endLine: 5, excerpt: '' },
      { path: 'app/B.php', startLine: 18, endLine: 30, excerpt: linesOf(b, 18, 30) },
      { path: 'app/B.php', startLine: 0, endLine: 3, excerpt: linesOf(b, 1, 3) },
      { path: 'app/B.php', startLine: 9, endLine: 8, excerpt: '' },
      citation('app/B.php', b, 1, 20),
      // Both out of the file and not its text: the range is checked first.
      { path: 'app/B.php', startLine: 19, endLine: 21, excerpt: 'not the text' },
    ];

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, citations);

    // Assert
    expect(verdicts).toEqual([
      { verification: 'broken', reason: 'file-missing' },
      { verification: 'broken', reason: 'range-out-of-file' },
      { verification: 'broken', reason: 'range-out-of-file' },
      { verification: 'broken', reason: 'range-out-of-file' },
      { verification: 'cited' },
      { verification: 'broken', reason: 'range-out-of-file' },
    ]);
    expect(EVIDENCE_BROKEN_REASONS).toEqual(['file-missing', 'range-out-of-file', 'excerpt-mismatch']);
    expect(double.batchReads).toEqual([{ root: ROOT, commit: C, paths: ['app/Gone.php', 'app/B.php'] }]);
    expect(double.reads).toEqual([
      { root: ROOT, commit: C, path: 'app/Gone.php' },
      { root: ROOT, commit: C, path: 'app/B.php' },
    ]);
  });

  it('Other read failures propagate', async () => {
    // Arrange: one batched read rejecting each way, then a `missing` batch whose single read of
    // another path rejects `binary-content`.
    const gitError = new Error('fatal: git failed');
    const batchFailures = [new SourceUnavailable('too-large', 'app/A.php'), new SourceUnavailable('not-a-repository', 'app/A.php'), gitError];
    const binary = new SourceUnavailable('binary-content', 'app/B.php');
    const mixed = sourceOf({}, { 'app/B.php': binary });
    const citations: Citation[] = [
      { path: 'app/A.php', startLine: 1, endLine: 1, excerpt: '' },
      { path: 'app/B.php', startLine: 1, endLine: 1, excerpt: '' },
    ];

    const batchDoubles = batchFailures.map((failure) => sourceOf({}, { 'app/A.php': failure }));

    // Act
    const errors = await Promise.all(
      batchDoubles.map((double) => verifyCitations(double.source, ROOT, C, citations).catch((error: unknown) => error)),
    );
    const mixedError = await verifyCitations(mixed.source, ROOT, C, citations).catch((error: unknown) => error);

    // Assert
    expect(errors).toEqual(batchFailures);
    errors.forEach((error, i) => expect(error).toBe(batchFailures[i]));
    // Only a `missing` batch falls back to single reads (Stryker survivor, 9.4).
    for (const double of batchDoubles) expect(double.calls).toEqual({ readFileAt: 0, readFilesAt: 1 });
    expect(mixedError).toBe(binary);
    expect(mixed.reads.map((read) => read.path)).toEqual(['app/A.php', 'app/B.php']);
  });

  it('Non-integer lines are out of the file', async () => {
    // Arrange
    const b = numbered('app/B.php', 20);
    const double = sourceOf({ 'app/B.php': b });

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      { path: 'app/B.php', startLine: Number.NaN, endLine: Number.NaN, excerpt: '' },
      { path: 'app/B.php', startLine: 1.5, endLine: 3, excerpt: linesOf(b, 1, 3) },
      { path: 'app/B.php', startLine: 1, endLine: 2.5, excerpt: linesOf(b, 1, 2) },
    ]);

    // Assert
    expect(verdicts).toEqual([
      { verification: 'broken', reason: 'range-out-of-file' },
      { verification: 'broken', reason: 'range-out-of-file' },
      { verification: 'broken', reason: 'range-out-of-file' },
    ]);
  });

  it('A short batched read is an error', async () => {
    // Arrange: a reader that breaks its contract, one content for two paths.
    const content = '<?php' + String.fromCharCode(10);
    const double = sourceOf({ 'app/A.php': content, 'app/B.php': content });
    const source = { ...double.source, readFilesAt: async () => [content] };

    // Act
    const error = await verifyCitations(source, ROOT, C, [
      { path: 'app/A.php', startLine: 1, endLine: 1, excerpt: '<?php' },
      { path: 'app/B.php', startLine: 1, endLine: 1, excerpt: '<?php' },
    ]).catch((rejection: unknown) => rejection);

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('source reader returned 1 contents for 2 paths');
    expect((error as Error).message).not.toContain('<?php');
    expect(double.calls.readFileAt).toBe(0);
  });

  it('No citation reads nothing', async () => {
    // Arrange
    const double = sourceOf({});

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, []);

    // Assert
    expect(verdicts).toEqual([]);
    expect(double.calls).toEqual({ readFileAt: 0, readFilesAt: 0 });
  });
});

describe('Requirement: Expected text of a cited range', () => {
  it('A diverging excerpt is broken', async () => {
    // Arrange: one excerpt differs from the file in line 15, another only adds a trailing space.
    const a = numbered('app/A.php', 30);
    const double = sourceOf({ 'app/A.php': a });
    const lines = linesOf(a, 10, 24).split('\n');
    const changed = lines.map((line, i) => (i === 15 - 10 ? `${line} // changed` : line)).join('\n');
    const spaced = `${lines.join('\n')} `;

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      { path: 'app/A.php', startLine: 10, endLine: 24, excerpt: changed },
      { path: 'app/A.php', startLine: 10, endLine: 24, excerpt: spaced },
    ]);

    // Assert
    expect(verdicts).toEqual([
      { verification: 'broken', reason: 'excerpt-mismatch' },
      { verification: 'broken', reason: 'excerpt-mismatch' },
    ]);
  });

  it('A redacted secret matches its redacted excerpt', async () => {
    // Arrange: a key the indexing's scanner redacts, built at run time so the source holds no literal.
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const content = `<?php\n// header\n$key = '${key}';\n// body\n// end\n`;
    const double = sourceOf({ 'app/Keyed.php': content });
    const excerpt = linesOf(redactSecrets({ path: 'app/Keyed.php', content }).file.content, 1, 5);

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [{ path: 'app/Keyed.php', startLine: 1, endLine: 5, excerpt }]);

    // Assert
    expect(excerpt).toContain(REDACTION_MARKER);
    expect(excerpt).not.toContain(key);
    expect(verdicts).toEqual([{ verification: 'cited' }]);
  });

  it('A cut CRLF span matches without its trailing carriage return', async () => {
    // Arrange: lines ending in CRLF; the sanitisation cut lines 1–4 and dropped the `\r` of line 4.
    const content = Array.from({ length: 8 }, (_, i) => `line ${i + 1}\r\n`).join('');
    const double = sourceOf({ 'app/Crlf.php': content });
    const excerpt = linesOf(content, 1, 4).replace(/\r$/, '');

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      { path: 'app/Crlf.php', startLine: 1, endLine: 4, excerpt, cut: 'lines' },
      { path: 'app/Crlf.php', startLine: 1, endLine: 4, excerpt },
    ]);

    // Assert
    expect(excerpt.endsWith('line 4')).toBe(true);
    expect(verdicts).toEqual([{ verification: 'cited' }, { verification: 'broken', reason: 'excerpt-mismatch' }]);
  });

  it('A line-cut span matches the first code points of its line', async () => {
    // Arrange: line 1 of astral characters (two UTF-16 units each) past the limit, so a UTF-16 cut
    // would differ from a code-point cut and could split a surrogate pair.
    const line = '😀a'.repeat(MAX_EVIDENCE_TEXT_CHARS);
    const content = `${line}\nsecond line\n`;
    const double = sourceOf({ 'app/Long.php': content });
    const codePoints = Array.from(line);
    const excerpt = codePoints.slice(0, MAX_EVIDENCE_TEXT_CHARS).join('');
    const shorter = codePoints.slice(0, MAX_EVIDENCE_TEXT_CHARS - 1).join('');

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      { path: 'app/Long.php', startLine: 1, endLine: 1, excerpt, cut: 'line-cut' },
      { path: 'app/Long.php', startLine: 1, endLine: 1, excerpt: shorter, cut: 'line-cut' },
    ]);

    // Assert
    expect(verdicts).toEqual([{ verification: 'cited' }, { verification: 'broken', reason: 'excerpt-mismatch' }]);
  });

  // Not a scenario (Stryker survivors, 9.4): only a `line-cut` citation is shortened, and U+FFFF is one
  // UTF-16 unit, not half a pair.
  it('compares an uncut citation over the limit whole, and cuts a line of U+FFFF by code points', async () => {
    // Arrange
    const long = 'y'.repeat(MAX_EVIDENCE_TEXT_CHARS + 10);
    const bmpEdge = String.fromCharCode(0xffff).repeat(MAX_EVIDENCE_TEXT_CHARS + 10);
    const double = sourceOf({ 'app/Long.php': `${long}\n`, 'app/Edge.php': `${bmpEdge}\n` });

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      { path: 'app/Long.php', startLine: 1, endLine: 1, excerpt: long },
      { path: 'app/Edge.php', startLine: 1, endLine: 1, excerpt: bmpEdge.slice(0, MAX_EVIDENCE_TEXT_CHARS), cut: 'line-cut' },
    ]);

    // Assert
    expect(verdicts).toEqual([{ verification: 'cited' }, { verification: 'cited' }]);
  });

  it('A cut span whose original range leaves the file is broken', async () => {
    // Arrange: 12 lines; the sanitisation kept lines 1–10 of a range that ended at 15 (or at 12).
    const content = numbered('app/Cut.php', 12);
    const double = sourceOf({ 'app/Cut.php': content });
    const cut = { path: 'app/Cut.php', startLine: 1, endLine: 10, excerpt: linesOf(content, 1, 10), cut: 'lines' as const };

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      { ...cut, originalEndLine: 15 },
      { ...cut, originalEndLine: 12 },
    ]);

    // Assert
    expect(verdicts).toEqual([{ verification: 'broken', reason: 'range-out-of-file' }, { verification: 'cited' }]);
  });

  it('A last line without a final line feed matches', async () => {
    // Arrange: 12 lines with no line feed after line 12, and an empty file.
    const content = numbered('app/Tail.php', 12).slice(0, -1);
    const double = sourceOf({ 'app/Tail.php': content, 'app/Empty.php': '' });

    // Act
    const verdicts = await verifyCitations(double.source, ROOT, C, [
      citation('app/Tail.php', content, 10, 12),
      { path: 'app/Tail.php', startLine: 10, endLine: 13, excerpt: linesOf(content, 10, 13) },
      { path: 'app/Empty.php', startLine: 1, endLine: 1, excerpt: '' },
    ]);

    // Assert
    expect(verdicts).toEqual([
      { verification: 'cited' },
      { verification: 'broken', reason: 'range-out-of-file' },
      { verification: 'cited' },
    ]);
  });
});
