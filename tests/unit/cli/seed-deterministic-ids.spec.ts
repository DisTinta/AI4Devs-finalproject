import { describe, expect, it } from 'vitest';
import {
  KEY_SEPARATOR,
  SEED_ID_NAMESPACE,
  commitKey,
  edgeKey,
  fileKey,
  projectKey,
  seedId,
  symbolKey,
  uuidV5,
  withOccurrence,
} from '../../../packages/cli/src/seed/deterministic-ids';

// Spec: openspec/changes/seed-build/specs/seed-build/spec.md → "Deterministic identifiers". The `it`
// named after the scenario is that scenario; the rest are extra cases.

/** RFC 4122 Appendix C: the DNS namespace. */
const NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('deterministic ids', () => {
  it('Keys are prefixed by the project name', () => {
    // Arrange
    const path = 'app/Models/Order.php';

    // Act
    const acme = seedId(fileKey('acme-shop', path));
    const task = seedId(fileKey('task-api', path));

    // Assert
    expect(acme).not.toBe(task);
    expect(fileKey('acme-shop', path)).toBe(`acme-shop${KEY_SEPARATOR}${path}`);
  });

  it('matches the published version 5 vector', () => {
    expect(uuidV5(NAMESPACE_DNS, 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('sets the version 5 nibble and the RFC 4122 variant', () => {
    const id = seedId(projectKey('acme-shop'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is stable and uses the fixed namespace', () => {
    expect(seedId(projectKey('acme-shop'))).toBe(uuidV5(SEED_ID_NAMESPACE, 'acme-shop'));
    expect(seedId(projectKey('acme-shop'))).toBe(seedId(projectKey('acme-shop')));
  });

  it('builds every key from its components, separated by NUL', () => {
    const s = KEY_SEPARATOR;
    expect(KEY_SEPARATOR).toBe('\u0000');
    expect(projectKey('p')).toBe('p');
    expect(commitKey('p', 'abc')).toBe(`p${s}abc`);
    expect(symbolKey('p', 'a.php', 'method', 12, 'run')).toBe(`p${s}a.php${s}method${s}12${s}run`);
    expect(
      edgeKey('p', 'calls', 'exact', 'php', { type: 'file', path: 'a.php' }, {
        type: 'symbol',
        path: 'b.php',
        kind: 'method',
        startLine: 3,
        name: 'go',
      }),
    ).toBe(`p${s}calls${s}exact${s}php${s}file${s}a.php${s}symbol${s}b.php${s}method${s}3${s}go`);
  });

  it("a unique edge's id is the UUID v5 of its key ending in #0", () => {
    const key = edgeKey('p', 'calls', 'exact', 'php', { type: 'file', path: 'a.php' }, { type: 'file', path: 'b.php' });
    expect(withOccurrence(key, 0)).toBe(`${key}${KEY_SEPARATOR}#0`);
    expect(seedId(withOccurrence(key, 0))).toBe(uuidV5(SEED_ID_NAMESPACE, `${key}${KEY_SEPARATOR}#0`));
    expect(seedId(withOccurrence(key, 0))).not.toBe(seedId(key));
  });

  it('keeps components apart: moving text across a boundary changes the key', () => {
    expect(fileKey('ab', 'c')).not.toBe(fileKey('a', 'bc'));
  });
});
