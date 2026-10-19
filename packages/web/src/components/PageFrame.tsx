import type { ReactElement, ReactNode } from 'react';
import { AppHeader } from './AppHeader';

/** Props of {@link PageFrame}. */
export interface PageFrameProps {
  /** The content of the main landmark. */
  children: ReactNode;
  /**
   * The banner landmark of the page: the CODEMIND header ({@link AppHeader}) when absent; Screen 2 passes
   * its project bar (DIS-65 design D3).
   */
  banner?: ReactNode;
}

/**
 * The white container of the wireframes (`readme.md` §1.3) on the page background: the banner landmark
 * (the CODEMIND header unless the page passes its own), then the main landmark with the page's content.
 *
 * @param props - The main content and the optional banner.
 * @returns The framed page.
 */
export function PageFrame({ children, banner }: PageFrameProps): ReactElement {
  return (
    <div className="mx-auto my-6 max-w-3xl overflow-hidden rounded-card border border-border bg-surface">
      {banner ?? <AppHeader />}
      <main className="px-8 py-8 text-center">{children}</main>
    </div>
  );
}
