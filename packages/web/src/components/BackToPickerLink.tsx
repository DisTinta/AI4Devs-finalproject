import type { ReactElement } from 'react';
import { Link } from 'react-router';

/**
 * The link «Volver a la selección de proyecto» to `/`, shared by the not-found screen and the app's error
 * screen (DIS-60 design D11), with the visible focus outline of the web client's links.
 *
 * @returns The link back to Screen 1.
 */
export function BackToPickerLink(): ReactElement {
  return (
    <Link
      to="/"
      className="mt-2 inline-block text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Volver a la selección de proyecto
    </Link>
  );
}
