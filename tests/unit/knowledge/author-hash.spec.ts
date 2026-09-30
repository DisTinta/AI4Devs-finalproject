import { describe, expect, it } from 'vitest';
import { pseudonymiseAuthor } from '@codemind/core';

// Spec `git-history` → Author pseudonymisation. Synthetic identities only.
const SALT = 'unit-test-salt';

describe('author pseudonymisation', () => {
  it('E-mail case and surrounding whitespace do not change the hash', () => {
    // Arrange
    const padded = { name: 'Ana', email: ' Ana@X.test ' };
    const plain = { name: 'Ana', email: 'ana@x.test' };

    // Act / Assert
    expect(pseudonymiseAuthor(padded, SALT)).toBe(pseudonymiseAuthor(plain, SALT));
  });

  it('An empty e-mail falls back to the normalised name', () => {
    // Arrange
    const noEmail = { name: ' Ana Pérez ', email: '' };
    const blankEmail = { name: 'ana pérez', email: '   ' };
    const nameOnly = { name: 'ana pérez', email: '' };
    const withEmail = { name: 'ana pérez', email: 'ana@x.test' };

    // Act
    const hash = pseudonymiseAuthor(noEmail, SALT);

    // Assert
    expect(pseudonymiseAuthor(blankEmail, SALT)).toBe(hash);
    expect(pseudonymiseAuthor(nameOnly, SALT)).toBe(hash);
    expect(pseudonymiseAuthor(withEmail, SALT)).not.toBe(hash);
  });

  it('is 64 lowercase hexadecimal characters', () => {
    expect(pseudonymiseAuthor({ name: 'Ana', email: 'ana@x.test' }, SALT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the HMAC-SHA256 of the normalised identity keyed by the salt', () => {
    // Known vectors: HMAC-SHA256(key = 'unit-test-salt', data = 'ana@x.test' / 'ana pérez'), hex.
    expect(pseudonymiseAuthor({ name: 'Ana', email: ' ANA@x.test' }, SALT)).toBe(
      '1120d00bcc117051c02d3af4b5220645c945c99fd13f4bc10784947aeb9b7944',
    );
    expect(pseudonymiseAuthor({ name: ' Ana Pérez ', email: '' }, SALT)).toBe(
      'b4ed47575d490ae9e3be6c20ff0ff6f852ec016de530bd90d33959e87345472f',
    );
  });

  it('depends on the salt', () => {
    const identity = { name: 'Ana', email: 'ana@x.test' };
    expect(pseudonymiseAuthor(identity, 'salt-a')).not.toBe(pseudonymiseAuthor(identity, 'salt-b'));
  });

  it('distinguishes different authors', () => {
    expect(pseudonymiseAuthor({ name: 'Ana', email: 'ana@x.test' }, SALT)).not.toBe(
      pseudonymiseAuthor({ name: 'Ana', email: 'bea@x.test' }, SALT),
    );
  });

  it('contains neither the name nor the e-mail', () => {
    const hash = pseudonymiseAuthor({ name: 'ana', email: 'ana@x.test' }, SALT);
    expect(hash).not.toContain('ana');
    expect(hash).not.toContain('x.test');
  });
});
