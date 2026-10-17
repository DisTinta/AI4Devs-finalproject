import { describe, expect, it } from 'vitest';
import { answerFromCache, isCacheable, parseStoredResponse, toStoredResponse, UNKNOWN_REASONS, unknown } from '@codemind/core';
import type { ExplainAnswer, StoredExplain } from '@codemind/core';
import { CACHED_FILE_ID, cachedAnswer, cachedNoEvidence } from '../../support/cached-answer';

// Spec: openspec/changes/evaluation-cache/specs/answer-cache/spec.md → "Cacheable answers", "Stored
// response" and "Answer of a cache hit" (DIS-21 design C2, decisions D4, D5, D7).

/** A stored answer of `cachedAnswer()` with its events, as `explain` returns it. */
function storedAnswer(overrides: Parameters<typeof cachedAnswer>[0] = {}): StoredExplain {
  return { ...cachedAnswer(overrides), events: [] };
}

describe('Requirement: Cacheable answers', () => {
  it('Only stored current answers and no-evidence unknowns are cacheable', () => {
    // Arrange
    const [statement] = cachedAnswer().statements;
    const twoCurrent = storedAnswer({ statements: [statement!, { ...statement!, text: 'second statement' }] });
    const oneStale = storedAnswer({
      statements: [statement!, { ...statement!, type: 'INFERENCE', status: 'stale', warning: 'stale-evidence' }],
    });
    const unsaved: ExplainAnswer = { ...storedAnswer(), persisted: false };
    const unknowns = UNKNOWN_REASONS.map((reason) => unknown(reason));

    // Act
    const answered = [twoCurrent, oneStale, unsaved].map(isCacheable);
    const byReason = Object.fromEntries(unknowns.map((answer) => [answer.reason, isCacheable(answer)]));

    // Assert
    expect(answered).toEqual([true, false, false]);
    expect(byReason).toEqual({
      'no-anchor': false,
      'llm-required': false,
      'over-budget': false,
      'invalid-model-output': false,
      'no-evidence': true,
      'broken-evidence': false,
    });
  });
});

