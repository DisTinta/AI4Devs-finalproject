import { describe, expect, it } from 'vitest';
import { REDACTION_MARKER, redactSecrets } from '@codemind/core';

// Spec: openspec/changes/security-gateway/specs/security-gateway/spec.md → "Secret redaction", the
// linear-time clause. Timed cases only: kept out of Stryker (vitest.stryker.config.ts, design D14)
// because instrumented code is too slow for a wall-clock budget. Every secret-shaped literal is built
// by concatenation (design D8).

describe('secret scanner linear time', () => {
  // Linear time on adversarial input (spec "Secret redaction"; design D3). Each line is above 100k
  // characters, sized so the quadratic version took more than 10 s. Vitest cannot interrupt a
  // synchronous call, so the elapsed time is also asserted, with the same generous 2 s bound.
  const LINEAR_BUDGET_MS = 2000;
  const timed = (content: string): { ms: number; events: number } => {
    const start = performance.now();
    const { events } = redactSecrets({ path: 'x', content });
    return { ms: performance.now() - start, events: events.length };
  };

  it('a very long line of repeated keywords is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = `$${('sec' + 'ret').repeat(35_000)} = 'short';`;
    const { ms, events } = timed(content);
    expect(events).toBe(0);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line of repeated JWTs is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = ('ey' + 'Ja.').repeat(100_000);
    const { ms, events } = timed(content);
    expect(events).toBeGreaterThan(0);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line of repeated AWS keys is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = ('AK' + 'IA' + 'Z'.repeat(16) + ' ').repeat(20_000);
    const { ms, events } = timed(content);
    expect(events).toBe(20_000);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  /** `A `, `B `, …, `Z `, `AA `, …: a distinct label for each `i`, as `[A-Z ]*` allows. */
  const label = (i: number): string => {
    let name = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name + ' ';
  };

  it('a very long line of private key headers with distinct labels is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = Array.from({ length: 20_000 }, (_, i) => pemHeader(label(i))).join(' ');
    const { ms, events } = timed(content);
    expect(events).toBe(20_000);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line of distinct-label headers closed once at the end is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    // Headers before the closed one have no closing (one event each); the closed one swallows the rest.
    const headers = Array.from({ length: 20_000 }, (_, i) => pemHeader(label(i))).join(' ');
    const content = `${headers} ${pemFooter(label(10_000))}`;
    const start = performance.now();
    const result = redactSecrets({ path: 'x', content });
    const ms = performance.now() - start;
    expect(result.events).toHaveLength(10_001);
    expect(result.file.content.endsWith(REDACTION_MARKER)).toBe(true);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line alternating JWTs and AWS keys is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = ('ey' + 'Ja.b.c ' + 'AK' + 'IA' + 'Z'.repeat(16) + ' ').repeat(170_000);
    const { ms, events } = timed(content);
    expect(content.length).toBeGreaterThan(5_000_000);
    expect(events).toBe(340_000);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line of private key headers without a closing is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = (pemHeader() + ' ').repeat(20_000);
    const { ms, events } = timed(content);
    expect(events).toBe(20_000);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });
});

function pemHeader(label = ''): string {
  return '-----' + 'BEGIN ' + label + 'PRIVATE ' + 'KEY-----';
}

function pemFooter(label = ''): string {
  return '-----' + 'END ' + label + 'PRIVATE ' + 'KEY-----';
}
