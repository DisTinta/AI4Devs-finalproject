import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, ask, type AskAnswered, type AskResponse, type AskUnknown } from '../services/api-client';

/** Why a sent question got no answer from the API: an API error with its code, or an unavailable API. */
export type AskFailure = { kind: 'api'; code: string } | { kind: 'unavailable' };

/**
 * What Screen 2 knows about its question (ask-page; DIS-65 design D22): nothing sent yet, a question
 * pending, an answered question, an `UNKNOWN` with its reason, or a failure.
 */
export type AskState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'answered'; answer: AskAnswered }
  | { status: 'unknown'; reason: AskUnknown['reason'] }
  | { status: 'failed'; failure: AskFailure };

/** What {@link useAsk} returns. */
export interface AskSession {
  /** The state of the last question sent. */
  state: AskState;
  /**
   * Sends one question, already checked and trimmed; ignored while a question is pending.
   *
   * @returns Whether the question was sent.
   */
  send: (question: string) => boolean;
}

/** Whether a `200` body is an `UNKNOWN`. */
function isUnknown(response: AskResponse): response is AskUnknown {
  return response.answer === 'UNKNOWN';
}

/** The state a failure of the ask call leaves: the API's error code, or an unavailable API. */
function failedState(failure: unknown): AskState {
  return {
    status: 'failed',
    failure: failure instanceof ApiError ? { kind: 'api', code: failure.code } : { kind: 'unavailable' },
  };
}

/**
 * Asks the API about one project (ask-page, "Pending question"; DIS-65 design D7, D22). `send` sends one
 * question with the API client's `ask` and the API's defaults, and is ignored while one is pending (a
 * ref holding its `AbortController`, so two presses in the same tick send one request). It sets no time
 * limit of its own. Unmounting aborts the pending question, and an aborted question changes nothing (the
 * settle checks the controller's own signal first, as `useApiHealth` does).
 *
 * @param projectId - The project the questions are about.
 * @returns The state of the last question and the send action.
 */
export function useAsk(projectId: string): AskSession {
  const [state, setState] = useState<AskState>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  const send = useCallback(
    (question: string): boolean => {
      if (pending.current !== null) {
        return false;
      }
      const controller = new AbortController();
      pending.current = controller;
      setState({ status: 'pending' });
      const settle = (next: AskState): void => {
        if (controller.signal.aborted) {
          return;
        }
        pending.current = null;
        setState(next);
      };
      ask(projectId, { question }, { signal: controller.signal }).then(
        (response) =>
          settle(isUnknown(response) ? { status: 'unknown', reason: response.reason } : { status: 'answered', answer: response }),
        (failure: unknown) => settle(failedState(failure)),
      );
      return true;
    },
    [projectId],
  );

  return { state, send };
}
