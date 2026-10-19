import type { ReactElement } from 'react';
import type { AskEvidence } from '../services/api-client';
import { evidenceLocation } from './answer-display';

/** Props of {@link EvidenceItem}. */
export interface EvidenceItemProps {
  /** The evidence the item shows. */
  evidence: AskEvidence;
}

/**
 * One evidence of an answer (ask-page, "Expandable evidence"; DIS-65 design D11): a button named «<id> ·
 * <location>».
 *
 * @param props - The evidence.
 * @returns The item.
 */
export function EvidenceItem({ evidence }: EvidenceItemProps): ReactElement {
  const { id, file, startLine, endLine } = evidence;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-button border border-border bg-canvas px-3 py-1.5 text-left font-mono text-xs text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true">▸</span>
      <span className="break-all">{`${id} · ${evidenceLocation(file, startLine, endLine)}`}</span>
    </button>
  );
}
