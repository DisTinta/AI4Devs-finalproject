import { describe, expect, it } from 'vitest';
import {
  buildVerifyMessages,
  createInMemoryVerificationCache,
  evidenceIdAt,
  MAX_EVIDENCE_TEXT_CHARS,
  sanitizeForPrompt,
  TRUNCATION_LINE_CUT_MARK,
  verifyAnswer,
} from '@codemind/core';
import type { ContextSpan, SanitizedSpan, SourceTreePort, TypedStatement } from '@codemind/core';
import { createInMemorySourceTree } from '../../support/in-memory-source-tree';
import { createScriptedLlm } from '../../support/scripted-llm';
import type { VerifyScript } from '../../support/scripted-llm';

// Extra unit tests of `verifyAnswer` (DIS-68 design V11), beyond the scenarios of
// openspec/changes/evidence-verifier-syntactic/specs/evidence-verification/spec.md: how a sanitised
// span maps to a citation (its cut), the evidence-id order of the check and of the events, one event
// per broken id, and that only cited spans are read. Since DIS-70 (design S6): the pairs of the semantic
// check, the order of the `entailment_unverified` events and no model call when everything is broken.

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

/** The collaborators of `verifyAnswer` over `source`: a live scripted model and a fresh cache. */
function collaborators(source: SourceTreePort, verify?: VerifyScript) {
  const model = createScriptedLlm('live', undefined, undefined, { verify });
  return { model, deps: { source, llm: model.llm, cache: createInMemoryVerificationCache() } };
}

