import { useId, type FormEvent, type ReactElement } from 'react';

/** The message shown when the change is not valid (impact-page, "Change box"). */
export const INVALID_CHANGE_MESSAGE = 'Describe el cambio en 5 a 500 caracteres.';

/** The values of the «Saltos del grafo» list: the API's `maxHops` range. */
const HOPS_OPTIONS = [1, 2, 3] as const;

/** The control classes shared by the field and the list. */
const CONTROL_CLASS =
  'rounded-button border border-border bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Props of {@link ChangeBox}. */
export interface ChangeBoxProps {
  /** The field's text, owned by the page. */
  value: string;
  /** The hop limit chosen in the list, owned by the page. */
  hops: number;
  /** Called with the new text when the person changes the field. */
  onChange: (value: string) => void;
  /** Called with the new hop limit when the person chooses another one. */
  onHopsChange: (hops: number) => void;
  /** Called when the person sends the form, with Enter or the button «Analizar». */
  onSubmit: () => void;
  /** Whether the last send was an invalid change: the field is marked and the message shown. */
  invalid: boolean;
  /**
   * How many invalid sends there have been: the key of the message, so each invalid send inserts it as a
   * new element that assistive technology announces again (DIS-66 design D12, D29).
   */
  invalidSends: number;
}

/**
 * The change box of Screen 3 (impact-page, "Change box"; DIS-14 design D4, D13): a form with a one-line
 * field labelled «Cambio», a list labelled «Saltos del grafo» with the options 1, 2 and 3, and a submit
 * button «Analizar» that is never disabled. Both labels are visible and the field has no placeholder.
 * When `invalid`, the field has `aria-invalid` and its accessible description is the alert «Describe el
 * cambio en 5 a 500 caracteres.», inserted as a new element on every invalid send.
 *
 * @param props - The field's text, the hop limit, the change and submit actions, the invalid mark and its
 *   count.
 * @returns The form.
 */
export function ChangeBox({
  value,
  hops,
  onChange,
  onHopsChange,
  onSubmit,
  invalid,
  invalidSends,
}: ChangeBoxProps): ReactElement {
  const fieldId = useId();
  const hopsId = useId();
  const messageId = useId();
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
          Cambio
        </label>
        <input
          id={fieldId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? messageId : undefined}
          className={`min-w-0 ${CONTROL_CLASS}`}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={hopsId} className="text-sm font-semibold text-ink">
            Saltos del grafo
          </label>
          <select
            id={hopsId}
            value={hops}
            onChange={(event) => onHopsChange(Number(event.target.value))}
            className={CONTROL_CLASS}
          >
            {HOPS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-button bg-accent px-4 py-1 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Analizar
        </button>
      </div>
      {invalid ? (
        <p
          key={invalidSends}
          id={messageId}
          role="alert"
          className="rounded-card border border-warning-border bg-warning-soft px-3 py-1 text-left text-sm text-warning-ink"
        >
          {INVALID_CHANGE_MESSAGE}
        </p>
      ) : null}
    </form>
  );
}
