import { describe, expect, it } from 'vitest';
import { evidenceLocation, splitCode, validQuestion } from './answer-display';

/** An astral character (U+1F600), written by code point: one code point, two UTF-16 units. */
const GRINNING = String.fromCodePoint(0x1f600);

describe('How a question, an answer and an evidence location are written', () => {
  it('Question length is counted in code points after trimming', () => {
    // Arrange
    const valid = ['¿Qué?', '  ¿Qué?  ', GRINNING.repeat(5), 'a'.repeat(500)];
    const invalid = ['hola', GRINNING.repeat(4), 'a'.repeat(501), '', '     '];

    // Act
    const sentForValid = valid.map((text) => validQuestion(text));
    const sentForInvalid = invalid.map((text) => validQuestion(text));

    // Assert
    expect(sentForValid).toEqual(['¿Qué?', '¿Qué?', GRINNING.repeat(5), 'a'.repeat(500)]);
    expect(sentForInvalid).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('Back-quoted fragments are shown as code', () => {
    // Arrange
    const texts = ['El método `compute()` de `PriceCalculator`.', 'sin código', 'una ` sin pareja', 'vacío `` aquí'];

    // Act
    const fragments = texts.map((text) => splitCode(text));

    // Assert
    expect(fragments).toEqual([
      [
        { kind: 'text', text: 'El método ' },
        { kind: 'code', text: 'compute()' },
        { kind: 'text', text: ' de ' },
        { kind: 'code', text: 'PriceCalculator' },
        { kind: 'text', text: '.' },
      ],
      [{ kind: 'text', text: 'sin código' }],
      [{ kind: 'text', text: 'una ` sin pareja' }],
      [{ kind: 'text', text: 'vacío `` aquí' }],
    ]);
  });

  it('Evidence locations name the file and its lines', () => {
    // Arrange
    const ranges: Array<[string, number, number]> = [
      ['app/Services/PriceCalculator.php', 16, 44],
      ['app/Services/ShippingService.php', 12, 12],
    ];

    // Act
    const locations = ranges.map(([file, startLine, endLine]) => evidenceLocation(file, startLine, endLine));

    // Assert
    expect(locations).toEqual(['app/Services/PriceCalculator.php:16-44', 'app/Services/ShippingService.php:12']);
  });
});
