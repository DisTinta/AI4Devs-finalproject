import { render, screen, within } from '@testing-library/react';
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Consulta del proyecto' })).toBeDefined();
    expect(screen.getByText(PROJECT_ID)).toBeDefined();
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
});
