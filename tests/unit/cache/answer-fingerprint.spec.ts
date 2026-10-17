import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANSWER_FINGERPRINT_FILES,
  answerFingerprint,
  collectAnswerFingerprintInputs,
} from '../../../packages/cli/src/cache/answer-fingerprint';
import { fingerprint } from '../../../packages/cli/src/seed/fingerprint';

// Spec: openspec/changes/golden-cache-build/specs/golden-answers/spec.md → "Golden answer fingerprint".
// The `it` named after the scenario is that scenario; the rest are extra cases. The tree is temporary,
// as in `tests/unit/cli/seed-fingerprint.spec.ts`.

const DECLARED = [
  'packages/core/src/explain/prompt.ts',
  'packages/core/src/explain/untrusted-text.ts',
  'packages/core/src/explain/sanitize.ts',
  'packages/core/src/explain/limits.ts',
  'packages/core/src/explain/statement-schema.ts',
  'packages/core/src/explain/typing-rules.ts',
  'packages/core/src/verify/verify-prompt.ts',
  'packages/core/src/verify/policy.ts',
  'packages/core/src/knowledge/confidence.ts',
  'packages/core/src/cache/normalize.ts',
  'packages/core/src/cache/response-cache.ts',
];

const OUTSIDE = ['packages/core/src/context/anchor.ts', 'packages/core/src/explain/explain.ts', 'readme.md'];

let root = '';

function write(relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codemind-answer-fingerprint-'));
  for (const path of [...DECLARED, ...OUTSIDE]) write(path, `${path}\nline two\n`);
});

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true });
});

describe('answer fingerprint', () => {
  it('The answer fingerprint covers exactly its declared inputs', () => {
    // Arrange
    const base = answerFingerprint(root);
    const seen = new Set([base]);

    // Act + Assert: each declared input alters it, and differently each time.
    for (const path of DECLARED) {
      write(path, `${path}\nchanged\n`);
      const changed = answerFingerprint(root);
      expect(changed).not.toBe(base);
      expect(seen.has(changed)).toBe(false);
      seen.add(changed);
      write(path, `${path}\nline two\n`);
    }
    expect(answerFingerprint(root)).toBe(base);

    // A CRLF rewrite of a declared input does not alter it.
    write(DECLARED[0], `${DECLARED[0]}\r\nline two\r\n`);
    expect(answerFingerprint(root)).toBe(base);
    write(DECLARED[0], `${DECLARED[0]}\nline two\n`);

    // Changes outside the declared inputs do not alter it.
    for (const path of OUTSIDE) write(path, `${path}\nchanged outside\n`);
    expect(answerFingerprint(root)).toBe(base);
  });

  it('declares exactly the eleven files of the spec, and they exist in this repository', () => {
    expect([...ANSWER_FINGERPRINT_FILES]).toEqual(DECLARED);
    for (const path of ANSWER_FINGERPRINT_FILES) expect(existsSync(resolve(path))).toBe(true);
  });

  it('hashes each declared file with its repository path, with the seed algorithm', () => {
    const inputs = collectAnswerFingerprintInputs(root);
    expect(inputs.map((input) => input.path)).toEqual(DECLARED);
    expect(inputs[0].content).toBe(`${DECLARED[0]}\nline two\n`);
    expect(answerFingerprint(root)).toBe(fingerprint(inputs));
    expect(answerFingerprint(root)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fails when a declared file is missing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'codemind-answer-fingerprint-empty-'));
    try {
      expect(() => answerFingerprint(empty)).toThrow();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
