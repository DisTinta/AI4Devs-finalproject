import type { ReactElement } from 'react';
import { BackToPickerLink } from '../components/BackToPickerLink';
import { PageFrame } from '../components/PageFrame';

/**
 * The app's error screen (project-picker, "App error screen"; DIS-60 design D11): the root route's
 * `errorElement`, shown instead of React Router's default screen when a route throws while it renders.
 * It never shows the error's message or stack; the console keeps them for developers.
 *
 * @returns The error page.
 */
export function RouteErrorPage(): ReactElement {
  return (
    <PageFrame>
      <h1 className="text-lg font-semibold text-ink-muted">Algo ha fallado</h1>
      <p className="mt-2 text-sm text-ink-subtle">
        La pantalla no se ha podido mostrar. Recarga la página o vuelve a la selección de proyecto.
      </p>
      <BackToPickerLink />
    </PageFrame>
  );
}
