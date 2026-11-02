import { useId, type ReactElement } from 'react';
import { riskHeading } from './impact-display';

/** Props of {@link RiskBanner}. */
export interface RiskBannerProps {
  /** The risk level of the report. */
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  /** The API's rationale, shown verbatim. */
  rationale: string;
}

/**
 * The risk block of an answered report (impact-page, "Risk"; DIS-14 design D9, D15): a section whose
 * level-2 heading writes the level in words, followed by the rationale as text. `HIGH` uses the warning
 * pair of the theme, `MEDIUM` and `LOW` the neutral canvas pair; the level is always in the heading, never
 * only in the colour.
 *
 * @param props - The level and the rationale.
 * @returns The block.
 */
export function RiskBanner({ level, rationale }: RiskBannerProps): ReactElement {
  const headingId = useId();
  const high = level === 'HIGH';
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-card border px-4 py-3 ${high ? 'border-warning-border bg-warning-soft' : 'border-border bg-canvas'}`}
    >
      <h2 id={headingId} className={`text-base font-bold ${high ? 'text-warning-ink' : 'text-ink'}`}>
        {riskHeading(level)}
      </h2>
      <p className={`mt-1 text-sm ${high ? 'text-warning-ink' : 'text-ink-muted'}`}>{rationale}</p>
    </section>
  );
}
