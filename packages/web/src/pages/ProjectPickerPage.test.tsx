import { act, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../router';

/** The acme-shop project of the seed. */
const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

/** The ellipsis of «comprobando…» and «Reintentando…» (U+2026), written by code point. */
const ELLIPSIS = String.fromCodePoint(0x2026);

/** The badge shown while the first health check is pending. */
const CHECKING = `comprobando${ELLIPSIS}`;

/** The decorative icons of a card: language, the four counts, «indexado» and the link's arrow. */
const CARD_ICONS = ['🐘', '📁', '🔷', '↔', '📝', '✓', '→'];

/** One request the `fetch` double received. */
interface RecordedRequest {
  /** The first argument of `fetch`. */
  url: unknown;
  /** The second argument of `fetch`. */
  init: RequestInit | undefined;
}

/**
 * Replaces the global `fetch` with a double that records every request and answers with `answer`.
 *
 * @returns The recorded requests, in order.
 */
function stubFetch(answer: (request: RecordedRequest) => Promise<Response>): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => {
    const request = { url, init };
    requests.push(request);
    return answer(request);
  });
  return requests;
}

/** An answer that never comes on its own: it rejects only when the request's signal aborts. */
function neverAnswer({ init }: RecordedRequest): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

/** An answer of the API's health check: `200` with `{"status":"ok"}`. */
function answerOk(): Promise<Response> {
  return Promise.resolve(new Response('{"status":"ok"}', { status: 200 }));
}

/** The first sentence of the API-unavailable alert. */
const UNAVAILABLE = 'La API de CODEMIND no está disponible';

/** A failure of the request itself, as `fetch` rejects when nothing listens on the port. */
function rejectWithTypeError(): Promise<Response> {
  return Promise.reject(new TypeError('fetch failed'));
}

/**
 * Renders Screen 1 with `fetch` rejecting with a `TypeError`, and waits for the alert.
 *
 * @returns The alert's retry button.
 */
async function renderWithAlert(): Promise<HTMLElement> {
  stubFetch(rejectWithTypeError);
  renderAt('/');
  const alert = await screen.findByRole('alert');
  return within(alert).getByRole('button', { name: 'Reintentar' });
}

/** Renders the web client's routes in a memory router at `path`. */
function renderAt(path: string): ReturnType<typeof render> {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

/** Every text node under `root` that contains `text`. */
function textNodesContaining(root: Element, text: string): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent?.includes(text)) {
      found.push(node as Text);
    }
  }
  return found;
}

/** Whether `later` comes after `earlier` in document order. */
function comesAfter(earlier: Node, later: Node): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Sample-project cards without HTTP', () => {
  it('Screen 1 shows the sample projects without waiting for the API', async () => {
    // Arrange
    const requests = stubFetch(neverAnswer);

    // Act
    renderAt('/');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Elige un proyecto para explorar' });

    // Assert
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('CODEMIND')).toBeDefined();
    expect(within(banner).getByText('Comprensión de repositorios con evidencia verificable')).toBeDefined();
    const main = screen.getByRole('main');
    expect(main.contains(heading)).toBe(true);
    const subtitle = within(main).getByText('Repositorios precargados · sin registro · sin instalación');
    expect(subtitle.tagName).toBe('P');
    const list = within(main).getByRole('list', { name: 'Proyectos de muestra' });
    expect(comesAfter(heading, subtitle)).toBe(true);
    expect(comesAfter(subtitle, list)).toBe(true);

    expect(within(list).getAllByRole('article')).toHaveLength(1);
    const article = within(list).getByRole('article', { name: 'acme-shop' });
    expect(within(article).getByRole('heading', { level: 2, name: 'acme-shop' })).toBeDefined();
    expect(within(article).getByText('PHP / Laravel')).toBeDefined();
    const counts = within(article).getAllByRole('listitem');
    const expectedCounts = ['53 ficheros', '121 símbolos', '170 aristas', '32 commits'];
    expect(counts).toHaveLength(expectedCounts.length);
    expectedCounts.forEach((text, index) => {
      expect(within(counts[index]).getByText(text)).toBeDefined();
    });
    expect(within(article).getByText('indexado')).toBeDefined();
    const link = within(article).getByRole('link', { name: 'Explorar proyecto acme-shop' });
    expect(link.getAttribute('href')).toBe(`/p/${PROJECT_ID}`);
    for (const icon of CARD_ICONS) {
      const nodes = textNodesContaining(article, icon);
      expect(nodes.length, `icon ${icon} is rendered`).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node.parentElement?.closest('[aria-hidden="true"]'), `icon ${icon} is hidden`).not.toBeNull();
      }
    }

    expect(within(article).getByText(CHECKING)).toBeDefined();
    expect(within(article).queryByText('listo')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/health');
    expect(requests[0].init?.method).toBe('GET');
  });

  it('The project link is reached and followed with the keyboard', async () => {
    // Arrange
    stubFetch(neverAnswer);
    const user = userEvent.setup();
    renderAt('/');
    const link = await screen.findByRole('link', { name: 'Explorar proyecto acme-shop' });

    // Act
    const maxTabs = document.querySelectorAll('a, button, input, select, textarea, [tabindex]').length + 1;
    for (let presses = 0; presses < maxTabs && document.activeElement !== link; presses += 1) {
      await user.tab();
    }
    const focusedByKeyboard = document.activeElement === link;
    await user.keyboard('{Enter}');

    // Assert
    expect(focusedByKeyboard).toBe(true);
    expect(await screen.findByRole('heading', { level: 1, name: 'acme-shop' })).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Pregunta' })).toBeDefined();
  });
});

