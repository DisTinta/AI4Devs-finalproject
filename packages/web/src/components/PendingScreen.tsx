import type { ReactElement } from 'react';
import { PageFrame } from './PageFrame';

/** Props of {@link PendingScreen}. */
export interface PendingScreenProps {
  /** The level-1 heading: the heading of the screen that will replace the placeholder. */
  heading: string;
  /** A detail shown under the placeholder line, such as the project id of the path. */
  detail?: string;
}

/**
 * The placeholder of a screen that is not built yet (web-foundation, "Routes of the web client"): the
 * header, the screen's heading and the line «Esta pantalla está en construcción.». It makes no request.
 *
 * @param props - The heading and the optional detail.
 * @returns The placeholder page.
 */
export function PendingScreen({ heading, detail }: PendingScreenProps): ReactElement {
  return (
    <PageFrame>
      <h1 className="text-lg font-semibold text-ink-muted">{heading}</h1>
      <p className="mt-2 text-sm text-ink-subtle">Esta pantalla está en construcción.</p>
      {detail === undefined ? null : <p className="mt-2 font-mono text-sm break-all text-ink-muted">{detail}</p>}
    </PageFrame>
  );
}
