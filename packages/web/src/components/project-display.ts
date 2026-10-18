/**
 * How a sample project is written on its card (project-picker, "How a project is written on its card";
 * DIS-60 design D4, D5): pure functions, no React.
 *
 * @module
 */

/** The display label of each known language identifier; any other identifier is written as it is. */
const LANGUAGE_LABELS: ReadonlyMap<string, string> = new Map([
  ['php', 'PHP'],
  ['typescript', 'TypeScript'],
]);

/** The display label of each known framework identifier; any other identifier is written as it is. */
const FRAMEWORK_LABELS: ReadonlyMap<string, string> = new Map([
  ['laravel', 'Laravel'],
  ['fastify', 'Fastify'],
]);

/** The decorative icon of each language that has one in the wireframe. */
const LANGUAGE_ICONS: ReadonlyMap<string, string> = new Map([
  ['php', '🐘'],
  ['typescript', '📘'],
]);

/** The label of an identifier in a table, or the identifier itself when the table does not know it. */
function labelOf(table: ReadonlyMap<string, string>, identifier: string): string {
  return table.get(identifier) ?? identifier;
}

/**
 * The language and framework label of a project: «<language> / <framework>», or only «<language>» when
 * it has no framework. No version is shown (the sample-project constant holds none).
 *
 * @param language - The language identifier, such as `php`.
 * @param framework - The framework identifier, such as `laravel`, or `null` when there is none.
 * @returns The label, such as «PHP / Laravel».
 */
export function stackLabel(language: string, framework: string | null): string {
  const languageLabel = labelOf(LANGUAGE_LABELS, language);
  return framework === null ? languageLabel : `${languageLabel} / ${labelOf(FRAMEWORK_LABELS, framework)}`;
}

/**
 * The decorative icon written before a project's name: 🐘 for `php`, 📘 for `typescript`.
 *
 * @param language - The language identifier.
 * @returns The icon, or `undefined` when the language has none.
 */
export function languageIcon(language: string): string | undefined {
  return LANGUAGE_ICONS.get(language);
}

/** The separator of digit groups: a no-break space (U+00A0), as the wireframe writes «1 840». */
const DIGIT_GROUP_SEPARATOR = '\u00a0';

/**
 * Writes a whole number with its digits grouped in threes from the right, separated by a no-break space
 * (U+00A0), from 1 000 up. Not `Intl.NumberFormat`: `es-ES` does not group four-digit numbers and its
 * output depends on the ICU of the environment (design D5).
 */
function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, DIGIT_GROUP_SEPARATOR);
}

/**
 * Writes a count as «<number> <noun>»: the noun in singular for exactly 1, in plural otherwise, and the
 * number's digits grouped in threes with U+00A0 from 1 000 up («1 840 aristas»).
 *
 * @param count - The count, a whole number of zero or more.
 * @param singular - The noun for exactly one, such as «fichero».
 * @param plural - The noun for any other count, such as «ficheros».
 * @returns The written count.
 */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${groupDigits(count)} ${count === 1 ? singular : plural}`;
}
