import type { ReactElement } from 'react';
import { Link } from 'react-router';

/** Props of {@link ProjectNav}. */
export interface ProjectNavProps {
  /** Where the link leads: a path of the web client. */
  to: string;
  /** The link's text. */
  label: string;
}

/**
 * The «Navegación del proyecto» landmark of Screens 2 and 3, rendered after the main landmark by
 * `PageFrame` (DIS-14 design D3): one link in the accent colour on the white frame, with the visible
 * focus outline of the other controls. Being after the main landmark, it is the last tab stop.
 *
 * @param props - The target path and the link text.
 * @returns The navigation landmark.
 */
export function ProjectNav({ to, label }: ProjectNavProps): ReactElement {
  return (
    <nav aria-label="Navegación del proyecto" className="px-8 pb-6 text-left">
      <Link
        to={to}
        className="rounded-button text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {label}
      </Link>
    </nav>
  );
}
