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

/** The sentence of each known reason of an `UNKNOWN` without evidence (design D7). */
const REASON_SENTENCES: ReadonlyMap<string, string> = new Map([
  [
    'no-anchor',
    'La pregunta no nombra nada que CODEMIND encuentre en el código de este proyecto (ningún símbolo ni fichero), así que no hay evidencia en la que apoyar una respuesta. CODEMIND prefiere no inventarla.',
  ],
  ['over-budget', 'Ningún fragmento de código relevante cabe en el presupuesto de tokens de la consulta.'],
  ['invalid-model-output', 'El modelo devolvió una respuesta con un formato no válido y se ha descartado.'],
  ['no-evidence', 'El modelo no dio ninguna afirmación apoyada en evidencia.'],
  ['broken-evidence', 'Ninguna cita del modelo coincide con el código del proyecto y se ha descartado la respuesta.'],
]);

/** The sentence of a reason the page does not know: the API may add one, and `ask()` does not check it. */
const GENERAL_REASON_SENTENCE = 'CODEMIND no ha encontrado evidencia suficiente para dar una respuesta verificada.';

/**
 * The sentence that explains an `UNKNOWN` without evidence (design D7, D23): one per known reason, and a
 * general sentence for any other value.
 *
 * @param reason - The reason of the `UNKNOWN`, as the API sent it.
 * @returns The sentence.
 */
export function reasonSentence(reason: string): string {
  return REASON_SENTENCES.get(reason) ?? GENERAL_REASON_SENTENCE;
}

/**
 * Why a sent question got no answer from the API (design D18, D32): an API error with its code and its
 * details, or an unavailable API (the request failed, or the answer is not the API's error format).
 */
export type AskFailure = { kind: 'api'; code: string; details: Record<string, unknown> } | { kind: 'unavailable' };

/** The first line of every failure alert (design D17). */
const FAILED = 'No se ha podido obtener la respuesta.';

/** The lines of an API error between the first line and its code, chosen by the code (design D9, D10). */
function caseLinesOf(code: string, details: Record<string, unknown>): string[] {
  switch (code) {
    case 'BUDGET_EXHAUSTED': {
      const resetTime = resetTimeOf(details);
      return [
        'Se ha agotado el presupuesto diario del modelo de lenguaje.',
        'Las preguntas que ya están en caché siguen respondiendo, sin coste.',
        ...(resetTime === undefined ? [] : [`El presupuesto se renueva el ${resetTime}.`]),
      ];
    }
    case 'RATE_LIMITED': {
      const wait = retryWaitOf(details);
      return [
        'Demasiadas peticiones seguidas a la API.',
        wait === undefined ? 'Espera un momento y vuelve a preguntar.' : `Espera ${wait} s y vuelve a preguntar.`,
      ];
    }
    case 'PROJECT_NOT_FOUND':
      return ['La API no tiene este proyecto: vuelve a la selección de proyecto o indéxalo con la CLI.'];
    case 'LLM_UNAVAILABLE':
      return ['El modelo de lenguaje no responde; las preguntas en caché siguen respondiendo.'];
    case 'SOURCE_UNAVAILABLE':
      return ['La API no puede leer el código del proyecto.'];
    default:
      return [];
  }
}

/**
 * The lines of the alert of a failure (design D9, D10, D17): «No se ha podido obtener la respuesta.»,
 * then the lines of its case, then «Código: <code>.» for any API error; «La API de CODEMIND no
 * responde.» for an unavailable API. The case is chosen by the code, never by the HTTP status.
 *
 * @param failure - The failure of the sent question.
 * @returns The lines, in order.
 */
export function alertLinesOf(failure: AskFailure): string[] {
  if (failure.kind === 'unavailable') {
    return [FAILED, 'La API de CODEMIND no responde.'];
  }
  return [FAILED, ...caseLinesOf(failure.code, failure.details), `Código: ${failure.code}.`];
}
