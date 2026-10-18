/**
 * Vitest setup file for the tests that run in jsdom (`vitest.config.ts` → `environmentMatchGlobs`:
 * `packages/web/**\/*.test.tsx` and `tests/a11y/**`). It is loaded for every test file, so both parts
 * are guarded by `'document' in globalThis` and do nothing in the Node environment.
 *
 * - DIS-58 design D18: React Testing Library cleans up automatically only when the framework exposes a
 *   global `afterEach` (Vitest `globals`, off here). Unmounting after every test keeps each test's
 *   document body empty, whatever the previous test rendered.
 * - DIS-58 design D26: React Router builds `new Request(url, { signal })` on navigation with Node's
 *   `Request` and the `AbortController` jsdom installs, and Node rejects that foreign signal
 *   (`RequestInit: Expected signal … to be an instance of AbortSignal`). The subclass below drops
 *   `init.signal`. Safe while the app declares no loader or action (the router never reads
 *   `request.signal`); the ticket that adds a loader or an action must revisit this workaround.
 */
import { afterEach } from 'vitest';

const runsInDom = 'document' in globalThis;

if (runsInDom) {
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  });

  const NodeRequest = globalThis.Request;

  /** Copies a `RequestInit` without its `signal` (D26). */
  const withoutSignal = (init: RequestInit): RequestInit => {
    const copy = { ...init };
    delete copy.signal;
    return copy;
  };

  /** Node's `Request`, minus the jsdom `AbortSignal` it cannot accept (D26). */
  class RequestWithoutSignal extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init === undefined ? init : withoutSignal(init));
    }
  }

  globalThis.Request = RequestWithoutSignal;
}
