import { describe, expect, it } from 'vitest';
import { redactSecrets } from '@codemind/core';

// Spec: openspec/changes/security-gateway/specs/security-gateway/spec.md → "Secret redaction",
// scenario "Redaction time grows linearly on adversarial lines", its n/4n clause. In a file of its own
// so the large inputs of secret-scanner.linear.spec.ts do not share its heap, and kept out of Stryker
// (vitest.stryker.config.ts, design D14). Every secret-shaped literal is built by concatenation.
//
// The measure (design D15): one warm-up call per size, then 5 runs of each size alternating n, 4n,
// n, 4n…, and the minimum of each size. The minimum drops garbage-collector pauses and CPU stolen by
// other test files running at the same time on the CI runner; alternating spreads any such slowdown
// over both sizes. Linear gives about 4, quadratic about 16; the limit is 8. The times are always
// printed, pass or fail, so the CI log keeps them.

const RUNS_PER_SIZE = 5;
const MAX_RATIO = 8;
const BUDGET_MS = 2000;

function time(content: string): number {
  const start = performance.now();
  redactSecrets({ path: 'x', content });
  return performance.now() - start;
}

function checkScaling(name: string, build: (n: number) => string, n: number): void {
  const small = build(n);
  const large = build(4 * n);
  expect(large.length).toBeLessThan(5_000_000);
  time(small);
  time(large);
  const smallTimes: number[] = [];
  const largeTimes: number[] = [];
  for (let run = 0; run < RUNS_PER_SIZE; run++) {
    smallTimes.push(time(small));
    largeTimes.push(time(large));
  }
  const tSmall = Math.min(...smallTimes);
  const tLarge = Math.min(...largeTimes);
  const ratio = tLarge / tSmall;
  const fmt = (times: number[]): string => times.map((t) => t.toFixed(1)).join(' / ');
  console.log(
    `[scaling] ${name}: n=${n} [${fmt(smallTimes)}] ms, 4n [${fmt(largeTimes)}] ms, min ${tSmall.toFixed(1)} / ${tLarge.toFixed(1)} ms, ratio ${ratio.toFixed(2)}`,
  );
  expect(ratio).toBeLessThan(MAX_RATIO);
  expect(tLarge).toBeLessThan(BUDGET_MS);
}

describe('Redaction time grows linearly on adversarial lines: n/4n scaling', () => {
  // n is sized so one call takes at least ~50 ms locally (timer noise), and 4n stays under ~5 MB
  // (above that the garbage collector skews the ratio; design D3).
  it('four times the input takes less than eight times as long', { timeout: 10 * BUDGET_MS }, () => {
    checkScaling('four rules', allRules, 10_000);
  });

  it('four times the shared-dash chain takes less than eight times as long', { timeout: 10 * BUDGET_MS }, () => {
    checkScaling('shared-dash chain', sharedDashChain, 22_000);
  });
});

const DISTINCT = 'aB3dE5gH7jK9mN1pQ2sT4vW6yZ8';

/** `n` units of one JWT, one AWS key, one high-entropy assignment and one header without a closing. */
function allRules(n: number): string {
  const unit = 'ey' + 'Ja.b.c ' + 'AK' + 'IA' + 'Z'.repeat(16) + ` $to${'ken'} = '${DISTINCT}'; ` + pemHeader() + ' ';
  return unit.repeat(n);
}

/** `n + 1` single-line blocks on one line, each header beginning on the previous closing's last five dashes. */
function sharedDashChain(n: number): string {
  return pemHeader() + ('\\nQUFB\\n' + pemFooter().slice(0, -5) + pemHeader()).repeat(n) + '\\nQUFB\\n' + pemFooter();
}

function pemHeader(label = ''): string {
  return '-----' + 'BEGIN ' + label + 'PRIVATE ' + 'KEY-----';
}

function pemFooter(label = ''): string {
  return '-----' + 'END ' + label + 'PRIVATE ' + 'KEY-----';
}
