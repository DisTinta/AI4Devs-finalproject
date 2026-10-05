import { describe, expect, it } from 'vitest';
import { REDACTION_MARKER, redactSecrets } from '@codemind/core';

// Spec: openspec/changes/security-gateway/specs/security-gateway/spec.md → "Secret redaction",
// scenario "Redaction time grows linearly on adversarial lines". The `describe` below is that
// scenario: each `it` is one of its input families, plus the n/4n scaling check. Timed cases only:
// kept out of Stryker (vitest.stryker.config.ts, design D14) because instrumented code is too slow for
// a wall-clock budget. Every secret-shaped literal is built by concatenation (design D8).

describe('Redaction time grows linearly on adversarial lines', () => {
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

  it('many lines of PEM body runs and consecutive form a blocks are scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    // Ten headers, each over 4k body lines (base64 and `Name: value`: ten form b blocks), then 10k form a blocks.
    const content = multiLine(40_000);
    const { ms, events } = timed(content);
    expect(content.length).toBeLessThan(5_000_000);
    expect(events).toBe(10 + 10_000);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('one header over a 40k-line PEM body run is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const lines = [pemHeader()];
    for (let i = 0; i < 40_000; i++) lines.push(i % 2 === 0 ? 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnz' : 'Proc-Type: 4,ENCRYPTED');
    lines.push('echo 1;');
    const { ms, events } = timed(lines.join('\n'));
    expect(events).toBe(1);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line of single-line blocks sharing their dashes is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    // Each header begins on the last five dashes of the previous closing (design D3).
    const content = pemHeader() + ('\\nQUFB\\n' + pemFooter().slice(0, -5) + pemHeader()).repeat(20_000) + '\\nQUFB\\n' + pemFooter();
    const start = performance.now();
    const result = redactSecrets({ path: 'x', content });
    const ms = performance.now() - start;
    expect(result.events).toHaveLength(20_001);
    expect(result.file.content).toBe(REDACTION_MARKER.repeat(20_001));
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it('a very long line alternating all four rules is scanned in linear time', { timeout: LINEAR_BUDGET_MS }, () => {
    const content = allRules(40_000);
    const { ms, events } = timed(content);
    expect(content.length).toBeLessThan(5_000_000);
    expect(events).toBe(4 * 40_000);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });
});

const DISTINCT = 'aB3dE5gH7jK9mN1pQ2sT4vW6yZ8';

/** `n` units of one JWT, one AWS key, one high-entropy assignment and one header without a closing. */
function allRules(n: number): string {
  const unit = 'ey' + 'Ja.b.c ' + 'AK' + 'IA' + 'Z'.repeat(16) + ` $to${'ken'} = '${DISTINCT}'; ` + pemHeader() + ' ';
  return unit.repeat(n);
}

/** Ten headers, each over `n / 10` PEM body lines, a plain line, then `n / 4` consecutive multiline blocks. */
function multiLine(n: number): string {
  const lines: string[] = [];
  for (let header = 0; header < 10; header++) {
    lines.push(pemHeader());
    for (let i = 0; i < n / 10; i++) lines.push(i % 2 === 0 ? 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnz' : 'Proc-Type: 4,ENCRYPTED');
  }
  lines.push('echo 1;');
  for (let i = 0; i < n / 4; i++) {
    lines.push(pemHeader('RSA '), 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnz', 'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==', pemFooter('RSA '));
  }
  return lines.join('\n');
}

function pemHeader(label = ''): string {
  return '-----' + 'BEGIN ' + label + 'PRIVATE ' + 'KEY-----';
}

function pemFooter(label = ''): string {
  return '-----' + 'END ' + label + 'PRIVATE ' + 'KEY-----';
}
