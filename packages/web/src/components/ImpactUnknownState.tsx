import type { ReactElement } from 'react';

/** Props of {@link ImpactUnknownState}. */
export interface ImpactUnknownStateProps {
  /** The reason of the `unknown`, as the API sent it. */
  reason: string;
}

/**
 * The state of an `unknown` impact report (impact-page, "Unknown report"; DIS-14 design D10): a decorative
 * ○ hidden from assistive technology, the level-2 heading «Sin ancla en el grafo», the sentence that says
 * the change names nothing the graph knows, and «Motivo: <reason>», in the muted colours of `UnknownState`.
 * It has no live role (the status region announces it) and no control.
 *
 * @param props - The reason of the `unknown`.
 * @returns The state.
 */
export function ImpactUnknownState({ reason }: ImpactUnknownStateProps): ReactElement {
  return (
    <section className="mt-6 flex gap-3 rounded-card border border-border bg-canvas px-4 py-3 text-left text-sm text-ink-muted">
      <span aria-hidden="true">○</span>
      <div>
        <h2 className="font-semibold text-ink">Sin ancla en el grafo</h2>
        <p className="mt-1">
          El cambio no nombra ningún símbolo ni fichero que CODEMIND encuentre en el grafo de este proyecto, así
          que no hay nada desde lo que calcular el impacto. Nombra una clase o un fichero, por ejemplo
          DiscountService.
        </p>
        <p className="mt-1 text-xs">{`Motivo: ${reason}`}</p>
      </div>
    </section>
  );
}
