import { useId, type ReactElement } from 'react';
import type { AskUsage } from '../services/api-client';
import { baselineLine, formatConfidence, formatCost, formatLatency, formatTokens, savingsBadge } from './usage-display';

/** Props of {@link UsagePanel}. */
export interface UsagePanelProps {
  /** The confidence of the answer, from 0 to 1. */
  confidence: number;
  /** The usage of the answer, as the API sent it. */
  usage: AskUsage;
}

/** The shape every badge of the panel shares; `whitespace-nowrap` keeps «88 %» on one line (design D25). */
const BADGE = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap';

/** The theme pair of a muted badge: «sin ahorro vs bruto» and «sin caché» (design D4, D5, D30). */
const MUTED_BADGE = `${BADGE} border border-border bg-canvas text-ink-muted`;

/**
 * A figure after the first one, with the « · » before it hidden from assistive technology. The separator
 * and the figure never break apart, so a wrapped line never ends in a lone « · » (design D38).
 */
function NextFigure({ children }: { children: string }): ReactElement {
  return (
    <span className="inline-flex gap-x-2 whitespace-nowrap">
      <span aria-hidden="true">·</span>
      <span>{children}</span>
    </span>
  );
}

/**
 * The usage panel of an answered question (ask-page, "Usage panel"; DIS-66 design D2–D6, D21, D25, D30,
 * D38): a section on the canvas background named by its visually hidden level-2 heading «Uso», with the
 * confidence, the tokens, the cost and the latency separated by « · », the savings badge, the cache badge
 * and the baseline line. Every badge has its text, never colour alone; the panel holds no control.
 *
 * @param props - The confidence and the usage of the answer.
 * @returns The usage section.
 */
export function UsagePanel({ confidence, usage }: UsagePanelProps): ReactElement {
  const headingId = useId();
  const savings = savingsBadge(usage.savingsPct);
  return (
    <section aria-labelledby={headingId} className="mt-6 border-t border-border pt-2">
      <h2 id={headingId} className="sr-only">
        Uso
      </h2>
      <div className="rounded-card bg-canvas px-4 py-3 text-xs text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span>
              Confianza <strong className="text-sm font-bold text-ink">{formatConfidence(confidence)}</strong>
            </span>
            <NextFigure>{formatTokens(usage.inputTokens, usage.outputTokens)}</NextFigure>
            <NextFigure>{formatCost(usage.costUsd)}</NextFigure>
            <NextFigure>{formatLatency(usage.latencyMs)}</NextFigure>
          </p>
          <p className="flex flex-wrap gap-2">
            <span className={savings.saving ? `${BADGE} bg-success-soft text-success` : MUTED_BADGE}>{savings.text}</span>
            {usage.cacheHit ? (
              <span className={`${BADGE} bg-accent-soft text-accent`}>
                caché <span aria-hidden="true">✓</span>
              </span>
            ) : (
              <span className={MUTED_BADGE}>sin caché</span>
            )}
          </p>
        </div>
        <p className="mt-2">{baselineLine(usage.baselineTokens, usage.inputTokens)}</p>
      </div>
    </section>
  );
}
