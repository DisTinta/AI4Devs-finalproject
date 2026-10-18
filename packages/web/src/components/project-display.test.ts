import { describe, expect, it } from 'vitest';
import { formatCount, languageIcon, stackLabel } from './project-display';

/** The no-break space that groups digits (U+00A0), written by code point so no look-alike slips in. */
const NBSP = String.fromCodePoint(0x00a0);

/** The four nouns of a card's counts, singular and plural. */
const NOUNS = {
  files: ['fichero', 'ficheros'],
  symbols: ['símbolo', 'símbolos'],
  edges: ['arista', 'aristas'],
  commits: ['commit', 'commits'],
} as const;

describe('How a project is written on its card', () => {
  it('Language and framework labels', () => {
    // Arrange
    const pairs: Array<[string, string | null]> = [
      ['php', 'laravel'],
      ['typescript', 'fastify'],
      ['php', null],
      ['go', 'gin'],
    ];

    // Act
    const labels = pairs.map(([language, framework]) => stackLabel(language, framework));
    const icons = pairs.map(([language]) => languageIcon(language));

    // Assert
    expect(labels).toEqual(['PHP / Laravel', 'TypeScript / Fastify', 'PHP', 'go / gin']);
    expect(icons).toEqual(['🐘', '📘', '🐘', undefined]);
  });

  it('Counts in singular, in plural and with grouped digits', () => {
    // Arrange
    const counts = [0, 1, 2, 999, 1840, 1234567];

    // Act
    const written = Object.fromEntries(
      Object.entries(NOUNS).map(([kind, [singular, plural]]) => [
        kind,
        counts.map((count) => formatCount(count, singular, plural)),
      ]),
    );

    // Assert
    expect(written.files[1]).toBe('1 fichero');
    expect(written.symbols[1]).toBe('1 símbolo');
    expect(written.edges[1]).toBe('1 arista');
    expect(written.commits[1]).toBe('1 commit');
    expect(written.files[0]).toBe('0 ficheros');
    expect(written.symbols[2]).toBe('2 símbolos');
    expect(written.edges[3]).toBe('999 aristas');
    expect(written.edges[4]).toBe(`1${NBSP}840 aristas`);
    expect(written.commits[5]).toBe(`1${NBSP}234${NBSP}567 commits`);
    expect(Array.from(written.commits[5], (char) => char.codePointAt(0))).toEqual([
      0x31, 0xa0, 0x32, 0x33, 0x34, 0xa0, 0x35, 0x36, 0x37, 0x20, 0x63, 0x6f, 0x6d, 0x6d, 0x69, 0x74, 0x73,
    ]);
  });
});
