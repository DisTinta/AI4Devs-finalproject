import type { ReactElement } from 'react';
import type { AskStatement } from '../services/api-client';

/** A statement's type or its verification: the value one badge shows. */
export type StatementBadgeValue = AskStatement['type'] | AskStatement['verification'];

/** Props of {@link StatementBadge}. */
export interface StatementBadgeProps {
  /** The type (`FACT`, `INFERENCE`) or the verification (`entailed`, `cited`) of a statement. */
  value: StatementBadgeValue;
}

/** The icon, the label and the theme pair of each badge (design D8, D19). */
const BADGES: Readonly<Record<StatementBadgeValue, { icon: string; label: string; className: string }>> = {
  FACT: { icon: '●', label: 'HECHO', className: 'bg-success-soft text-success' },
  INFERENCE: { icon: '⚠', label: 'INFERIDO', className: 'bg-warning-soft text-warning-ink' },
  entailed: { icon: '✓', label: 'verificado', className: 'bg-success-soft text-success' },
  cited: { icon: '○', label: 'sin verificar', className: 'bg-canvas text-ink-muted' },
};

/**
 * One badge of a statement (ask-page, "Answer with typed and verified statements"; DIS-65 design D8):
 * always an icon, hidden from assistive technology, a text and a colour, never colour alone.
 *
 * @param props - The value the badge shows.
 * @returns The badge.
 */
export function StatementBadge({ value }: StatementBadgeProps): ReactElement {
  const { icon, label, className } = BADGES[value];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
