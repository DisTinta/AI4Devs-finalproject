/**
 * What Screen 2 says when a question gets no answer (ask-page, "How usage figures and notice details are
 * written", "UNKNOWN states", "Error, rate-limit and budget notices"; DIS-66 design D9, D17, D19, D23,
 * D26, D27, D32): pure functions, no React. The details of an API error are read only when they have the
 * expected type and form, and are otherwise treated as absent.
 *
 * @module
 */

/**
 * A strict ISO date-time: `YYYY-MM-DDTHH:MM`, optional seconds and fractions, then `Z` or `±HH:MM`
 * (design D27). `Date.parse` alone also accepts a bare date and rolls over impossible days.
 */
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Whether the date and hour fields of a strict ISO date-time exist on the calendar (no 30 February). */
function isCalendarDate(year: number, month: number, day: number, hour: number): boolean {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && hour <= 23;
}

/** A number written with at least two digits. */
function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Reads the reset time of an exhausted budget and writes it in UTC (design D9, D27): `details.resetsAt`
 * when it is a strict ISO date-time that denotes a real instant, written «<YYYY-MM-DD> a las <HH:MM> UTC»
 * with the `getUTC*` getters, never the local time zone nor `Intl`.
 *
 * @param details - The details of the API error.
 * @returns The written reset time, or `undefined` when the details hold none in the expected form.
 */
export function resetTimeOf(details: Record<string, unknown>): string | undefined {
  const value = details.resetsAt;
  const fields = typeof value === 'string' ? ISO_DATE_TIME.exec(value) : null;
  if (fields === null) {
    return undefined;
  }
  const [year, month, day, hour] = fields.slice(1, 5).map(Number);
  const instant = Date.parse(fields[0]);
  if (!isCalendarDate(year, month, day, hour) || Number.isNaN(instant)) {
    return undefined;
  }
  const date = new Date(instant);
  const written = `${date.getUTCFullYear()}-${twoDigits(date.getUTCMonth() + 1)}-${twoDigits(date.getUTCDate())}`;
  return `${written} a las ${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())} UTC`;
}

/**
 * Reads the wait of a rate limit (design D26): `details.retryAfterSeconds` when it is a whole number of 1
 * or more, as the API documents it; 0, a negative, a fraction, a text or no value give no wait.
 *
 * @param details - The details of the API error.
 * @returns The wait in seconds, or `undefined` when the details hold none in the expected form.
 */
export function retryWaitOf(details: Record<string, unknown>): number | undefined {
  const value = details.retryAfterSeconds;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
}
