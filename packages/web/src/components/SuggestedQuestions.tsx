import { useId, type ReactElement } from 'react';

/** Props of {@link SuggestedQuestions}. */
export interface SuggestedQuestionsProps {
  /** The suggested questions, in order. */
  questions: readonly string[];
  /** Called with the question of the pressed button. */
  onPick: (question: string) => void;
}

/**
 * The suggested questions of Screen 2 (ask-page, "Suggested questions"; DIS-65 design D5, D6): the text
 * «Prueba:» and a group named by it with one button per question. The buttons are never disabled, so a
 * press while a question is pending keeps the focus.
 *
 * @param props - The questions and the pick action.
 * @returns The text and the group.
 */
export function SuggestedQuestions({ questions, onPick }: SuggestedQuestionsProps): ReactElement {
  const labelId = useId();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span id={labelId} className="text-ink-subtle">
        Prueba:
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            className="rounded-full bg-accent-soft px-3 py-0.5 text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
