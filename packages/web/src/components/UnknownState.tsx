import type { ReactElement } from 'react';
import { reasonSentence } from './notice-display';

/** Props of {@link UnknownState}. */
export interface UnknownStateProps {
  /** The reason of the `UNKNOWN`, as the API sent it (any value but `llm-required`). */
  reason: string;
}

/**
 * The state of an `UNKNOWN` without evidence (ask-page, "UNKNOWN states"; DIS-66 design D7, D23, D30): a
 * decorative ○ hidden from assistive technology, the level-2 heading «Sin respuesta verificada», the
 * sentence of its reason and «Motivo: <reason>», in the muted colours. It has no live role (the status
 * region announces it) and no control.
 *
 * @param props - The reason of the `UNKNOWN`.
 * @returns The state.
 */
export function UnknownState({ reason }: UnknownStateProps): ReactElement {
  return (
    <section className="mt-6 flex gap-3 rounded-card border border-border bg-canvas px-4 py-3 text-sm text-ink-muted">
      <span aria-hidden="true">○</span>
      <div>
        <h2 className="font-semibold text-ink">Sin respuesta verificada</h2>
        <p className="mt-1">{reasonSentence(reason)}</p>
        <p className="mt-1 text-xs">{`Motivo: ${reason}`}</p>
      </div>
    </section>
  );
}
