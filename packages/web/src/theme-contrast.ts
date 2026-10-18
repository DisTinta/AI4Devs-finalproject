/**
 * WCAG 2.2 contrast ratio between two colours, used by the theme test to keep every text/background pair
 * of the theme at or above the AA minimum (web-foundation, "Theme colours and minimum contrast"; DIS-58
 * design D12).
 *
 * @module
 */

/** The WCAG 2.2 AA minimum contrast ratio for normal-size text. */
export const AA_MIN_RATIO = 4.5;

/** Parses `#rrggbb` into its three 0–255 channels. */
function parseHex(colour: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (match === null) {
    throw new Error(`not a #rrggbb colour: ${colour}`);
  }
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/** Linearises one sRGB channel (0–255) as the WCAG relative-luminance formula defines it. */
function linearChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of a `#rrggbb` colour (WCAG 2.2), from 0 (black) to 1 (white).
 *
 * @param colour - A colour written `#rrggbb`.
 * @returns The relative luminance.
 * @throws Error when `colour` is not written `#rrggbb`.
 */
export function relativeLuminance(colour: string): number {
  const [red, green, blue] = parseHex(colour).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Contrast ratio between two `#rrggbb` colours (WCAG 2.2), from 1 to 21; the order of the arguments does
 * not matter.
 *
 * @param text - The text colour.
 * @param background - The background colour.
 * @returns The ratio `(L1 + 0.05) / (L2 + 0.05)`, `L1` being the lighter luminance.
 * @throws Error when a colour is not written `#rrggbb`.
 */
export function contrastRatio(text: string, background: string): number {
  const first = relativeLuminance(text);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Whether a contrast ratio meets WCAG 2.2 AA for normal-size text.
 *
 * @param ratio - A contrast ratio, as returned by {@link contrastRatio}.
 * @returns `true` when `ratio` is at least {@link AA_MIN_RATIO}.
 */
export function meetsAA(ratio: number): boolean {
  return ratio >= AA_MIN_RATIO;
}
