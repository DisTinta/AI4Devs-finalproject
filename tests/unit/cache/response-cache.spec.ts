import { describe, expect, it } from 'vitest';
import { isCacheable, UNKNOWN_REASONS, unknown } from '@codemind/core';
import type { ExplainAnswer, StoredExplain } from '@codemind/core';
import { cachedAnswer } from '../../support/cached-answer';

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
