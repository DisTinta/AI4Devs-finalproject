import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { AppHeader } from '../components/AppHeader';

/**
 * The page of any path the web client does not know: the header, «Página no encontrada» and a link back
 * to the project selection (web-foundation, "Routes of the web client").
 *
 * @returns The not-found page.
 */
export function NotFoundPage(): ReactElement {
  return (
    <div className="mx-auto my-6 max-w-3xl overflow-hidden rounded-card border border-border bg-surface">
      <AppHeader />
      <main className="px-8 py-8 text-center">
        <h1 className="text-lg font-semibold text-ink-muted">Página no encontrada</h1>
        <Link
          to="/"
          className="mt-2 inline-block text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Volver a la selección de proyecto
        </Link>
      </main>
    </div>
  );
}