describe('API status on Screen 1', () => {
  it('An available API adds the «listo» badge', async () => {
    // Arrange
    stubFetch(answerOk);

    // Act
    renderAt('/');
    const article = await screen.findByRole('article', { name: 'acme-shop' });
    const ready = await within(article).findByText('listo');

    // Assert
    expect(ready).toBeDefined();
    expect(within(article).getByText('indexado')).toBeDefined();
    expect(within(article).queryByText(CHECKING)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('An unavailable API shows the alert and keeps the cards', async () => {
    // Arrange
    const runs: Array<[string, () => Promise<Response>]> = [
      ['rejects with a TypeError', rejectWithTypeError],
      ['answers 500 with an empty body', () => Promise.resolve(new Response('', { status: 500 }))],
      [
        'answers 503 in the error format',
        () =>
          Promise.resolve(
            new Response('{"error":{"code":"SERVICE_UNAVAILABLE","message":"unavailable","details":{}}}', {
              status: 503,
            }),
          ),
      ],
      ['answers 200 with status down', () => Promise.resolve(new Response('{"status":"down"}', { status: 200 }))],
    ];

    // Act
    const outcomes: Record<string, Record<string, unknown>> = {};
    for (const [label, answer] of runs) {
      const requests = stubFetch(answer);
      const { unmount } = renderAt('/');
      const alert = await screen.findByRole('alert');
      const subtitle = screen.getByText('Repositorios precargados · sin registro · sin instalación');
      const list = screen.getByRole('list', { name: 'Proyectos de muestra' });
      const article = within(list).getByRole('article', { name: 'acme-shop' });
      outcomes[label] = {
        holdsMessage: alert.textContent?.includes(UNAVAILABLE),
        holdsRetryButton: within(alert).queryByRole('button', { name: 'Reintentar' }) !== null,
        afterSubtitle: comesAfter(subtitle, alert),
        beforeList: comesAfter(alert, list),
        linkRendered: within(article).queryByRole('link', { name: 'Explorar proyecto acme-shop' }) !== null,
        showsReady: screen.queryByText('listo') !== null,
        showsChecking: screen.queryByText(CHECKING) !== null,
        focusOnBody: document.activeElement === document.body,
        requests: requests.length,
      };
      unmount();
      vi.unstubAllGlobals();
    }

    // Assert
    const expected = {
      holdsMessage: true,
      holdsRetryButton: true,
      afterSubtitle: true,
      beforeList: true,
      linkRendered: true,
      showsReady: false,
      showsChecking: false,
      focusOnBody: true,
      requests: 1,
    };
    expect(outcomes).toEqual(Object.fromEntries(runs.map(([label]) => [label, expected])));
  });

  it('A health check that never answers shows the alert after its time limit', async () => {
    // Arrange: only the timers of the health check are fake; React's scheduler keeps the real ones (D18).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const requests = stubFetch(neverAnswer);
    renderAt('/');

    // Act
    await act(() => vi.advanceTimersByTimeAsync(4_999));
    const at4999 = {
      alert: screen.queryByRole('alert') !== null,
      checking: screen.queryByText(CHECKING) !== null,
    };
    await act(() => vi.advanceTimersByTimeAsync(1));
    const alertAt5000 = screen.queryByRole('alert');
    const at5000 = {
      alert: alertAt5000?.textContent?.includes(UNAVAILABLE) ?? false,
      checking: screen.queryByText(CHECKING) !== null,
    };
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    // Assert
    expect(at4999).toEqual({ alert: false, checking: true });
    expect(at5000).toEqual({ alert: true, checking: false });
    expect(requests).toHaveLength(1);
  });

  it('Retrying after the API comes back removes the alert', async () => {
    // Arrange
    const user = userEvent.setup();
    const retryButton = await renderWithAlert();
    const requests = stubFetch(answerOk);

    // Act
    await user.click(retryButton);
    const article = screen.getByRole('article', { name: 'acme-shop' });
    const ready = await within(article).findByText('listo');

    // Assert
    expect(ready).toBeDefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/health');
    expect(requests[0].init?.method).toBe('GET');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Elige un proyecto para explorar' }),
    );
  });

  it('A successful retry leaves the focus where the person moved it', async () => {
    // Arrange
    const user = userEvent.setup();
    const retryButton = await renderWithAlert();
    let releaseAnswer = (): void => undefined;
    const requests = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          releaseAnswer = () => resolve(new Response('{"status":"ok"}', { status: 200 }));
        }),
    );
    const link = screen.getByRole('link', { name: 'Explorar proyecto acme-shop' });

    // Act
    await user.click(retryButton);
    await user.tab();
    const linkFocusedByKeyboard = document.activeElement === link;
    await act(async () => {
      releaseAnswer();
    });
    const article = screen.getByRole('article', { name: 'acme-shop' });
    const ready = await within(article).findByText('listo');

    // Assert
    expect(linkFocusedByKeyboard).toBe(true);
    expect(requests).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(ready).toBeDefined();
    expect(document.activeElement).toBe(link);
  });

  it('Pressing again while a retry is pending sends no request', async () => {
    // Arrange
    const user = userEvent.setup();
    const retryButton = await renderWithAlert();
    const requests = stubFetch(neverAnswer);

    // Act
    await user.click(retryButton);
    await user.click(retryButton);
    await user.click(retryButton);

    // Assert
    expect(requests).toHaveLength(1);
    const alert = screen.getByRole('alert');
    const pendingButton = within(alert).getByRole('button', { name: `Reintentando${ELLIPSIS}` });
    expect(document.activeElement).toBe(pendingButton);
  });

  it('A failed retry keeps the alert', async () => {
    // Arrange
    const user = userEvent.setup();
    const retryButton = await renderWithAlert();
    const alertText = screen.getByRole('alert').textContent;
    const requests = stubFetch(rejectWithTypeError);

    // Act
    await user.click(retryButton);
    const button = await within(screen.getByRole('alert')).findByRole('button', { name: 'Reintentar' });

    // Assert
    expect(requests).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe(alertText);
    expect(alertText).toBe(
      '⚠La API de CODEMIND no está disponible. Puedes ver los proyectos, pero no preguntar hasta que vuelva. ' +
        'Arráncala con npm run up y pulsa Reintentar.Reintentar',
    );
    expect(document.activeElement).toBe(button);
    expect(screen.queryByText('listo')).toBeNull();
  });

  it('Leaving Screen 1 cancels a pending check', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    renderAt('/');
    const link = await screen.findByRole('link', { name: 'Explorar proyecto acme-shop' });

    // Act
    await user.click(link);
    await screen.findByRole('heading', { level: 1, name: 'acme-shop' });

    // Assert
    expect(requests).toHaveLength(1);
    expect(requests[0].init?.signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('A check the page cancels itself changes nothing on the screen', async () => {
    // Arrange
    const requests = stubFetch(neverAnswer);

    // Act: StrictMode mounts the page, unmounts it (aborting the first check) and mounts it again.
    render(
      <StrictMode>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </StrictMode>,
    );
    const article = await screen.findByRole('article', { name: 'acme-shop' });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    // Assert
    expect(requests.map(({ init }) => init?.signal?.aborted)).toEqual([true, false]);
    expect(within(article).getByText(CHECKING)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe("Indexing a repository of one's own is a hint, not a control", () => {
  it('The indexing hint is text, not a control', async () => {
    // Arrange
    stubFetch(neverAnswer);

    // Act
    renderAt('/');
    const main = await screen.findByRole('main');
    const list = within(main).getByRole('list', { name: 'Proyectos de muestra' });

    // Assert
    const hint = within(main).getByText('+ Indexar mi propio repositorio');
    const command = within(main).getByText('npm run cli -- index <carpeta> --name <nombre> --language php');
    const requirements = within(main).getByText(
      'Desde la terminal · requiere Docker, Node 22.12+ y Git 2.45.1+ · por ahora solo PHP',
    );
    expect(comesAfter(list, hint)).toBe(true);
    expect(comesAfter(hint, command)).toBe(true);
    expect(comesAfter(command, requirements)).toBe(true);
    expect(command.tagName).toBe('CODE');
    expect(screen.queryAllByRole('link', { name: /Indexar/ })).toEqual([]);
    expect(screen.queryAllByRole('button', { name: /Indexar/ })).toEqual([]);
  });
});
