import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkGoldenFile, readGoldenFile, renderGoldenFile } from '../../../packages/cli/src/cache/golden-file';
import { cachedAnswer, cachedNoEvidence } from '../../support/cached-answer';
import { goldenEntry, goldenFile } from '../../support/golden-file';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md → "Golden file format". Each
// `it` named after a scenario is that scenario; the others are extra cases.

/** A deep copy of `value` whose every object has its keys inserted in reverse order. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, inner]) => [key, reversedKeys(inner)]),
  );
}

describe('golden file render', () => {
  it('The canonical render is stable', () => {
    // Arrange
    const value = goldenFile({
      entries: goldenFile().entries.map((entry, i) => (i === 0 ? { ...entry, reviews: [{ by: 'author', date: '2026-10-17' }] } : entry)),
    });

    // Act
    const first = renderGoldenFile(value);
    const second = renderGoldenFile(JSON.parse(first));
    const third = renderGoldenFile(reversedKeys(value) as typeof value);

    // Assert
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(first).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(first).not.toContain('\r');
    expect(first.endsWith('}\n')).toBe(true);
    expect(first.endsWith('\n\n')).toBe(false);
    expect(first.split('\n')[1]).toBe('  "format": 1,');
  });

  it('refuses to render a value that is not a golden file', () => {
    expect(() => renderGoldenFile({ ...goldenFile(), format: 2 } as unknown as ReturnType<typeof goldenFile>)).toThrow();
    const broken = goldenFile({ entries: [goldenEntry('Q1', { response: cachedNoEvidence() })] });
    expect(renderGoldenFile(broken)).toContain('"reason": "no-evidence"');
    const unreadable = goldenFile({ entries: [goldenEntry('Q1', { response: { kind: 'answered' } as never })] });
    expect(() => renderGoldenFile(unreadable)).toThrow('Q1');
  });
});

const CONTEXT = { seedProjectNames: ['acme-shop'], fileName: 'acme-shop.json' };

/** A JSON copy of `value`, so a test can break it without touching the factory's types. */
function plain(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** A copy of the factory's value with `change` applied to its first entry. */
function withFirstEntry(change: (entry: Record<string, unknown>) => void): Record<string, unknown> {
  const value = plain(goldenFile());
  change((value.entries as Record<string, unknown>[])[0]);
  return value;
}

describe('golden file check', () => {
  it('Golden files with an invalid shape are rejected', () => {
    // Arrange
    const valid = plain(goldenFile());
    const copies: Record<string, unknown>[] = [
      { ...valid, format: 2 },
      { ...valid, generatedAt: '2026-10-17' },
      { ...valid, answerFingerprint: `sha256:${'C'.repeat(64)}` },
      withFirstEntry((entry) => void (entry.id = 'X1')),
      withFirstEntry((entry) => void (entry.reviews = [{ by: 'author', date: '2026-13-01' }])),
      withFirstEntry((entry) => void delete entry.reviews),
    ];

    // Act
    const accepted = checkGoldenFile(valid, CONTEXT);
    const rejected = copies.map((copy) => checkGoldenFile(copy, CONTEXT));

    // Assert
    expect(accepted).toEqual(goldenFile());
    expect(rejected).toEqual(copies.map(() => undefined));
  });

  it('accepts a real review date and rejects a day the calendar does not have', () => {
    expect(checkGoldenFile(withFirstEntry((entry) => void (entry.reviews = [{ by: 'author', date: '2024-02-29' }])), CONTEXT)).toBeDefined();
    for (const date of ['2026-02-30', '2026-04-31', '2025-02-29', '2026-00-10', '2026-1-01']) {
      expect(checkGoldenFile(withFirstEntry((entry) => void (entry.reviews = [{ by: 'author', date }])), CONTEXT)).toBeUndefined();
    }
    expect(checkGoldenFile(withFirstEntry((entry) => void (entry.reviews = [{ by: '', date: '2026-10-17' }])), CONTEXT)).toBeUndefined();
  });

  it('rejects a file not named after its project, or whose project is not a seed project', () => {
    expect(checkGoldenFile(plain(goldenFile()), { ...CONTEXT, fileName: 'other.json' })).toBeUndefined();
    expect(checkGoldenFile(plain(goldenFile({ project: 'task-api' })), { ...CONTEXT, fileName: 'task-api.json' })).toBeUndefined();
    expect(
      checkGoldenFile(plain(goldenFile({ project: 'task-api' })), { seedProjectNames: ['acme-shop', 'task-api'], fileName: 'task-api.json' }),
    ).toBeDefined();
  });

  it('rejects an unnormalized key, a repeated id or key, and a response the cache would not serve as answered', () => {
    const [q1, q3] = goldenFile().entries;
    const cases = [
      withFirstEntry((entry) => void (entry.questionNormalized = entry.question)),
      plain(goldenFile({ entries: [q1, { ...q3, id: 'Q1' }] })),
      plain(goldenFile({ entries: [q1, { ...q1, id: 'Q9' }] })),
      withFirstEntry((entry) => void (entry.response = cachedNoEvidence())),
      withFirstEntry(
        (entry) => void (entry.response = cachedAnswer({ statements: [{ ...cachedAnswer().statements[0], evidenceIds: ['absent'] }] })),
      ),
      withFirstEntry((entry) => void delete entry.response),
      withFirstEntry((entry) => void (entry.question = '')),
      plain(goldenFile({ generatedWith: { model: '', verifyModel: 'x' } })),
    ];
    for (const value of cases) expect(checkGoldenFile(value, CONTEXT)).toBeUndefined();
    expect(checkGoldenFile(plain(goldenFile({ entries: [] })), CONTEXT)).toEqual(goldenFile({ entries: [] }));
    expect(checkGoldenFile(plain(goldenFile({ entries: [goldenEntry('Q4')] })), CONTEXT)).toBeDefined();
  });

  it('rejects values that are not objects', () => {
    for (const value of [null, [], 'x', 1]) expect(checkGoldenFile(value, CONTEXT)).toBeUndefined();
  });
});

describe('golden file read', () => {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codemind-golden-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the parsed JSON, or says the file is missing or not JSON', () => {
    const path = join(dir, 'acme-shop.json');
    expect(readGoldenFile(path)).toEqual({ ok: false, reason: 'missing' });
    writeFileSync(path, '{"format":');
    expect(readGoldenFile(path)).toEqual({ ok: false, reason: 'invalid' });
    writeFileSync(path, renderGoldenFile(goldenFile()));
    expect(readGoldenFile(path)).toEqual({ ok: true, value: plain(goldenFile()) });
  });
});
