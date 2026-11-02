import { useCallback, useEffect, useRef, useState } from 'react';
import type { AskFailure } from '../components/notice-display';
import {
  ApiError,
  impact,
  type ImpactAnswered,
  type ImpactRequest,
  type ImpactResponse,
  type ImpactUnknown,
} from '../services/api-client';

/**
 * What Screen 3 knows about its change (impact-page; DIS-14 design D12): nothing sent yet, a report
 * pending, an answered report, an `unknown` with its reason, or a failure with the API's code and details.
 */
export type ImpactState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'answered'; report: ImpactAnswered }
  | { status: 'unknown'; reason: ImpactUnknown['reason'] }
  | { status: 'failed'; failure: AskFailure };

/** What {@link useImpact} returns. */
export interface ImpactSession {
  /** The state of the last change sent. */
  state: ImpactState;
  /** Sends one change, already checked and trimmed; ignored while a report is pending. */
  send: (request: ImpactRequest) => void;
}

/** The state a `200` body leaves: an answered report or an `unknown`. */
function settledState(response: ImpactResponse): ImpactState {
  return response.status === 'unknown'
    ? { status: 'unknown', reason: response.reason }
    : { status: 'answered', report: response };
}

/** The state a failure of the impact call leaves: the API's error code and details, or an unavailable API. */
function failedState(failure: unknown): ImpactState {
  return {
    status: 'failed',
    failure:
      failure instanceof ApiError
        ? { kind: 'api', code: failure.code, details: failure.details }
        : { kind: 'unavailable' },
  };
}

/**
 * Asks the API for the impact of changes to one project (impact-page, "Pending report"; DIS-14 design
 * D12), as `useAsk` does for questions: `send` is ignored while a report is pending (a ref holding its
 * `AbortController`, so two presses in the same tick send one request), sets no time limit of its own,
 * unmounting aborts the pending request, and an aborted request changes nothing.
 *
 * @param projectId - The project the changes are about.
 * @returns The state of the last change and the send action.
 */
export function useImpact(projectId: string): ImpactSession {
  const [state, setState] = useState<ImpactState>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  const send = useCallback(
    (request: ImpactRequest): void => {
      if (pending.current !== null) {
        return;
      }
      const controller = new AbortController();
      pending.current = controller;
      setState({ status: 'pending' });
      const settle = (next: ImpactState): void => {
        if (controller.signal.aborted) {
          return;
        }
        pending.current = null;
        setState(next);
      };
      impact(projectId, request, { signal: controller.signal }).then(
        (response) => settle(settledState(response)),
        (failure: unknown) => settle(failedState(failure)),
      );
    },
    [projectId],
  );

  return { state, send };
}
