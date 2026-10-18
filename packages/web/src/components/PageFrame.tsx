import type { ReactElement, ReactNode } from 'react';
import { AppHeader } from './AppHeader';

/** Props of {@link PageFrame}. */
export interface PageFrameProps {
  /** The content of the main landmark. */
  children: ReactNode;
}

/**
 * The white container of the wireframes (`readme.md` §1.3) on the page background: the header as the
 * banner landmark, then the main landmark with the page's content.
 *
 * @param props - The main content.
 * @returns The framed page.
 */
export function PageFrame({ children }: PageFrameProps): ReactElement {
  return (
    <div className="mx-auto my-6 max-w-3xl overflow-hidden rounded-card border border-border bg-surface">
      <AppHeader />
      <main className="px-8 py-8 text-center">{children}</main>
    </div>
  );
}
