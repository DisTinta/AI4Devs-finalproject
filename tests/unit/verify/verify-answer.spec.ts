import { describe, expect, it } from 'vitest';
import { evidenceIdAt, MAX_EVIDENCE_TEXT_CHARS, sanitizeForPrompt, TRUNCATION_LINE_CUT_MARK, verifyAnswer } from '@codemind/core';
import type { ContextSpan, SanitizedSpan, TypedStatement } from '@codemind/core';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';

// Extra unit tests of `verifyAnswer` (DIS-68 design V11), beyond the scenarios of
// openspec/changes/evidence-verifier-syntactic/specs/evidence-verification/spec.md: how a sanitised
// span maps to a citation (its cut), the evidence-id order of the check and of the events, one event
// per broken id, and that only cited spans are read.

const ROOT = '/repos/acme';
const C = 'c'.repeat(40);

/** A whole-file span of `path` over `content`, as the pack cuts it (no trailing line feed). */
function wholeFile(path: string, content: string, origin: ContextSpan['origin'] = 'anchor'): ContextSpan {
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return {
    path,
    fileId: '00000000-0000-4000-8000-000000000001',
    fileKind: 'source',
    startLine: 1,
    endLine: lines.length,
    text: lines.join('\n'),
    tokens: 1,
    distance: 0,
    origin,
  };
}

/** The sanitised spans of `spans`, by prompt id, as `buildPrompt` maps them. */
function spanMap(spans: readonly ContextSpan[]): Map<string, SanitizedSpan> {
  return new Map(sanitizeForPrompt('q', spans).spans.map((span, i) => [evidenceIdAt(i), span]));
}

/** A statement citing `ids`, typed as the typing rule would for anchor spans. */
function statement(text: string, ids: string[], spanOf: ReadonlyMap<string, SanitizedSpan>): TypedStatement {
  return {
    text,
    type: 'FACT',
    spans: ids.map((id) => spanOf.get(id) as SanitizedSpan) as [SanitizedSpan, ...SanitizedSpan[]],
    evidenceIds: ids as [string, ...string[]],
  };
}

describe('verifyAnswer', () => {
  it('maps the cut of each sanitised span to its citation: none, lines and line-cut', async () => {
    // Arrange: a short file; a CRLF file cut at a line boundary; one long line cut inside it.
    const plain = '<?php\nclass A {}\n';
    const crlf = Array.from({ length: 100 }, (_, i) => `${`// line ${i + 1}`.padEnd(100, '.')}\r\n`).join('');
    const long = `${'x'.repeat(MAX_EVIDENCE_TEXT_CHARS + 50)}\n`;
    const spanOf = spanMap([wholeFile('app/A.php', plain), wholeFile('app/Crlf.php', crlf), wholeFile('app/Long.php', long)]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': plain, 'app/Crlf.php': crlf, 'app/Long.php': long } } });
    const statements = [statement('S1', ['E1', 'E2', 'E3'], spanOf)];

    // Act
    const verified = await verifyAnswer(source.source, ROOT, C, statements, spanOf);

    // Assert: the fixture really holds the three kinds of span.
    expect(spanOf.get('E1')?.truncation).toBeUndefined();
    expect(spanOf.get('E2')?.truncation?.mark).not.toBe(TRUNCATION_LINE_CUT_MARK);
    expect(spanOf.get('E2')?.truncation).toBeDefined();
    expect(spanOf.get('E3')?.truncation?.mark).toBe(TRUNCATION_LINE_CUT_MARK);
    expect(verified).toEqual({ statements, events: [] });
  });

  it('checks distinct ids and builds their events in evidence-id order, E2 before E10', async () => {
    // Arrange: eleven files; the verification read finds every one changed, so every citation breaks.
    const paths = Array.from({ length: 11 }, (_, i) => `app/F${i + 1}.php`);
    const spanOf = spanMap(paths.map((path) => wholeFile(path, `<?php // ${path}\n`)));
    const changed = Object.fromEntries(paths.map((path) => [path, `<?php // changed ${path}\n`]));
    const source = createInMemorySourceTree({ [ROOT]: { [C]: changed } });
    const statements = [statement('S1', ['E10', 'E2'], spanOf), statement('S2', ['E11', 'E1', 'E2'], spanOf)];

    // Act
    const verified = await verifyAnswer(source.source, ROOT, C, statements, spanOf);

    // Assert
    expect(source.batchReads.map((read) => read.paths)).toEqual([['app/F1.php', 'app/F2.php', 'app/F10.php', 'app/F11.php']]);
    expect(verified.events.map((event) => event.evidenceId)).toEqual(['E1', 'E2', 'E10', 'E11']);
    expect(verified.statements).toEqual([]);
  });

  it('builds one evidence_broken event per broken id, even when two statements cite it', async () => {
    // Arrange: E2's file changed between the pack's read and the verification read.
    const a = '<?php\nclass A {}\n';
    const b = '<?php\nclass B {}\n';
    const spanOf = spanMap([wholeFile('app/A.php', a), wholeFile('app/B.php', b, 'heuristic')]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': a, 'app/B.php': '<?php\nclass B2 {}\n' } } });
    const statements = [statement('S1', ['E2', 'E1'], spanOf), statement('S2', ['E2'], spanOf), statement('S3', ['E1', 'E2'], spanOf)];

    // Act
    const verified = await verifyAnswer(source.source, ROOT, C, statements, spanOf);

    // Assert
    expect(verified.events).toEqual([
      { type: 'evidence_broken', evidenceId: 'E2', path: 'app/B.php', startLine: 1, endLine: 2, reason: 'excerpt-mismatch' },
    ]);
    expect(verified.statements.map((kept) => [kept.text, kept.evidenceIds])).toEqual([
      ['S1', ['E1']],
      ['S3', ['E1']],
    ]);
  });

  it('reads only the cited spans: an uncited span is not in the batch', async () => {
    // Arrange: E2 is in the pack but no statement cites it, and its file is not even readable.
    const a = '<?php\nclass A {}\n';
    const spanOf = spanMap([wholeFile('app/A.php', a), wholeFile('app/Uncited.php', '<?php\n')]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': a } } });

    // Act
    const verified = await verifyAnswer(source.source, ROOT, C, [statement('S1', ['E1'], spanOf)], spanOf);

    // Assert
    expect(source.batchReads).toEqual([{ root: ROOT, commit: C, paths: ['app/A.php'] }]);
    expect(source.calls.readFileAt).toBe(0);
    expect(verified.events).toEqual([]);
  });
});
