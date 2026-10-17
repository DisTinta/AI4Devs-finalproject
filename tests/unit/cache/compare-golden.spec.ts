import { describe, expect, it } from 'vitest';
import type { AnswerEvidence, AnswerStatement, ExplainAnswer, StoredAnswer, UnknownReason } from '@codemind/core';
import { compareGolden, renderDifference } from '../../../packages/cli/src/cache/compare-golden';
import { cachedAnswer, CACHED_EVIDENCE_ID, CACHED_FILE_ID } from '../../support/cached-answer';

// Spec: openspec/changes/verify-smoke/specs/verify-smoke/spec.md → "Golden answers are compared on
// structure only". Each `it` named after a scenario is that scenario; the others are extra cases. The
// golden and served responses are built from `tests/support/cached-answer.ts` (design C10).

/** `answer` as the cache serves it: with no events and `usage.cacheHit` true. */
function servedFrom(answer: StoredAnswer, cacheHit = true): ExplainAnswer {
  return { ...answer, events: [], usage: { ...answer.usage, cacheHit } } as ExplainAnswer;
}

function unknownAnswer(reason: UnknownReason): ExplainAnswer {
  return { kind: 'unknown', answer: 'UNKNOWN', reason, statements: [], evidence: [], events: [] };
}

function statement(evidenceIds: string[], overrides: Partial<AnswerStatement> = {}): AnswerStatement {
  return { text: 'A statement.', type: 'FACT', status: 'current', verification: 'entailed', evidenceIds, ...overrides };
}

function evidence(id: string, path: string, startLine: number, endLine: number): AnswerEvidence {
  return { id, fileId: `file-${id}`, path, startLine, endLine, excerpt: `excerpt of ${path}` };
}

/** A golden response with two statements, the first citing `a.php:1-2` and the second `b.php:5-6`. */
function twoStatements(): StoredAnswer {
  return cachedAnswer({
    statements: [statement(['ea']), statement(['eb'], { type: 'INFERENCE', verification: 'cited' })],
    evidence: [evidence('ea', 'a.php', 1, 2), evidence('eb', 'b.php', 5, 6)],
  });
}

/** The rendered lines of the differences between `golden` and `served`. */
function lines(golden: StoredAnswer, served: ExplainAnswer): string[] {
  return compareGolden(golden, served).map(renderDifference);
}

describe('compareGolden', () => {
  it('Free text, ids and usage are not compared', () => {
    // Arrange
    const golden = cachedAnswer();
    const remapped = cachedAnswer({
      answer: 'Another answer text.',
      statements: [{ ...golden.statements[0], text: 'Another statement text.', evidenceIds: ['other-evidence-id'] }],
      evidence: [{ ...golden.evidence[0], id: 'other-evidence-id', fileId: 'other-file-id', excerpt: 'another excerpt' }],
      priorClaims: [
        {
          id: 'claim-1',
          text: 'A prior claim.',
          type: 'FACT',
          status: 'current',
          evidence: [{ id: 'prior-evidence', fileId: CACHED_FILE_ID, path: 'app/Other.php', startLine: 1, endLine: 2, excerpt: null }],
        },
      ],
      usage: {
        ...golden.usage,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 3,
        savingsPct: 100,
        generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      },
      confidence: 0.31,
    });
    expect(remapped.evidence[0].id).not.toBe(CACHED_EVIDENCE_ID);

    // Act
    const differences = compareGolden(golden, servedFrom(remapped));

    // Assert
    expect(differences).toEqual([]);
  });

  it('Count and span differences are listed in a fixed order', () => {
    // Arrange
    const golden = twoStatements();
    const base = twoStatements();
    const missingSecond = { ...base, statements: [base.statements[0]], evidence: [base.evidence[0]] };
    const citesFirst = { ...base, statements: [base.statements[0], { ...base.statements[1], evidenceIds: ['ea'] }] };
    const longerSpan = { ...base, evidence: [base.evidence[0], { ...base.evidence[1], endLine: 7 }] };

    // Act
    const a = lines(golden, servedFrom(missingSecond));
    const b = lines(golden, servedFrom(citesFirst));
    const c = lines(golden, servedFrom(longerSpan));
    const d = lines(golden, servedFrom(base, false));
    const e = lines(golden, unknownAnswer('no-anchor'));

    // Assert
    expect(a).toEqual(['statements: expected 2 items, got 1', 'evidence: expected 2 items, got 1']);
    expect(b).toEqual(['statements[1].evidence: expected ["b.php:5-6"], got ["a.php:1-2"]']);
    expect(c).toEqual(['statements[1].evidence: expected ["b.php:5-6"], got ["b.php:5-7"]', 'evidence[1].endLine: expected 6, got 7']);
    expect(d).toEqual(['usage.cacheHit: expected true, got false']);
    expect(e).toEqual(['expected an answer from the golden cache, got UNKNOWN (no-anchor)']);
  });

  it('reports a cache miss with the db:seed hint and nothing else', () => {
    expect(lines(twoStatements(), unknownAnswer('llm-required'))).toEqual([
      'expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed',
    ]);
    expect(compareGolden(twoStatements(), unknownAnswer('llm-required'))).toEqual([{ kind: 'unknown', reason: 'llm-required' }]);
  });

  it('reports a different type, verification and status of a statement, in that order', () => {
    // Arrange
    const golden = twoStatements();
    const base = twoStatements();
    const served = {
      ...base,
      statements: [base.statements[0], { ...base.statements[1], type: 'FACT', verification: 'entailed', status: 'stale' }],
    } as StoredAnswer;

    // Act
    const result = lines(golden, servedFrom(served));

    // Assert
    expect(result).toEqual([
      'statements[1].type: expected "INFERENCE", got "FACT"',
      'statements[1].verification: expected "cited", got "entailed"',
      'statements[1].status: expected "current", got "stale"',
    ]);
  });

  it('reports a different path and start line of an evidence entry, every difference of a cache miss aside', () => {
    // Arrange
    const golden = twoStatements();
    const base = twoStatements();
    const served = { ...base, evidence: [{ ...base.evidence[0], path: 'c.php', startLine: 3 }, base.evidence[1]] };

    // Act
    const result = lines(golden, servedFrom(served, false));

    // Assert
    expect(result).toEqual([
      'usage.cacheHit: expected true, got false',
      'statements[0].evidence: expected ["a.php:1-2"], got ["c.php:3-2"]',
      'evidence[0].path: expected "a.php", got "c.php"',
      'evidence[0].startLine: expected 1, got 3',
    ]);
  });

  it('reports more served items than golden ones, and leaves out a cited id with no evidence entry', () => {
    // Arrange
    const golden = cachedAnswer({ statements: [statement(['ea', 'missing'])], evidence: [evidence('ea', 'a.php', 1, 2)] });
    const base = twoStatements();

    // Act
    const result = lines(golden, servedFrom(base));

    // Assert
    expect(result).toEqual(['statements: expected 1 items, got 2', 'evidence: expected 1 items, got 2']);
  });

  it('renders a value holding a control character as its escaped literal', () => {
    // Arrange
    const golden = cachedAnswer({ evidence: [{ ...cachedAnswer().evidence[0], path: 'a\u001b[31m.php' }] });

    // Act
    const result = lines(golden, servedFrom(cachedAnswer()));

    // Assert
    expect(result).toContain('evidence[0].path: expected "a\\u001b[31m.php", got "app/Services/PriceCalculator.php"');
    expect(result.join('\n')).not.toContain('\u001b');
  });
});
