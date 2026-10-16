import { describe, expect, it } from 'vitest';
import { normalizeQuestion } from '@codemind/core';

// Spec: openspec/changes/evaluation-cache/specs/answer-cache/spec.md → "Question normalization"
// (DIS-21 design C1, decision D1): the cache key of a question.

describe('Requirement: Question normalization', () => {
  it('Case, accent and punctuation variants share one key', () => {
    // Arrange
    const variants = [
      '¿Cómo se calcula el precio final de un pedido?',
      'COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO',
      ' ¿cómo   se calcula el precio final de un pedido?? ',
      'Cómo se calcula, el precio final de un pedido!',
    ];

    // Act
    const keys = variants.map(normalizeQuestion);

    // Assert
    expect(keys).toEqual(Array.from({ length: 4 }, () => 'como se calcula el precio final de un pedido'));
  });

  it('Identifiers, symbols and compatibility characters become plain words', () => {
    // Arrange: full-width `PriceCalculator`, and `İ` (U+0130) as escapes so the source shows them.
    const questions = [
      'PriceCalculator::compute()',
      '$final_price',
      'ＰｒｉｃｅＣａｌｃｕｌａｔｏｒ',
      'año',
      'İstanbul',
      'precio\tfinal\n pedido',
    ];

    // Act
    const keys = questions.map(normalizeQuestion);

    // Assert
    expect(keys).toEqual(['pricecalculator compute', 'final price', 'pricecalculator', 'ano', 'istanbul', 'precio final pedido']);
  });

  it('A question of only punctuation has no key, and a key is stable', () => {
    // Arrange: every key of the two previous scenarios.
    const keys = [
      'como se calcula el precio final de un pedido',
      'pricecalculator compute',
      'final price',
      'pricecalculator',
      'ano',
      'istanbul',
      'precio final pedido',
    ];

    // Act
    const empty = ['¿?¡!', ' ... '].map(normalizeQuestion);
    const again = keys.map(normalizeQuestion);

    // Assert
    expect(empty).toEqual(['', '']);
    expect(again).toEqual(keys);
  });
});