const ZERO_USAGE = { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

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
    const verified = await verifyAnswer(collaborators(source.source).deps, ROOT, C, statements, spanOf);

    // Assert: the fixture really holds the three kinds of span.
    expect(spanOf.get('E1')?.truncation).toBeUndefined();
    expect(spanOf.get('E2')?.truncation?.mark).not.toBe(TRUNCATION_LINE_CUT_MARK);
    expect(spanOf.get('E2')?.truncation).toBeDefined();
    expect(spanOf.get('E3')?.truncation?.mark).toBe(TRUNCATION_LINE_CUT_MARK);
    expect(verified).toEqual({
      statements: statements.map((kept) => ({ ...kept, verification: 'entailed', evidenceVerifications: ['entailed', 'entailed', 'entailed'] })),
      events: [],
      usage: { ...ZERO_USAGE, calls: 3 },
    });
  });

  it('checks distinct ids and builds their events in evidence-id order, E2 before E10', async () => {
    // Arrange: eleven files; the verification read finds every one changed, so every citation breaks.
    const paths = Array.from({ length: 11 }, (_, i) => `app/F${i + 1}.php`);
    const spanOf = spanMap(paths.map((path) => wholeFile(path, `<?php // ${path}\n`)));
    const changed = Object.fromEntries(paths.map((path) => [path, `<?php // changed ${path}\n`]));
    const source = createInMemorySourceTree({ [ROOT]: { [C]: changed } });
    const statements = [statement('S1', ['E10', 'E2'], spanOf), statement('S2', ['E11', 'E1', 'E2'], spanOf)];

    // Act
    const verified = await verifyAnswer(collaborators(source.source).deps, ROOT, C, statements, spanOf);

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
    const verified = await verifyAnswer(collaborators(source.source).deps, ROOT, C, statements, spanOf);

    // Assert
    expect(verified.events).toEqual([
      { type: 'evidence_broken', evidenceId: 'E2', path: 'app/B.php', startLine: 1, endLine: 2, reason: 'excerpt-mismatch' },
    ]);
    expect(verified.statements.map((kept) => [kept.text, kept.evidenceIds])).toEqual([
      ['S1', ['E1']],
      ['S3', ['E1']],
    ]);
  });

  it('passes the original last line of a cut span, so a range past its file breaks even when cut', async () => {
    // Arrange: 100 lines of 100 characters; the graph says the symbol ends at line 105, so the pack
    // sliced lines 1–100 and the sanitisation cut them to the lines that fit the limit.
    const content = Array.from({ length: 100 }, (_, i) => `${`// line ${i + 1}`.padEnd(100, '.')}\n`).join('');
    const overrun: ContextSpan = { ...wholeFile('app/Over.php', content), endLine: 105 };
    const spanOf = spanMap([overrun]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/Over.php': content } } });
    const kept = spanOf.get('E1')!;

    // Act
    const verified = await verifyAnswer(collaborators(source.source).deps, ROOT, C, [statement('S1', ['E1'], spanOf)], spanOf);

    // Assert: the kept lines fit the file; only the original range does not.
    expect(kept.truncation?.originalEndLine).toBe(105);
    expect(kept.endLine).toBeLessThan(100);
    expect(verified.events).toEqual([
      { type: 'evidence_broken', evidenceId: 'E1', path: 'app/Over.php', startLine: 1, endLine: kept.endLine, reason: 'range-out-of-file' },
    ]);
  });

  it('reads only the cited spans: an uncited span is not in the batch', async () => {
    // Arrange: E2 is in the pack but no statement cites it, and its file is not even readable.
    const a = '<?php\nclass A {}\n';
    const spanOf = spanMap([wholeFile('app/A.php', a), wholeFile('app/Uncited.php', '<?php\n')]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': a } } });

    // Act
    const verified = await verifyAnswer(collaborators(source.source).deps, ROOT, C, [statement('S1', ['E1'], spanOf)], spanOf);

    // Assert
    expect(source.batchReads).toEqual([{ root: ROOT, commit: C, paths: ['app/A.php'] }]);
    expect(source.calls.readFileAt).toBe(0);
    expect(verified.events).toEqual([]);
  });

  it('checks each kept (statement, citation) pair in statement then citation order, with the span text and truncation mark', async () => {
    // Arrange: the three kinds of span of the first test.
    const plain = '<?php\nclass A {}\n';
    const crlf = Array.from({ length: 100 }, (_, i) => `${`// line ${i + 1}`.padEnd(100, '.')}\r\n`).join('');
    const long = `${'x'.repeat(MAX_EVIDENCE_TEXT_CHARS + 50)}\n`;
    const spanOf = spanMap([wholeFile('app/A.php', plain), wholeFile('app/Crlf.php', crlf), wholeFile('app/Long.php', long)]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': plain, 'app/Crlf.php': crlf, 'app/Long.php': long } } });
    const { model, deps } = collaborators(source.source);
    const statements = [statement('S1', ['E1', 'E2'], spanOf), statement('S2', ['E3', 'E1'], spanOf)];

    // Act
    await verifyAnswer(deps, ROOT, C, statements, spanOf);

    // Assert
    const expected = [['S1', 'E1'], ['S1', 'E2'], ['S2', 'E3'], ['S2', 'E1']].map(([text, id]) => {
      const span = spanOf.get(id!)!;
      const { path, startLine, endLine } = span;
      return buildVerifyMessages({ statement: text!, path, startLine, endLine, excerpt: span.text, truncationMark: span.truncation?.mark });
    });
    expect(model.requests.map((request) => request.purpose)).toEqual(['verify', 'verify', 'verify', 'verify']);
    expect(model.requests.map((request) => request.messages)).toEqual(expected);
    // One cut pair spelled out, independent of `buildVerifyMessages`: the span's own text, then its real mark.
    const cut = spanOf.get('E2')!;
    expect(JSON.parse(model.requests[1]!.messages[1]!.content)).toEqual({
      statement: '<<<UNTRUSTED_DATA statement>>>\nS1\n<<<END_UNTRUSTED_DATA statement>>>',
      evidence: {
        path: 'app/Crlf.php',
        startLine: 1,
        endLine: cut.endLine,
        text: `<<<UNTRUSTED_DATA evidence>>>\n${cut.text}\n${cut.truncation!.mark}\n<<<END_UNTRUSTED_DATA evidence>>>`,
      },
    });
  });

  it('puts the entailment_unverified events after the evidence_broken ones, indexed among the kept statements', async () => {
    // Arrange: E2's file changed, so S0 (citing only E2) is dropped and S1 becomes the first statement.
    const a = '<?php\nclass A {}\n';
    const b = '<?php\nclass B {}\n';
    const spanOf = spanMap([wholeFile('app/A.php', a), wholeFile('app/B.php', b)]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': a, 'app/B.php': '<?php\nclass B2 {}\n' } } });
    const { deps } = collaborators(source.source, () => 'yes');

    // Act
    const verified = await verifyAnswer(deps, ROOT, C, [statement('S0', ['E2'], spanOf), statement('S1', ['E1'], spanOf)], spanOf);

    // Assert
    expect(verified.events).toEqual([
      { type: 'evidence_broken', evidenceId: 'E2', path: 'app/B.php', startLine: 1, endLine: 2, reason: 'excerpt-mismatch' },
      { type: 'entailment_unverified', statementIndex: 0, evidenceId: 'E1', path: 'app/A.php', startLine: 1, endLine: 2, reason: 'invalid-output' },
    ]);
    expect(verified.statements.map((kept) => [kept.text, kept.type, kept.verification])).toEqual([['S1', 'INFERENCE', 'cited']]);
    expect(verified.usage).toEqual({ ...ZERO_USAGE, calls: 1 });
  });

  it('calls no model and counts no usage when every citation is broken', async () => {
    // Arrange
    const a = '<?php\nclass A {}\n';
    const spanOf = spanMap([wholeFile('app/A.php', a)]);
    const source = createInMemorySourceTree({ [ROOT]: { [C]: { 'app/A.php': '<?php\nclass A2 {}\n' } } });
    const { model, deps } = collaborators(source.source);

    // Act
    const verified = await verifyAnswer(deps, ROOT, C, [statement('S1', ['E1'], spanOf)], spanOf);

    // Assert
    expect(verified.statements).toEqual([]);
    expect(verified.usage).toEqual(ZERO_USAGE);
    expect(model.requests).toEqual([]);
  });
});
