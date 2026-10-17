import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';

/** Statuses whose response cannot carry a body (the `Response` constructor refuses one). */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 103, 204, 205, 304]);

/**
 * A `fetch` for the long requests of the cache build (DIS-26 design C4): one CPU answer of a local
 * model takes minutes, and Node's own `fetch` ends any request at 300 s (undici's header and body
 * timeouts). It covers exactly what the model client uses — the method, the headers, a text body, the
 * `signal`, and `redirect: 'manual'` (a 3xx is returned as itself: nothing is ever followed) — over
 * `node:http` / `node:https`, with no timeout of its own: the caller's `signal` is the only limit.
 * It resolves once the whole body is read, so `ok`, `text()` and `body.cancel()` behave as usual.
 *
 * @param input The URL.
 * @param init The method, headers, text body and signal.
 * @returns The response, its body fully read.
 * @throws The signal's reason when it is an `Error` (`TimeoutError` for `AbortSignal.timeout`),
 *   otherwise an `Error` named `AbortError`; the system error of a failed connection (its `code`
 *   intact); a `TypeError` for a body that is not text.
 */
export function longFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const { signal, body } = init;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      reject(new TypeError('longFetch: only a text body is supported'));
      return;
    }
    if (signal?.aborted === true) {
      reject(abortReason(signal));
      return;
    }
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => void (headers[name] = value));
    let settled = false;
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      finish();
    };
    const fail = (error: unknown): void => settle(() => reject(error));
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url, { method: init.method ?? 'GET', headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', fail);
      response.on('end', () => settle(() => resolve(toResponse(response, Buffer.concat(chunks)))));
    });
    function onAbort(): void {
      fail(abortReason(signal!));
      request.destroy();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    request.on('error', fail);
    request.end(body ?? undefined);
  });
}

/** The `Response` of a fully read message. */
function toResponse(message: IncomingMessage, body: Buffer): Response {
  const status = message.statusCode ?? 0;
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, item);
  }
  return new Response(NULL_BODY_STATUSES.has(status) ? null : new Uint8Array(body), { status, statusText: message.statusMessage ?? '', headers });
}

/** What an aborted request rejects with: the signal's reason when it is an error, else an `AbortError`. */
function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('the request was aborted');
  error.name = 'AbortError';
  return error;
}
