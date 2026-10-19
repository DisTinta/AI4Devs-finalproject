import { useId, useState, type ReactElement } from 'react';
import type { AskEvidence } from '../services/api-client';
import { evidenceLocation } from './answer-display';

/** Props of {@link EvidenceItem}. */
export interface EvidenceItemProps {
  /** The evidence the item shows. */
  evidence: AskEvidence;
}

/**
 * One evidence of an answer (ask-page, "Expandable evidence"; DIS-65 design D11, D26): a button named
 * «<id> · <location>» with `aria-expanded`, after a decorative ▸ (collapsed) or ▾ (expanded). Activating
 * it with a pointer, Enter or Space toggles the item on its own; when expanded, a `pre` block after the
 * button holds the exact excerpt the API sent, and the button points at it with `aria-controls`. The
 * item starts collapsed.
 *
 * @param props - The evidence.
 * @returns The button and, when expanded, the excerpt.
 */
export function EvidenceItem({ evidence }: EvidenceItemProps): ReactElement {
  const { id, file, startLine, endLine, excerpt } = evidence;
  const [expanded, setExpanded] = useState(false);
  const excerptId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? excerptId : undefined}
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-2 rounded-button border border-border bg-canvas px-3 py-1.5 text-left font-mono text-xs text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className="break-all">{`${id} · ${evidenceLocation(file, startLine, endLine)}`}</span>
      </button>
      {expanded ? (
        <pre
          id={excerptId}
          className="mt-1 overflow-x-auto rounded-button border border-border bg-canvas px-3 py-2 text-xs text-ink"
        >
          <code>{excerpt}</code>
        </pre>
      ) : null}
    </>
  );
}
