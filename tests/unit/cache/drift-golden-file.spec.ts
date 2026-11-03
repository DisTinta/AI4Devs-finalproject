import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkDriftGoldenFile,
  collectDriftFingerprintInputs,
  DRIFT_FINGERPRINT_FILES,
  DRIFT_GOLDEN,
  driftFingerprint,
  readDriftGoldenFile,
  renderDriftGoldenFile,
} from '../../../packages/cli/src/cache/drift-golden-file';
import type { DriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import { goldenDriftReport } from '../../support/drift-doubles';

// Spec: openspec/changes/add-cli-drift/specs/drift-golden/spec.md (DIS-73), requirements "Golden drift
// file format" and "Golden drift fingerprint". The `it` named after a scenario is that scenario; the
// rest are extra cases. The fingerprint tree is temporary, as in answer-fingerprint.spec.ts.

/** A valid golden drift file value; each call returns a fresh object. */
function driftGoldenFile(): DriftGoldenFile {
  return {
    format: 1,
    project: 'acme-shop',
    seed: { analyzerFingerprint: `sha256:${'a'.repeat(64)}`, contractFingerprint: `sha256:${'b'.repeat(64)}` },
    driftFingerprint: `sha256:${'c'.repeat(64)}`,
    generatedWith: { model: 'scripted-model', verifyModel: 'scripted-model' },
    entries: [{ id: 'Q5', key: 'drift:', response: goldenDriftReport() as never, reviews: [] }],
  };
}

const CONTEXT = { seedProjectNames: ['acme-shop', 'task-api'], fileName: 'acme-shop.json' };

/** A loosely typed JSON object, so a test can break any key of a golden drift file. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

/** The value with the key paths of `mutate` applied on a deep copy. */
function mutated(mutate: (value: Loose) => void): unknown {
  const copy = JSON.parse(JSON.stringify(driftGoldenFile())) as Loose;
  mutate(copy);
  return copy;
}

/** The object with its keys inserted in reverse order, at every level. */
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reversed(inner)]));
  }
  return value;
}

describe('Requirement: Golden drift file format', () => {
  it('The canonical drift render is stable', () => {
    // Arrange
    const file = driftGoldenFile();

    // Act
    const first = renderDriftGoldenFile(file);
    const second = renderDriftGoldenFile(JSON.parse(first) as DriftGoldenFile);
    const third = renderDriftGoldenFile(reversed(file) as DriftGoldenFile);

    // Assert
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(first).toContain('\n  "format": 1,\n');
    expect(first).not.toContain('\r');
    expect(first.endsWith('}\n')).toBe(true);
    expect(first.endsWith('\n\n')).toBe(false);
    expect(Object.keys(JSON.parse(first))).toEqual(['format', 'project', 'seed', 'driftFingerprint', 'generatedWith', 'entries']);
  });

  it('Golden drift files with an invalid shape are rejected', () => {
    // Arrange
    const bad: unknown[] = [
      mutated((v) => (v.format = 2)),
      mutated((v) => (v.extra = true)),
      mutated((v) => (v.driftFingerprint = `sha256:${'C'.repeat(64)}`)),
      mutated((v) => (v.entries[0].id = 'X5')),
      mutated((v) => (v.entries[0].key = 'pricing')),
      mutated((v) => (v.entries[0].response.events = [])),
      mutated((v) => (v.entries[0].response.documents[0].contradictions[0].type = 'FACT')),
      mutated((v) => (v.entries[0].reviews = [{ by: 'agent', date: '2026-13-01' }])),
      mutated((v) => delete v.entries[0].reviews),
    ];

    // Act and assert
    expect(checkDriftGoldenFile(JSON.parse(JSON.stringify(driftGoldenFile())), CONTEXT)).toEqual(driftGoldenFile());
    for (const value of bad) expect(checkDriftGoldenFile(value, CONTEXT)).toBeUndefined();
  });

  it('rejects a repeated id or key, an unknown project and a file name that is not the project', () => {
    const twice = mutated((v) => v.entries.push({ ...v.entries[0], id: 'Q6' }));
    const sameId = mutated((v) => v.entries.push({ ...v.entries[0], key: 'drift:docs/pricing.md' }));
    expect(checkDriftGoldenFile(twice, CONTEXT)).toBeUndefined();
    expect(checkDriftGoldenFile(sameId, CONTEXT)).toBeUndefined();
    expect(checkDriftGoldenFile(driftGoldenFile(), { ...CONTEXT, seedProjectNames: ['task-api'] })).toBeUndefined();
    expect(checkDriftGoldenFile(driftGoldenFile(), { ...CONTEXT, fileName: 'task-api.json' })).toBeUndefined();
    const withPath = mutated((v) => (v.entries[0].key = 'drift:docs/pricing.md'));
    expect(checkDriftGoldenFile(withPath, CONTEXT)).toBeDefined();
    const nul = mutated((v) => (v.entries[0].key = 'drift:a\u0000b'));
    expect(checkDriftGoldenFile(nul, CONTEXT)).toBeUndefined();
  });

  it('declares the golden drift report of acme-shop', () => {
    expect(DRIFT_GOLDEN).toEqual({ project: 'acme-shop', id: 'Q5', key: 'drift:' });
  });
});

