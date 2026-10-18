import type { ReactElement } from 'react';

/**
 * The dark header of the wireframes (`readme.md` §1.3): the product name and its tagline, as the banner
 * landmark of the page.
 *
 * @returns The banner.
 */
export function AppHeader(): ReactElement {
  return (
    <header className="bg-header px-8 py-4">
      <p className="text-xl font-bold tracking-widest text-on-header">CODEMIND</p>
      <p className="text-xs text-on-header-muted">Comprensión de repositorios con evidencia verificable</p>
    </header>
  );
}
