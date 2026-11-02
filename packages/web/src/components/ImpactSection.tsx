import { Fragment, useId, type ReactElement, type ReactNode } from 'react';
import { ENTRY_SEPARATOR } from './impact-display';
import { OriginTag, type OriginTagProps } from './OriginTag';

/** One entry of a section of the report. */
export interface ImpactSectionEntry {
  /** The entry's text, used with its index as the list key (a list may repeat an entry). */
  key: string;
  /** The parts of the entry, in order; the component writes the separator between them. */
  parts: ReactNode[];
  /** The origin tag written last; absent for a document, which carries none. */
  origin?: OriginTagProps['origin'];
}

/** Props of {@link ImpactSection}. */
export interface ImpactSectionProps {
  /** The level-2 heading: «Directo», «Indirecto», «Tests», «Documentación» or «Historial». */
  heading: string;
  /** The entries, in the order the API sent them. */
  entries: ImpactSectionEntry[];
}

/**
 * One section of an answered report (impact-page, "Answered report"; DIS-14 design D15): a section named
 * by its level-2 heading, with the entries as a list or, when there are none, the text «Sin elementos»
 * (the section is never hidden). Each entry is its parts separated by « · » with the origin tag last, so
 * its text reads to a screen reader as it does on the screen.
 *
 * @param props - The heading and the entries.
 * @returns The section.
 */
export function ImpactSection({ heading, entries }: ImpactSectionProps): ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-base font-bold text-ink">
        {heading}
      </h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">Sin elementos</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {entries.map(({ key, parts, origin }, index) => (
            // A list may repeat an entry: the index and the text make the key.
            <li key={`${index}-${key}`} className="break-words text-ink-muted">
              {parts.map((part, partIndex) => (
                <Fragment key={partIndex}>
                  {partIndex === 0 ? null : ENTRY_SEPARATOR}
                  {part}
                </Fragment>
              ))}
              {origin === undefined ? null : (
                <>
                  {ENTRY_SEPARATOR}
                  <OriginTag origin={origin} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
