import type { ReactElement, ReactNode } from 'react';

/** Props of {@link ErrorBanner}. */
export interface ErrorBannerProps {
  /** The message: what failed and what the person can do. */
  children: ReactNode;
  /** Called when the person presses the retry button. */
  onRetry: () => void;
  /** Whether a retry is pending: the button then reads «Reintentando…». */
  retrying: boolean;
}

/**
 * An alert with a retry button (project-picker, "API status on Screen 1"; DIS-60 design D9, D24): role
 * `alert`, the warning colours, a decorative ⚠, the message and a primary button «Reintentar» that reads
 * «Reintentando…» while a retry is pending. The button is never disabled, so it keeps the focus.
 *
 * @param props - The message, the retry action and whether a retry is pending.
 * @returns The alert.
 */
export function ErrorBanner({ children, onRetry, retrying }: ErrorBannerProps): ReactElement {
  return (
    <div
      role="alert"
      className="mt-5 flex flex-wrap items-start gap-3 rounded-card border border-warning-border bg-warning-soft px-4 py-3 text-left text-sm text-warning-ink"
    >
      {/* The message keeps at least 12rem: on a narrow screen the button wraps below it (design D34). */}
      <div className="flex min-w-48 flex-1 gap-3">
        <span aria-hidden="true">⚠</span>
        <p className="flex-1">{children}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-button bg-accent px-3 py-1 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  );
}
