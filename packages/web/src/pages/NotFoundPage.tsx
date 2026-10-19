import type { ReactElement } from 'react';
import { BackToPickerLink } from '../components/BackToPickerLink';
import { PageFrame } from '../components/PageFrame';

/**
 * The page of any path the web client does not know: the header, «Página no encontrada» and a link back
 * to the project selection (web-foundation, "Routes of the web client").
 *
 * @returns The not-found page.
 */
export function NotFoundPage(): ReactElement {
  return (
    <PageFrame>
      <h1 className="text-lg font-semibold text-ink-muted">Página no encontrada</h1>
      <BackToPickerLink />
    </PageFrame>
  );
}
