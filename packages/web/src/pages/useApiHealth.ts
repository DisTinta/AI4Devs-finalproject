import { useEffect, useState } from 'react';
import { getHealth } from '../services/api-client';

/**
 * The API status Screen 1 knows: `checking` while the first health check is pending, then `available`
 * or `unavailable` (project-picker, "API status on Screen 1"; DIS-60 design D8, D17).
 */
export type ApiHealthStatus = 'checking' | 'available' | 'unavailable';

/** What {@link useApiHealth} returns. */
export interface ApiHealth {
  /** The API status. */
  status: ApiHealthStatus;
}

/**
 * Checks the API once when the calling page mounts, with the API client's health check and its default
 * time limit, without blocking the page; unmounting aborts the pending check (design D8).
 *
 * @returns The API status.
 */
export function useApiHealth(): ApiHealth {
  const [status, setStatus] = useState<ApiHealthStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    getHealth({ signal: controller.signal }).then(
      () => setStatus('available'),
      () => undefined,
    );
    return () => controller.abort();
  }, []);

  return { status };
}
