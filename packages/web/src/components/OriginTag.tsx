import type { ReactElement } from 'react';

/** Props of {@link OriginTag}. */
export interface OriginTagProps {
  /** Where the element comes from: the code graph or the Git history. */
  origin: 'graph' | 'git';
}

/** The visible text of each origin; the brackets are part of the text. */
const TAG_TEXT: Readonly<Record<OriginTagProps['origin'], string>> = {
  graph: '[grafo]',
  git: '[git]',
};

/**
 * The origin tag of an impact entry (impact-page, "Answered report"; DIS-14 design D8, D15): the text
 * «[grafo]» or «[git]» in the badge pair `text-accent` on `bg-accent-soft`. The text, not the colour,
 * tells the two apart.
 *
 * @param props - The origin.
 * @returns The tag.
 */
export function OriginTag({ origin }: OriginTagProps): ReactElement {
  return <span className="rounded-button bg-accent-soft px-1 text-xs font-semibold text-accent">{TAG_TEXT[origin]}</span>;
}
