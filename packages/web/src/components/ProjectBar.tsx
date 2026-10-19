import type { ReactElement } from 'react';
import { Link } from 'react-router';

/** Props of {@link ProjectBar}. */
export interface ProjectBarProps {
  /** The level-1 heading: the project's name, or its id when it is not a sample project. */
  title: string;
  /** The language and framework label and the edge count, such as «PHP / Laravel · 170 aristas». */
  detail?: string;
}

/**
 * The dark project bar of Screen 2 (ask-page, "Screen 2 frame and project bar"; DIS-65 design D3, D20),
 * the banner landmark in place of the CODEMIND header: the link «←» back to Screen 1, whose accessible
 * name is «Volver a la selección de proyecto» and whose focus outline is white on the dark bar, the
 * level-1 heading and, for a sample project, its label and edge count.
 *
 * @param props - The heading and the optional detail.
 * @returns The banner.
 */
export function ProjectBar({ title, detail }: ProjectBarProps): ReactElement {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-header px-8 py-3 text-left">
      <Link
        to="/"
        aria-label="Volver a la selección de proyecto"
        className="rounded-button px-1 text-lg text-on-header focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-header"
      >
        ←
      </Link>
      <h1 className="text-base font-bold break-all text-on-header">{title}</h1>
      {detail === undefined ? null : (
        <p className="border-l border-ink-muted pl-3 text-xs text-on-header-muted">{detail}</p>
      )}
    </header>
  );
}
