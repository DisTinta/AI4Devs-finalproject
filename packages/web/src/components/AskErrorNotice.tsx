import type { ReactElement } from 'react';
import { alertLinesOf, type AskFailure } from './notice-display';

/** Props of {@link AskErrorNotice}. */
export interface AskErrorNoticeProps {
  /** The failure of the sent question. */
  failure: AskFailure;
}

/**
 * The alert of a failed question (ask-page, "Error, rate-limit and budget notices"; DIS-66 design D9,
 * D10, D17, D30): a decorative ⚠ hidden from assistive technology and one paragraph per line of the
 * failure, in the warning colours. Every text of the API is rendered as text. It offers no retry button:
 * sending the question again asks again.
 *
 * @param props - The failure.
 * @returns The alert.
 */
export function AskErrorNotice({ failure }: AskErrorNoticeProps): ReactElement {
  return (
    <div
      role="alert"
      className="mt-6 flex gap-3 rounded-card border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning-ink"
    >
      <span aria-hidden="true">⚠</span>
      <div>
        {alertLinesOf(failure).map((line) => (
          // The lines of one alert are distinct and fixed while it is shown: the text is a stable key.
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
