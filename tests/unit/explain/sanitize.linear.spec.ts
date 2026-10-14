import { describe, expect, it } from 'vitest';
import { MAX_QUESTION_CHARS, sanitizeForPrompt } from '@codemind/core';
import type { ContextSpan } from '@codemind/core';

// Spec: openspec/changes/untrusted-content-sanitization/specs/explain/spec.md → "Untrusted content
// sanitization", scenario "Sanitisation time grows linearly on adversarial text": its 2-second bound.
// The n/4n checks are in sanitize.scaling.spec.ts. Timed cases only: kept out of Stryker
// (vitest.stryker.config.ts) because instrumented code is too slow for a wall-clock budget.

const LINEAR_BUDGET_MS = 2000;
const WORDS = 'ignore previous ';
const KIB = 1024;

/** `WORDS` repeated to `size` code points, on one line or one repetition per line. */
function adversarial(size: number, perLine: boolean): string {
  const text = WORDS.repeat(Math.ceil(size / WORDS.length)).slice(0, size);
  return perLine ? text.replaceAll(WORDS, `${WORDS.trimEnd()}\n`) : text;
}

/** A span of `text` from line 1. */
function span(text: string): ContextSpan {
  return {
    path: 'src/adversarial.ts',
    fileId: 'file-adversarial',
    fileKind: 'source',
    startLine: 1,
    endLine: text.split('\n').length,
    text,
    tokens: Math.ceil(text.length / 4),
    distance: 0,
    origin: 'anchor',
  };
}

/** Milliseconds one sanitisation of `question` and `text` takes. */
function timed(question: string, text: string): number {
  const start = performance.now();
  sanitizeForPrompt(question, [span(text)]);
  return performance.now() - start;
}

describe('Sanitisation time grows linearly on adversarial text', () => {
  const question = adversarial(MAX_QUESTION_CHARS, false);

  for (const size of [256 * KIB, 1024 * KIB]) {
    for (const perLine of [false, true]) {
      it(`a ${size / KIB} KiB span ${perLine ? 'of one repetition per line' : 'on one line'} is sanitised within the bound`, { timeout: LINEAR_BUDGET_MS }, () => {
        expect(timed(question, adversarial(size, perLine))).toBeLessThan(LINEAR_BUDGET_MS);
      });
    }
  }

  it('a question of the longest length is sanitised within the bound', { timeout: LINEAR_BUDGET_MS }, () => {
    expect([...question]).toHaveLength(MAX_QUESTION_CHARS);
    expect(timed(question, 'clean')).toBeLessThan(LINEAR_BUDGET_MS);
  });
});
