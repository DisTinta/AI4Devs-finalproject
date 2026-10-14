import { describe, expect, it } from 'vitest';
import { sanitizeForPrompt } from '@codemind/core';
import type { ContextSpan } from '@codemind/core';

// Spec: openspec/changes/untrusted-content-sanitization/specs/explain/spec.md → "Untrusted content
// sanitization", scenario "Sanitisation time grows linearly on adversarial text", its n/4n clauses.
// In a file of its own so the large inputs of sanitize.linear.spec.ts do not share its heap, and kept
// out of Stryker (vitest.stryker.config.ts).
//
// The measure follows secret-scanner.scaling.spec.ts: one warm-up call per size, then 5 runs of each
// size alternating, and the minimum of each size (it drops garbage-collector pauses and CPU stolen by
// other test files). Linear gives about 4, quadratic about 16; the limit is 8. Above the limit the cut
// bounds the work, so the check below the limit (2,000 vs 8,000 code points, not cut) is the one that
// measures the matcher; each of its runs is a loop of 100 calls, so it is above timer noise. The times
// are always printed, pass or fail, so the CI log keeps them.

const RUNS_PER_SIZE = 5;
const MAX_RATIO = 8;
const BUDGET_MS = 2000;
const WORDS = 'ignore previous ';
const KIB = 1024;

/** `WORDS` repeated to `size` code points on one line. */
function adversarial(size: number): string {
  return WORDS.repeat(Math.ceil(size / WORDS.length)).slice(0, size);
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

/** Milliseconds `calls` sanitisations of `spans` take. */
function time(spans: ContextSpan[], calls: number): number {
  const start = performance.now();
  for (let call = 0; call < calls; call++) sanitizeForPrompt('q', spans);
  return performance.now() - start;
}

function checkScaling(name: string, small: ContextSpan[], large: ContextSpan[], calls: number): void {
  time(small, calls);
  time(large, calls);
  const smallTimes: number[] = [];
  const largeTimes: number[] = [];
  for (let run = 0; run < RUNS_PER_SIZE; run++) {
    smallTimes.push(time(small, calls));
    largeTimes.push(time(large, calls));
  }
  const tSmall = Math.min(...smallTimes);
  const tLarge = Math.min(...largeTimes);
  const ratio = tLarge / tSmall;
  const fmt = (times: number[]): string => times.map((t) => t.toFixed(1)).join(' / ');
  console.log(
    `[scaling] ${name}: n [${fmt(smallTimes)}] ms, 4n [${fmt(largeTimes)}] ms, min ${tSmall.toFixed(1)} / ${tLarge.toFixed(1)} ms, ratio ${ratio.toFixed(2)}`,
  );
  expect(ratio).toBeLessThan(MAX_RATIO);
  expect(tLarge).toBeLessThan(BUDGET_MS);
}

describe('Sanitisation time grows linearly on adversarial text', () => {
  it('a 1 MiB span takes less than eight times as long as a 256 KiB one', { timeout: 10 * BUDGET_MS }, () => {
    checkScaling('256 KiB vs 1 MiB, one line', [span(adversarial(256 * KIB))], [span(adversarial(1024 * KIB))], 1);
  });

  it('a 1 MiB span of one repetition per line takes less than eight times as long as a 256 KiB one', { timeout: 10 * BUDGET_MS }, () => {
    const perLine = (size: number): ContextSpan => span(adversarial(size).replaceAll(WORDS, `${WORDS.trimEnd()}\n`));
    checkScaling('256 KiB vs 1 MiB, one per line', [perLine(256 * KIB)], [perLine(1024 * KIB)], 1);
  });

  it('below the limit, an 8,000 code-point line takes less than eight times as long as a 2,000 one', { timeout: 10 * BUDGET_MS }, () => {
    checkScaling('2,000 vs 8,000 code points', [span(adversarial(2_000))], [span(adversarial(8_000))], 100);
  });
});