describe('Requirement: Stored response', () => {
  it('A stored response keeps the answer without its events', () => {
    // Arrange
    const answer: StoredExplain = {
      ...cachedAnswer(),
      events: [
        { type: 'untrusted_content_flagged', source: 'question', pattern: 'ignore-instructions' },
        { type: 'query_not_logged', code: 'store-write-failed' },
      ],
    };
    const negative: StoredExplain = {
      ...cachedAnswer({
        priorClaims: [
          {
            id: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6',
            text: 'An older statement.',
            type: 'INFERENCE',
            status: 'current',
            evidence: [
              { id: '1e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7', fileId: CACHED_FILE_ID, path: 'app/Services/PriceCalculator.php', startLine: 25, endLine: 35, excerpt: null },
            ],
          },
        ],
      }),
      events: [],
    };
    negative.usage = { ...negative.usage, savingsPct: -25 };

    // Act
    const roundTrip = JSON.parse(JSON.stringify(toStoredResponse(answer))) as unknown;
    const checked = parseStoredResponse(roundTrip);
    const checkedNegative = parseStoredResponse(JSON.parse(JSON.stringify(toStoredResponse(negative))));

    // Assert: `answer` is `cachedAnswer()` with events, so its stored response is `cachedAnswer()` again.
    expect(roundTrip).toStrictEqual(cachedAnswer());
    expect(checked).toStrictEqual(cachedAnswer());
    expect(checkedNegative).toEqual(toStoredResponse(negative));
  });

  it('A no-evidence unknown is stored without events', () => {
    // Arrange
    const answer = unknown('no-evidence', [{ type: 'untrusted_content_flagged', source: 'question', pattern: 'role-override' }]);

    // Act
    const stored = toStoredResponse(answer);

    // Assert
    expect(stored).toStrictEqual({ kind: 'unknown', answer: 'UNKNOWN', reason: 'no-evidence', statements: [], evidence: [] });
    expect(stored).toStrictEqual(cachedNoEvidence());
    expect(parseStoredResponse(JSON.parse(JSON.stringify(stored)))).toStrictEqual(stored);
  });

  it('Invalid stored responses are rejected without leaking', () => {
    // Arrange
    const SENTINEL = 'SENTINEL-cached-answer-5c2f';
    const valid = (): Record<string, unknown> => ({ ...cachedAnswer({ answer: SENTINEL }) });
    const [statement] = cachedAnswer().statements;
    const [evidence] = cachedAnswer().evidence;
    const withoutUsage = valid();
    delete withoutUsage.usage;
    const invalid: unknown[] = [
      null,
      'x',
      { ...valid(), debug: SENTINEL },
      { ...valid(), events: [] },
      { ...valid(), persisted: false },
      { ...valid(), statements: [{ ...statement!, type: 'INFERENCE', status: 'stale', warning: 'stale-evidence' }] },
      { ...valid(), statements: [{ ...statement!, evidenceIds: ['00000000-0000-4000-8000-000000000000'] }] },
      { ...valid(), evidence: [{ ...evidence!, excerpt: null }] },
      withoutUsage,
      { ...valid(), usage: { ...cachedAnswer().usage, cacheHit: true } },
      { ...cachedNoEvidence(), reason: 'llm-required' },
      { ...cachedNoEvidence(), message: SENTINEL },
    ];

    // Act
    const results = invalid.map((value) => parseStoredResponse(value));

    // Assert
    expect(results).toEqual(invalid.map(() => undefined));
    expect(JSON.stringify(results)).not.toContain(SENTINEL);
  });

  // Not a scenario: the boundaries of the stored-response check (design C2), added after the mutation run.
  it('checks every line range, every cited id and the stale warning of prior claims', () => {
    // Arrange
    const [statement] = cachedAnswer().statements;
    const [evidence] = cachedAnswer().evidence;
    const other = { ...evidence!, id: '9c8b7a65-4d3e-4f21-8a0b-c1d2e3f4a5b6' };
    const prior = (overrides: Record<string, unknown>) =>
      cachedAnswer({
        priorClaims: [{ id: 'c1', text: null, type: 'INFERENCE', status: 'current', evidence: [{ ...evidence!, excerpt: null }], ...overrides }] as never,
      });
    const accepted = [
      cachedAnswer({ evidence: [{ ...evidence!, startLine: 16, endLine: 16 }] }),
      cachedAnswer({ statements: [statement!, { ...statement!, evidenceIds: [other.id] }], evidence: [evidence!, other] }),
      prior({ status: 'stale', warning: 'stale-evidence', type: 'FACT' }),
      prior({ type: 'UNKNOWN' }),
    ];
    const rejected = [
      cachedAnswer({ evidence: [{ ...evidence!, startLine: 16, endLine: 15 }] }),
      cachedAnswer({ evidence: [{ ...evidence!, startLine: 0 }] }),
      cachedAnswer({ statements: [{ ...statement!, evidenceIds: [evidence!.id, other.id] }] }),
      cachedAnswer({ statements: [statement!, { ...statement!, evidenceIds: [other.id] }] }),
      cachedAnswer({ statements: [] }),
      cachedAnswer({ statements: [{ ...statement!, evidenceIds: [] }] }),
      cachedAnswer({ confidence: 1 }),
      cachedAnswer({ confidence: 0 }),
      cachedAnswer({ usage: { ...cachedAnswer().usage, costUsd: -1 } }),
      cachedAnswer({ usage: { ...cachedAnswer().usage, inputTokens: 1.5 } }),
      prior({ status: 'stale' }),
      prior({ warning: 'stale-evidence' }),
      prior({ evidence: [{ ...evidence!, endLine: 1 }] }),
      { ...cachedNoEvidence(), statements: [statement] },
      { ...cachedNoEvidence(), answer: 'No sé.' },
      { ...cachedNoEvidence(), kind: 'other' },
    ];

    // Act / Assert
    for (const value of accepted) expect(parseStoredResponse(JSON.parse(JSON.stringify(value)))).toStrictEqual(value);
    expect(rejected.map((value) => parseStoredResponse(value))).toEqual(rejected.map(() => undefined));
  });
});

describe('Requirement: Answer of a cache hit', () => {
  it('A hit carries the stored answer and the usage of this call', () => {
    // Arrange
    const stored = cachedAnswer();
    const withoutBaseline = cachedAnswer({ usage: { ...cachedAnswer().usage, baselineTokens: 0 } });

    // Act
    const hit = answerFromCache(stored, 7);
    const hitWithoutBaseline = answerFromCache(withoutBaseline, 7);

    // Assert
    expect(hit.kind === 'answered' && hit.usage).toStrictEqual({
      inputTokens: 0,
      outputTokens: 0,
      baselineTokens: 40000,
      baselineEstimator: 'chars-div-4',
      savingsPct: 100,
      costUsd: 0,
      latencyMs: 7,
      cacheHit: true,
      generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
    });
    expect(hitWithoutBaseline.kind === 'answered' && hitWithoutBaseline.usage).toMatchObject({ baselineTokens: 0, savingsPct: 0 });
    for (const [answer, source] of [
      [hit, stored],
      [hitWithoutBaseline, withoutBaseline],
    ] as const) {
      expect(answer).toMatchObject({
        kind: 'answered',
        persisted: true,
        answer: source.answer,
        statements: source.statements,
        evidence: source.evidence,
        priorClaims: source.priorClaims,
        confidence: source.confidence,
      });
      expect(answer.events).toStrictEqual([]);
    }
  });

  it('A cached unknown is answered without usage', () => {
    // Act
    const hit = answerFromCache(cachedNoEvidence(), 7);

    // Assert
    expect(hit).toStrictEqual({ kind: 'unknown', answer: 'UNKNOWN', reason: 'no-evidence', statements: [], evidence: [], events: [] });
  });
});
