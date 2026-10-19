import { Fragment, type ReactElement } from 'react';
import { splitCode } from './answer-display';

/** Props of {@link CodeText}. */
export interface CodeTextProps {
  /** The text, as the API sent it. */
  text: string;
  /** The classes of each `code` element; absent, the code inherits the surrounding colour. */
  codeClassName?: string;
}

/**
 * A text with its back-quoted fragments in `code` elements (ask-page, "How a question, an answer and an
 * evidence location are written"; DIS-65 design D13, D29). Every fragment is a React string child, so any
 * markup in the text is shown as text, never interpreted.
 *
 * @param props - The text and the classes of its code fragments.
 * @returns The fragments.
 */
export function CodeText({ text, codeClassName = 'font-mono' }: CodeTextProps): ReactElement {
  return (
    <>
      {splitCode(text).map((fragment, index) =>
        fragment.kind === 'code' ? (
          // The fragments of one text never move: their position is a stable key.
          <code key={index} className={codeClassName}>
            {fragment.text}
          </code>
        ) : (
          <Fragment key={index}>{fragment.text}</Fragment>
        ),
      )}
    </>
  );
}
