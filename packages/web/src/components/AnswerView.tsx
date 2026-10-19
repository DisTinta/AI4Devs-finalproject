import type { ReactElement } from 'react';
import type { AskAnswered, AskStatement } from '../services/api-client';
import { CodeText } from './CodeText';
import { EvidenceList } from './EvidenceList';
import { StatementBadge } from './StatementBadge';

/** Props of {@link AnswerView}. */
export interface AnswerViewProps {
  /** The answered question, as the API sent it. */
  answer: AskAnswered;
}

/** The box of a statement: the success stripe for a fact, the warning box for an inference (design D8, D19). */
const STATEMENT_BOX: Readonly<Record<AskStatement['type'], string>> = {
  FACT: 'border-l-4 border-success bg-surface text-ink',
  INFERENCE: 'rounded-card border border-warning-border bg-warning-soft text-warning-ink',
};

/** One statement: its text, its type and verification badges, and the ids of the evidence it cites. */
function StatementItem({ statement }: { statement: AskStatement }): ReactElement {
  return (
    <li className={`px-3 py-2 text-sm ${STATEMENT_BOX[statement.type]}`}>
      <p>
        <CodeText text={statement.text} />
      </p>
      <p className="mt-1 flex flex-wrap gap-2">
        <StatementBadge value={statement.type} />
        <StatementBadge value={statement.verification} />
      </p>
      {statement.evidenceIds.length === 0 ? null : (
        <p className="mt-1 text-xs">{`Evidencia: ${statement.evidenceIds.join(', ')}`}</p>
      )}
    </li>
  );
}

/**
 * An answered question (ask-page, "Answer with typed and verified statements"; DIS-65 design D8, D9,
 * D13, D19): the level-2 heading «Respuesta», the answer text, an ordered list with one item per
 * statement in the API's order, and the evidence. Back-quoted fragments are shown as code; every text is
 * rendered as text. Neither the confidence nor the usage is shown (DIS-66).
 *
 * @param props - The answered question.
 * @returns The answer section and the evidence section.
 */
export function AnswerView({ answer }: AnswerViewProps): ReactElement {
  return (
    <>
      <section className="mt-6 border-t border-border pt-4">
        <h2 className="text-xs font-bold tracking-wider text-ink-subtle uppercase">Respuesta</h2>
        <p className="mt-2 text-sm text-ink">
          <CodeText text={answer.answer} codeClassName="font-mono text-accent" />
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          {answer.statements.map((statement, index) => (
            // Statements have no id and never move while an answer is shown: the position is a stable key.
            <StatementItem key={index} statement={statement} />
          ))}
        </ol>
      </section>
      <EvidenceList evidence={answer.evidence} />
    </>
  );
}
