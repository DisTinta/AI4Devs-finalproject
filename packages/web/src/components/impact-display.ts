/**
 * How Screen 3 writes a change and the entries of an impact report (impact-page, "How a change and the
 * entries of a report are written"; DIS-14 design D5, D6): pure functions, no React.
 *
 * @module
 */

/**
 * Fewest Unicode code points of a change. Written once here, as the limit of the API's impact body
 * (`impactBodySchema` in `packages/api/src/schemas/impact.ts`): the web never imports the API package.
 */
export const MIN_CHANGE_CHARS = 5;

/** Most Unicode code points of a change; the limit of `impactBodySchema`, see {@link MIN_CHANGE_CHARS}. */
export const MAX_CHANGE_CHARS = 500;

/**
 * Checks a change before it is sent: once trimmed of leading and trailing whitespace, it must have from 5
 * to 500 Unicode code points (an astral character counts as one) and hold no U+0000. The API keeps the
 * last word on the same rules.
 *
 * @param text - The text of the change field.
 * @returns The trimmed change when it is valid, `undefined` otherwise.
 */
export function validChange(text: string): string | undefined {
  const trimmed = text.trim();
  const codePoints = [...trimmed].length;
  const inRange = codePoints >= MIN_CHANGE_CHARS && codePoints <= MAX_CHANGE_CHARS;
  return inRange && !trimmed.includes('\u0000') ? trimmed : undefined;
}

/** The separator of the parts of an entry: U+00B7 with a normal space on each side (design D6). */
export const ENTRY_SEPARATOR = ' · ';

/**
 * Writes the hops of an entry: «1 salto» for 1, «<n> saltos» otherwise («0 saltos» included).
 *
 * @param hops - The hops from the anchor.
 * @returns The written hops.
 */
export function hopsLabel(hops: number): string {
  return hops === 1 ? '1 salto' : `${hops} saltos`;
}

/**
 * Writes how sure an edge is.
 *
 * @param resolution - `exact` or `heuristic`.
 * @returns «exacta» or «heurística».
 */
export function resolutionLabel(resolution: 'exact' | 'heuristic'): string {
  return resolution === 'exact' ? 'exacta' : 'heurística';
}

/**
 * Writes where a stale document went out of date, without the decorative warning sign (the component
 * adds it, hidden from assistive technology).
 *
 * @param staleSince - The full sha of the commit.
 * @returns «desactualizada desde el commit <first 7 characters>».
 */
export function staleLabel(staleSince: string): string {
  return `desactualizada desde el commit ${staleSince.slice(0, 7)}`;
}

/**
 * Writes the co-change rate of a history entry: the rate times 100, rounded, then a normal space (U+0020)
 * and «%», as the CLI writes it.
 *
 * @param rate - The rate, from 0 to 1.
 * @returns For example «co-cambia 100 %».
 */
export function coChangeLabel(rate: number): string {
  return `co-cambia ${Math.round(rate * 100)} %`;
}

/**
 * Writes the pull requests of a history entry, in the order received.
 *
 * @param prs - The pull request numbers.
 * @returns «PR #24, #33, #55», or «sin PR» when there are none.
 */
export function prsLabel(prs: readonly number[]): string {
  return prs.length === 0 ? 'sin PR' : `PR ${prs.map((pr) => `#${pr}`).join(', ')}`;
}

/**
 * Writes the risk level as the heading of the risk block.
 *
 * @param level - `HIGH`, `MEDIUM` or `LOW`.
 * @returns «Riesgo alto», «Riesgo medio» or «Riesgo bajo».
 */
export function riskHeading(level: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  switch (level) {
    case 'HIGH':
      return 'Riesgo alto';
    case 'MEDIUM':
      return 'Riesgo medio';
    case 'LOW':
      return 'Riesgo bajo';
  }
}
