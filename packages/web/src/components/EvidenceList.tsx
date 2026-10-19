import type { ReactElement } from 'react';
import type { AskEvidence } from '../services/api-client';
import { EvidenceItem } from './EvidenceItem';

/** Props of {@link EvidenceList}. */
export interface EvidenceListProps {
  /** The evidence of the answer, in the API's order. */
  evidence: AskEvidence[];
}

/**
 * The evidence of an answer (ask-page, "Expandable evidence"; DIS-65 design D11): the level-2 heading
 * «Evidencia» and one collapsed item per evidence, in the API's order, repeated evidence included. Each
 * item is keyed by its evidence id, never by its location, so two items citing the same range stay
 * apart.
 *
 * @param props - The evidence.
 * @returns The heading and the list.
 */
export function EvidenceList({ evidence }: EvidenceListProps): ReactElement {
  return (
    <section className="mt-6 border-t border-border pt-4">
      <h2 className="text-xs font-bold tracking-wider text-ink-subtle uppercase">Evidencia</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {evidence.map((item) => (
          <li key={item.id}>
            <EvidenceItem evidence={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