describe('reading a golden drift file', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'codemind-drift-golden-read-'));
    writeFileSync(join(dir, 'ok.json'), '{"a":1}');
    writeFileSync(join(dir, 'bad.json'), 'not json');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns the parsed JSON, `invalid` for a text that is not JSON and `missing` for no file', () => {
    expect(readDriftGoldenFile(join(dir, 'ok.json'))).toEqual({ ok: true, value: { a: 1 } });
    expect(readDriftGoldenFile(join(dir, 'bad.json'))).toEqual({ ok: false, reason: 'invalid' });
    expect(readDriftGoldenFile(join(dir, 'nope.json'))).toEqual({ ok: false, reason: 'missing' });
  });
});

const OUTSIDE = ['packages/core/src/drift/drift.ts', 'packages/core/src/explain/prompt.ts', 'readme.md'];

describe('Requirement: Golden drift fingerprint', () => {
  let root = '';

  function write(relative: string, content: string): void {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'codemind-drift-fingerprint-'));
    for (const path of [...DRIFT_FINGERPRINT_FILES, ...OUTSIDE]) write(path, `${path}\nline two\n`);
  });

  afterAll(() => {
    if (root !== '') rmSync(root, { recursive: true, force: true });
  });

  it('The drift fingerprint covers exactly its declared inputs', () => {
    // Arrange
    const base = driftFingerprint(root);
    const seen = new Set([base]);

    // Act and assert: each declared input alters it, and differently each time.
    for (const path of DRIFT_FINGERPRINT_FILES) {
      write(path, `${path}\nchanged\n`);
      const changed = driftFingerprint(root);
      expect(changed).not.toBe(base);
      expect(seen.has(changed)).toBe(false);
      seen.add(changed);
      write(path, `${path}\nline two\n`);
    }
    expect(driftFingerprint(root)).toBe(base);

    // A CRLF rewrite does not alter it.
    write(DRIFT_FINGERPRINT_FILES[0]!, `${DRIFT_FINGERPRINT_FILES[0]}\r\nline two\r\n`);
    expect(driftFingerprint(root)).toBe(base);
    write(DRIFT_FINGERPRINT_FILES[0]!, `${DRIFT_FINGERPRINT_FILES[0]}\nline two\n`);

    // Changes outside the declared inputs do not alter it.
    for (const path of OUTSIDE) write(path, `${path}\nchanged outside\n`);
    expect(driftFingerprint(root)).toBe(base);
  });

  it('declares the ten files of the spec and reads them in that order', () => {
    expect([...DRIFT_FINGERPRINT_FILES]).toEqual([
      'packages/core/src/drift/drift-prompts.ts',
      'packages/core/src/drift/drift-quarantine.ts',
      'packages/core/src/drift/doc-claims.ts',
      'packages/core/src/drift/contradiction.ts',
      'packages/core/src/drift/drift-report.ts',
      'packages/core/src/drift/drift-cache.ts',
      'packages/core/src/explain/sanitize.ts',
      'packages/core/src/explain/untrusted-text.ts',
      'packages/core/src/verify/verify-prompt.ts',
      'packages/core/src/verify/policy.ts',
    ]);
    expect(collectDriftFingerprintInputs(root).map((input) => input.path)).toEqual([...DRIFT_FINGERPRINT_FILES]);
  });
});
