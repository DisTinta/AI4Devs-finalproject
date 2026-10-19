import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../router';

// Spec: openspec/changes/ask-page/specs/ask-page/spec.md (Screen 2 of the web client; DIS-65). Every
// test renders the real route table in a memory router with `fetch` replaced by a double (design D23).

/** The acme-shop project of the seed. */
const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

/** A project id that is not in the sample-project constant (a project indexed with the CLI). */
const OTHER_PROJECT_ID = '0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f';

/** The ellipsis of «Buscando evidencia…» (U+2026), written by code point. */
const ELLIPSIS = String.fromCodePoint(0x2026);

/** The pending status. */
const SEARCHING = `Buscando evidencia${ELLIPSIS}`;

/** The suggested questions of acme-shop, in golden order. */
const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const Q3 = '¿Cómo se validan los cupones?';
const Q4 = '¿Qué hace OrderObserver al crear un pedido?';

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

/** Renders the web client's routes in a memory router at `path`. */
function renderAt(path: string): ReturnType<typeof render> {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

/** Whether `first` comes before `second` in document order. */
function precedes(first: Node, second: Node): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** Asserts that `elements` are in this document order. */
function expectInOrder(elements: Node[]): void {
  for (let index = 1; index < elements.length; index += 1) {
    expect(precedes(elements[index - 1], elements[index]), `element ${index - 1} precedes element ${index}`).toBe(true);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Screen 2 frame and project bar', () => {
  it('Screen 2 opens on a sample project without any request', async () => {
    // Arrange
    const requests = stubFetch(neverAnswer);

    // Act
    renderAt(`/p/${PROJECT_ID}`);
    const heading = await screen.findByRole('heading', { level: 1 });

    // Assert
    const banner = screen.getByRole('banner');
    const back = within(banner).getByRole('link', { name: 'Volver a la selección de proyecto' });
    expect(back.textContent).toBe('←');
    expect(back.getAttribute('href')).toBe('/');
    expect(banner.contains(heading)).toBe(true);
    expect(heading.textContent).toBe('acme-shop');
    expect(within(banner).getByText('PHP / Laravel · 170 aristas')).toBeDefined();
    expect(screen.queryByText('CODEMIND')).toBeNull();
    expect(screen.queryByText('Comprensión de repositorios con evidencia verificable')).toBeNull();

    const main = screen.getByRole('main');
    const field = within(main).getByRole('textbox', { name: 'Pregunta' });
    const send = within(main).getByRole('button', { name: 'Preguntar' });
    const label = within(main).getByText('Prueba:');
    const group = within(main).getByRole('group', { name: 'Prueba:' });
    const suggestions = within(group).getAllByRole('button');
    expect(suggestions.map((button) => button.textContent)).toEqual([Q1, Q3, Q4]);
    expectInOrder([field, send, label, group]);

    expect(screen.queryByRole('heading', { name: 'Respuesta' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Evidencia' })).toBeNull();
    expect(screen.queryByText(SEARCHING)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('A project outside the sample constant is shown by its id', async () => {
    // Arrange
    const requests = stubFetch(neverAnswer);

    // Act
    renderAt(`/p/${OTHER_PROJECT_ID}`);
    const heading = await screen.findByRole('heading', { level: 1 });

    // Assert
    expect(heading.textContent).toBe(OTHER_PROJECT_ID);
    const banner = screen.getByRole('banner');
    expect(within(banner).queryByText(/PHP/)).toBeNull();
    expect(within(banner).queryByText(/aristas/)).toBeNull();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('textbox', { name: 'Pregunta' })).toBeDefined();
    expect(within(main).queryByText('Prueba:')).toBeNull();
    expect(within(main).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Preguntar',
    ]);
    expect(requests).toHaveLength(0);
  });
});
