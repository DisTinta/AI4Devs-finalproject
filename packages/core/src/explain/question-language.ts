// The language rule of `explain` (DIS-104 design D1): one pure, deterministic decision over a text, with
// closed word lists and no dependency. It chooses the system message of a question and checks the
// language of a live answer. It never throws and runs in time linear in the length of the text.

/** The languages the rule tells apart. */
export type TextLanguage = 'es' | 'en';

/** The characters stripped from both ends of a token. */
const EDGE_PUNCTUATION: ReadonlySet<string> = new Set([...'¿¡?!.,;:"\'«»“”‘’()[]']);

/** The Spanish list: a token in it is one Spanish signal. */
const SPANISH_WORDS: ReadonlySet<string> = new Set(
  (
    'qué que cómo como dónde donde cuál cuáles cuándo cuando quién por para con sin el la los las un una ' +
    'unos unas de del al se es son está están hace hacen y o en lo su sus este esta si'
  ).split(' '),
);

/** The English list: a token in it is one English signal. */
const ENGLISH_WORDS: ReadonlySet<string> = new Set(
  'what how where why which who when the an does do is are was of to for on in and it its this that with from by be'.split(' '),
);

/** The accented vowels and the `ñ` that make any other word a Spanish signal. */
const SPANISH_LETTERS = /[ñáéíóúü]/u;

/** Whether `character` is not a Unicode letter. */
const NOT_A_LETTER = /[^\p{L}]/u;

/** An uppercase letter. */
const UPPERCASE = /\p{Lu}/u;

/** The text without the spans between a backtick and the next one; an unmatched last backtick stays. */
function withoutBacktickSpans(text: string): string {
  let kept = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf('`', from);
    const close = open === -1 ? -1 : text.indexOf('`', open + 1);
    if (close === -1) return kept + text.slice(from);
    kept += text.slice(from, open);
    from = close + 1;
  }
}

/** `token` without its leading and trailing edge punctuation. */
function stripEdges(token: string): string {
  const characters = [...token];
  let start = 0;
  let end = characters.length;
  while (start < end && EDGE_PUNCTUATION.has(characters[start]!)) start += 1;
  while (end > start && EDGE_PUNCTUATION.has(characters[end - 1]!)) end -= 1;
  return characters.slice(start, end).join('');
}

/** Whether a stripped token is code: it holds a non-letter, or mixes case after its first letter. */
function isCode(token: string): boolean {
  if (NOT_A_LETTER.test(token)) return true;
  const afterFirst = [...token].slice(1).join('');
  return UPPERCASE.test(afterFirst) && token !== token.toUpperCase();
}

/**
 * Decides the language of a text: `es`, `en` or `null` (no decision). The text between a backtick and
 * the next one is ignored; the rest is split on whitespace and each token loses its edge punctuation.
 * A token with a non-letter, or a letters-only token with an uppercase letter after its first one
 * (unless all its letters are uppercase), is code and counts for nothing; the others are compared in
 * lowercase. Each `¿` and `¡` outside backticks, each token of the Spanish list and each other token
 * with `ñ` or an accented vowel is a Spanish signal; each token of the English list is an English
 * signal. The result needs two signals of a language and strictly more than the other one.
 *
 * Added by DIS-104 (design D1). It carries no part of the text out: only the code.
 *
 * @param text Any text, the empty one included.
 * @returns The language, or `null` when there are too few signals or no clear majority.
 */
export function detectLanguage(text: string): TextLanguage | null {
  const visible = withoutBacktickSpans(text);
  let spanish = [...visible].filter((character) => character === '¿' || character === '¡').length;
  let english = 0;
  for (const raw of visible.split(/\s+/u)) {
    const token = stripEdges(raw);
    if (token === '' || isCode(token)) continue;
    const word = token.toLowerCase();
    if (SPANISH_WORDS.has(word) || SPANISH_LETTERS.test(word)) spanish += 1;
    else if (ENGLISH_WORDS.has(word)) english += 1;
  }
  if (spanish >= 2 && spanish > english) return 'es';
  if (english >= 2 && english > spanish) return 'en';
  return null;
}
