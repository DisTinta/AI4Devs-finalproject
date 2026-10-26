import { describe, expect, it } from 'vitest';
import { detectLanguage } from '@codemind/core';

// The language rule of DIS-104 (design D1; spec "Question and answer language").

const SPANISH_WORDS = [
  'qué', 'que', 'cómo', 'como', 'dónde', 'donde', 'cuál', 'cuáles', 'cuándo', 'cuando', 'quién', 'por', 'para', 'con', 'sin',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'se', 'es', 'son', 'está', 'están', 'hace',
  'hacen', 'y', 'o', 'en', 'lo', 'su', 'sus', 'este', 'esta', 'si',
];

const ENGLISH_WORDS = [
  'what', 'how', 'where', 'why', 'which', 'who', 'when', 'the', 'an', 'does', 'do', 'is', 'are', 'was', 'of', 'to', 'for',
  'on', 'in', 'and', 'it', 'its', 'this', 'that', 'with', 'from', 'by', 'be',
];

describe('The language rule decides Spanish, English or nothing', () => {
  it('The language rule decides Spanish, English or nothing', () => {
    expect(detectLanguage('¿Cómo se validan los cupones?')).toBe('es');
    expect(detectLanguage('¿Qué hace DiscountService?')).toBe('es');
    expect(detectLanguage('What does OrderObserver do?')).toBe('en');
    expect(detectLanguage('How is the price computed?')).toBe('en');
    expect(detectLanguage('DiscountService calculates discounts for orders based on the loyalty tier.')).toBe('en');
    for (const text of ['price', 'ok', 'q', 'DiscountService', '`the of to`', '']) {
      expect(detectLanguage(text), text).toBeNull();
    }
    expect(detectLanguage('«¿Dónde se aplica el cupón?»')).toBe('es');
    expect(detectLanguage('el precio del pedido??')).toBe('es');
    expect(detectLanguage('COMO SE CALCULA EL PRECIO')).toBe('es');
    expect(detectLanguage('The `the` price')).toBeNull();
    expect(detectLanguage('the price `of')).toBeNull();
    expect(detectLanguage('[the] (of)')).toBe('en');
    expect(detectLanguage('AÑO-2024 PÁGINA_1')).toBeNull();
  });

  it('Every word of the Spanish list is a Spanish signal', () => {
    for (const word of SPANISH_WORDS) {
      expect(detectLanguage(`¿${word}`), word).toBe('es');
      expect(detectLanguage(`¿ ${word.toUpperCase()}`), word).toBe('es');
    }
  });

  it('Every word of the English list is an English signal', () => {
    for (const word of ENGLISH_WORDS) {
      expect(detectLanguage(`${word} ${word}`), word).toBe('en');
      expect(detectLanguage(`${word} price`), word).toBeNull();
    }
  });

  it('A word of neither list is no signal', () => {
    expect(detectLanguage('¿price')).toBeNull();
    expect(detectLanguage('¡¿')).toBe('es');
    expect(detectLanguage('¡')).toBeNull();
  });

  it('An accented vowel or an n tilde is a Spanish signal', () => {
    expect(detectLanguage('canción')).toBeNull();
    expect(detectLanguage('canción pingüino')).toBe('es');
    expect(detectLanguage('año')).toBeNull();
    expect(detectLanguage('año ñandú')).toBe('es');
    expect(detectLanguage('á é í ó ú ü')).toBe('es');
  });

  it('A token that mixes code is not a signal', () => {
    expect(detectLanguage('PriceCalculator::compute')).toBeNull();
    expect(detectLanguage('snake_case')).toBeNull();
    expect(detectLanguage('v2')).toBeNull();
    expect(detectLanguage('what `the of` the')).toBe('en');
    expect(detectLanguage('what the DiscountService PriceCalculator::compute snake_case v2')).toBe('en');
    expect(detectLanguage('what DiscountService')).toBeNull();
    expect(detectLanguage('the `a` the')).toBe('en');
    expect(detectLanguage('the thé v2')).toBeNull();
  });

  it('The strict majority and the threshold of two decide', () => {
    expect(detectLanguage('¿what the')).toBe('en');
    expect(detectLanguage('¿what')).toBeNull();
    expect(detectLanguage('¿¿ what')).toBe('es');
    expect(detectLanguage('what the is ¿¿')).toBe('en');
    expect(detectLanguage('what the ¿¿')).toBeNull();
    expect(detectLanguage('what')).toBeNull();
  });

  it('The edge punctuation is stripped, an inner one is code', () => {
    expect(detectLanguage('«¿qué» (de) hace')).toBe('es');
    expect(detectLanguage('"the" \'of\' ‘to’ “in” [on]; end.')).toBe('en');
    expect(detectLanguage('the... of,,, to!!')).toBe('en');
    expect(detectLanguage('the.of to.in')).toBeNull();
  });

  it('A backtick pair hides its text and an unmatched backtick is a plain character', () => {
    expect(detectLanguage('what `ignored` the')).toBe('en');
    expect(detectLanguage('what `a` the `b` of')).toBe('en');
    expect(detectLanguage('what `the` `of`')).toBeNull();
    expect(detectLanguage('the of `')).toBe('en');
    expect(detectLanguage('the of to `x')).toBe('en');
    expect(detectLanguage('the `of')).toBeNull();
  });

  it('The text after a backtick pair is read once', () => {
    expect(detectLanguage('el `x` the')).toBeNull();
    expect(detectLanguage('the `x` of `y` to')).toBe('en');
  });

  it('A capital first letter is a word, a capital after it is code unless every letter is one', () => {
    expect(detectLanguage('El precio del pedido')).toBe('es');
    expect(detectLanguage('ThE of')).toBeNull();
    expect(detectLanguage('tHe of')).toBeNull();
    expect(detectLanguage('THE OF')).toBe('en');
    expect(detectLanguage('The Of')).toBe('en');
  });

  it('Whitespace of any kind separates tokens', () => {
    expect(detectLanguage('the\tof\nto')).toBe('en');
    expect(detectLanguage('  the   of  ')).toBe('en');
  });

  it('An NFD accent is a combining mark, so its token is code', () => {
    expect(detectLanguage('canción pingüino')).toBeNull();
  });
});
