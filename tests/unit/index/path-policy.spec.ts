import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainError, ForbiddenPathError, IndexingDisabled, confinePath } from '@codemind/core';

// Spec: openspec/changes/security-gateway/specs/security-gateway/spec.md → "Repository path
// confinement" and "Indexing disabled without an allowed root". Each `it` named after a scenario is
// that scenario.
describe('path policy', () => {
  it('A missing or blank root disables indexing', () => {
    for (const allowedRoot of [undefined, '', '   ']) {
      for (const requested of ['/repos/acme-shop', 'acme-shop', '/tmp/otro']) {
        // Act
        let caught: unknown;
        try {
          confinePath(requested, allowedRoot);
        } catch (error) {
          caught = error;
        }

        // Assert
        expect(caught).toBeInstanceOf(IndexingDisabled);
        expect(caught).toBeInstanceOf(DomainError);
        expect(caught).not.toBeInstanceOf(ForbiddenPathError);
        const error = caught as IndexingDisabled;
        expect(error.code).toBe('INDEXING_DISABLED');
        expect(error.name).toBe('IndexingDisabled');
        expect(error.message).toBe('indexing disabled (fixtures-only mode)');
      }
    }
  });

  // Expectations are built with `path.resolve`, so the same test holds on Windows and Linux.
  const root = path.resolve('/repos');

  it('Paths inside the root are accepted', () => {
    // Act / Assert
    expect(confinePath(path.resolve('/repos/acme-shop'), root)).toBe(path.resolve('/repos/acme-shop'));
    expect(confinePath('acme-shop', root)).toBe(path.resolve('/repos/acme-shop'));
    expect(confinePath(path.resolve('/repos/a/../b'), root)).toBe(path.resolve('/repos/b'));
    expect(confinePath(path.resolve('/repos/..x'), root)).toBe(path.resolve('/repos/..x'));
  });

  it('Paths outside the root are forbidden', () => {
    for (const requested of [
      path.resolve('/repos/../etc'),
      path.resolve('/tmp/otro'),
      path.resolve('/repos-evil/x'),
    ]) {
      // Act / Assert
      expectForbidden(() => confinePath(requested, root), requested);
    }
  });

  it.runIf(process.platform === 'win32')('A path on another Windows drive is forbidden', () => {
    // Act / Assert
    expectForbidden(() => confinePath('D:\\repos\\x', 'C:\\repos'), 'D:\\repos\\x');
  });

  // Extra cases (not spec scenarios).
  it('the root itself is inside, its parent is not', () => {
    expect(confinePath('', root)).toBe(root);
    expect(confinePath('.', root)).toBe(root);
    expectForbidden(() => confinePath('..', root), '..');
    expectForbidden(() => confinePath('../x', root), '../x');
  });

  it('a trailing separator on the root changes nothing', () => {
    const withSep = root + path.sep;
    expect(confinePath('acme-shop', withSep)).toBe(path.resolve('/repos/acme-shop'));
    expectForbidden(() => confinePath(path.resolve('/repos-evil/x'), withSep), path.resolve('/repos-evil/x'));
  });
});

function expectForbidden(act: () => unknown, requested: string): void {
  let caught: unknown;
  try {
    act();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ForbiddenPathError);
  expect(caught).toBeInstanceOf(DomainError);
  const error = caught as ForbiddenPathError;
  expect(error.code).toBe('FORBIDDEN_PATH');
  expect(error.name).toBe('ForbiddenPathError');
  expect(error.requestedPath).toBe(requested);
  expect(error.message).toBe(`Forbidden path: ${requested}`);
}
