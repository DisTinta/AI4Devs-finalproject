import type { ReactElement } from 'react';

/** Props of {@link LlmRequiredNotice}. */
export interface LlmRequiredNoticeProps {
  /** The API's own message, when it sent one; shown as it comes. */
  message?: string;
  /** Whether the project has suggested questions, which still answer from the cache. */
  hasSuggestions: boolean;
}

/**
 * The configuration notice of an `UNKNOWN` `llm-required` (ask-page, "UNKNOWN states"; DIS-66 design D8,
 * D30): the API is in evaluation mode and answers only its cached questions. In the accent colours, so it
 * differs at a glance from the muted state without evidence: the level-2 heading «Hace falta un modelo de
 * lenguaje», how to enable free questions (`LLM_*`), that the suggested questions still answer (only when
 * the project has them) and the API's message (only when it sent one), rendered as text. It has no live
 * role (the status region announces it) and no control.
 *
 * @param props - The API's message and whether the project has suggested questions.
 * @returns The notice.
 */
export function LlmRequiredNotice({ message, hasSuggestions }: LlmRequiredNoticeProps): ReactElement {
  return (
    <section className="mt-6 rounded-card bg-accent-soft px-4 py-3 text-sm text-accent">
      <h2 className="font-semibold">Hace falta un modelo de lenguaje</h2>
      <p className="mt-1">
        La API está en modo evaluación: solo responde las preguntas que tiene en caché. Para preguntas libres,
        configura las variables <code className="font-mono">LLM_*</code> de la API y reiníciala.
      </p>
      {hasSuggestions ? <p className="mt-1">Las preguntas sugeridas siguen respondiendo desde la caché.</p> : null}
      {message === undefined ? null : <p className="mt-1 text-xs">{`Mensaje de la API: ${message}`}</p>}
    </section>
  );
}
