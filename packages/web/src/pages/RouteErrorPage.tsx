import type { ReactElement } from 'react';
import { Link } from 'react-router';
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
      <Link
        to="/"
        className="mt-2 inline-block text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Volver a la selección de proyecto
      </Link>
    </PageFrame>
  );
}
