import { useId, type FormEvent, type ReactElement } from 'react';

/** The message shown when the question is not valid (ask-page, "Question box"). */
export const INVALID_QUESTION_MESSAGE = 'Escribe una pregunta de 5 a 500 caracteres.';

/** Props of {@link QueryBox}. */
export interface QueryBoxProps {
  /** The field's text, owned by the page. */
  value: string;
  /** Called with the new text when the person changes the field. */
  onChange: (value: string) => void;
  /** Called when the person sends the form, with Enter or the button «Preguntar». */
  onSubmit: () => void;
  /** Whether the last send was an invalid question: the field is marked and the message shown. */
  invalid: boolean;
  /** The field's placeholder. */
  placeholder: string;
}

/**
 * The question box of Screen 2 (ask-page, "Question box"; DIS-65 design D4, D18): a form with a one-line
 * field labelled «Pregunta» (visually hidden) and a submit button «→» named «Preguntar». When `invalid`,
 * the field has `aria-invalid` and its accessible description is the alert «Escribe una pregunta de 5 a
 * 500 caracteres.». The button is never disabled.
 *
 * @param props - The field's text, the change and submit actions, the invalid mark and the placeholder.
 * @returns The form.
 */
export function QueryBox({ value, onChange, onSubmit, invalid, placeholder }: QueryBoxProps): ReactElement {
  const fieldId = useId();
  const messageId = useId();
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit}>
      <div className="flex gap-2 rounded-card border border-border bg-canvas p-1.5">
        <label htmlFor={fieldId} className="sr-only">
          Pregunta
        </label>
        <input
          id={fieldId}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? messageId : undefined}
          className="min-w-0 flex-1 rounded-button bg-canvas px-2 py-1 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          aria-label="Preguntar"
          className="shrink-0 rounded-button bg-accent px-3 py-1 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {invalid ? (
        <p id={messageId} role="alert" className="mt-2 text-sm text-warning-ink">
          {INVALID_QUESTION_MESSAGE}
        </p>
      ) : null}
    </form>
  );
}
