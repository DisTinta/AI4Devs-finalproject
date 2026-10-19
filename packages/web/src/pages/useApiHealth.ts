import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth } from '../services/api-client';

/**
 * The API status Screen 1 knows: `checking` while the first health check is pending, then `available`
 * or `unavailable` (project-picker, "API status on Screen 1"; DIS-60 design D8, D17).
 */
export type ApiHealthStatus = 'checking' | 'available' | 'unavailable';

/** What {@link useApiHealth} returns. */
export interface ApiHealth {
  /** The API status. A pending retry keeps it `unavailable`, so the alert stays. */
  status: ApiHealthStatus;
  /** Whether a retry is pending. */
  retrying: boolean;
  /** Sends one new health check; does nothing while a check is pending. */
  retry: () => void;
}

/**
 * Checks the API once when the calling page mounts, with the API client's health check and its default
 * time limit, without blocking the page (design D8, D17). Any failure other than the hook's own abort
 * makes the API `unavailable`; it never retries on its own. `retry()` sends one new check, and is
 * ignored while one is pending (a ref, so two presses in the same tick send one request). Unmounting
 * aborts the pending check, and an aborted check changes nothing.
 *
 * @returns The API status, whether a retry is pending, and the retry action.
 */
export function useApiHealth(): ApiHealth {
  const [status, setStatus] = useState<ApiHealthStatus>('checking');
  const [retrying, setRetrying] = useState(false);
  const pending = useRef<AbortController | null>(null);

  const check = useCallback((): void => {
    const controller = new AbortController();
    pending.current = controller;
    const settle = (outcome: 'available' | 'unavailable'): void => {
      if (controller.signal.aborted) {
        return;
      }
      pending.current = null;
      setStatus(outcome);
      setRetrying(false);
    };
    getHealth({ signal: controller.signal }).then(
      () => settle('available'),
      () => settle('unavailable'),
    );
  }, []);

  useEffect(() => {
    check();
    return () => pending.current?.abort();
  }, [check]);

  const retry = useCallback((): void => {
    if (pending.current !== null) {
      return;
    }
    setRetrying(true);
    check();
  }, [check]);

  return { status, retrying, retry };
}
