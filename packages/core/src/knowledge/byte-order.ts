/**
 * Compares two strings in UTF-8 byte order, which is code point order (UTF-16 code unit order, `<`,
 * differs from it above U+FFFF) and the order of Postgres `COLLATE "C"`.
 *
 * @param a The left string.
 * @param b The right string.
 * @returns A negative number when `a` sorts first, a positive one when `b` does, `0` when equal.
 */
export function compareBytes(a: string, b: string): number {
  const x = Array.from(a, (character) => character.codePointAt(0)!);
  const y = Array.from(b, (character) => character.codePointAt(0)!);
  const shared = Math.min(x.length, y.length);
  for (let k = 0; k < shared; k++) {
    if (x[k] !== y[k]) return x[k] - y[k];
  }
  return x.length - y.length;
}
