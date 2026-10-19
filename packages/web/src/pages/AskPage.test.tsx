import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../router';
import type { AskAnswered, AskStatement } from '../services/api-client';

// Spec: openspec/changes/ask-page/specs/ask-page/spec.md (Screen 2 of the web client; DIS-65). Every
// test renders the real route table in a memory router with `fetch` replaced by a double (design D23).

/** The acme-shop project of the seed. */
const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

/** A project id that is not in the sample-project constant (a project indexed with the CLI). */
const OTHER_PROJECT_ID = '0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f';

/** The ask URL of acme-shop. */
const ASK_URL = `/api/projects/${PROJECT_ID}/ask`;

/** The ellipsis of «Buscando evidencia…» (U+2026), written by code point. */
const ELLIPSIS = String.fromCodePoint(0x2026);

/** The pending status. */
const SEARCHING = `Buscando evidencia${ELLIPSIS}`;

/** The message of an invalid question. */
const INVALID = 'Escribe una pregunta de 5 a 500 caracteres.';

/** The suggested questions of acme-shop, in golden order. */
const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const Q3 = '¿Cómo se validan los cupones?';
const Q4 = '¿Qué hace OrderObserver al crear un pedido?';

/** The excerpt of `ev-1`, with its line breaks and leading spaces. */
const EV1_EXCERPT = 'class PriceCalculator\n{\n    public function compute(Order $order): float\n}';

/** The excerpt of `ev-2`. */
const EV2_EXCERPT = '        return $order->shippingCost();';

/** The answered question of "An answered question shows the answer, its statements and its evidence". */
const ANSWERED: AskAnswered = {
  answer: 'El precio final se calcula en `PriceCalculator::compute()`.',
  statements: [
    {
      text: '`compute()` aplica el descuento antes del impuesto.',
      type: 'FACT',
      verification: 'entailed',
      evidenceIds: ['ev-1'],
    },
    { text: 'El envío se suma al final.', type: 'INFERENCE', verification: 'cited', evidenceIds: ['ev-1', 'ev-2'] },
  ],
  evidence: [
    { id: 'ev-1', file: 'app/Services/PriceCalculator.php', startLine: 16, endLine: 44, excerpt: EV1_EXCERPT },
    { id: 'ev-2', file: 'app/Services/ShippingService.php', startLine: 12, endLine: 12, excerpt: EV2_EXCERPT },
  ],
  confidence: 0.71,
  usage: {
    inputTokens: 4_000,
    outputTokens: 812,
    baselineTokens: 41_200,
    baselineEstimator: 'chars-div-4',
    savingsPct: 88,
    costUsd: 0.014,
    latencyMs: 2_100,
    cacheHit: false,
    generation: { inputTokens: 3_000, outputTokens: 600, costUsd: 0.01 },
    verification: { calls: 2, cacheHits: 0, inputTokens: 1_000, outputTokens: 212, costUsd: 0.004, latencyMs: 700 },
  },
};

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

/** An answer of the API: `status` with `body` as JSON. */
function answerWith(status: number, body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Every text node under `root` that contains `text`. */
function textNodesWith(root: Node, text: string): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent?.includes(text) === true) {
      found.push(node as Text);
    }
  }
  return found;
}

/** Renders the web client's routes in a memory router at `path`. */
function renderAt(path: string): ReturnType<typeof render> {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

/**
 * Renders Screen 2 of acme-shop and waits for its level-1 heading.
 *
 * @returns What `render` returns, to unmount between runs.
 */
async function renderScreen2(): Promise<ReturnType<typeof render>> {
  const rendered = renderAt(`/p/${PROJECT_ID}`);
  await screen.findByRole('heading', { level: 1, name: 'acme-shop' });
  return rendered;
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
  vi.useRealTimers();
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

describe('Question box', () => {
  it('A written question is sent trimmed', async () => {
    // Arrange
    const user = userEvent.setup();
    const written = '  ¿Qué hace OrderService?  ';
    const runs: Array<{ requests: RecordedRequest[]; field: HTMLElement; used: HTMLElement; focused: Element | null }> = [];

    // Act
    for (const via of ['enter', 'button'] as const) {
      const requests = stubFetch(neverAnswer);
      const { unmount } = await renderScreen2();
      const field = screen.getByRole('textbox', { name: 'Pregunta' });
      const button = screen.getByRole('button', { name: 'Preguntar' });
      await user.type(field, written);
      if (via === 'enter') {
        await user.keyboard('{Enter}');
      } else {
        await user.click(button);
      }
      runs.push({ requests: [...requests], field, used: via === 'enter' ? field : button, focused: document.activeElement });
      expect((field as HTMLInputElement).value).toBe(written);
      expect(field.getAttribute('aria-invalid')).toBeNull();
      unmount();
    }

    // Assert
    for (const { requests, used, focused } of runs) {
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(ASK_URL);
      expect(requests[0].init?.method).toBe('POST');
      expect(new Headers(requests[0].init?.headers).get('content-type')).toBe('application/json');
      expect(requests[0].init?.body).toBe('{"question":"¿Qué hace OrderService?"}');
      expect(focused).toBe(used);
    }
  });

  it('An invalid question is not sent', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen2();
    const field = screen.getByRole('textbox', { name: 'Pregunta' });
    const inputs = ['hola', '     ', '  hola  ', 'a'.repeat(501)];
    const afterEachSend: Array<Record<string, unknown>> = [];

    // Act
    for (const input of inputs) {
      await user.clear(field);
      await user.type(field, input);
      await user.keyboard('{Enter}');
      const describedBy = field.getAttribute('aria-describedby');
      const description = describedBy === null ? null : document.getElementById(describedBy);
      afterEachSend.push({
        requests: requests.length,
        invalid: field.getAttribute('aria-invalid'),
        descriptionRole: description?.getAttribute('role'),
        description: description?.textContent,
        alerts: screen.getAllByRole('alert').map((alert) => alert.textContent),
        focusOnField: document.activeElement === field,
        searching: screen.queryByText(SEARCHING) !== null,
      });
    }

    // Assert
    const expected = {
      requests: 0,
      invalid: 'true',
      descriptionRole: 'alert',
      description: INVALID,
      alerts: [INVALID],
      focusOnField: true,
      searching: false,
    };
    expect(afterEachSend).toEqual(inputs.map(() => expected));
  });

  it('Changing an invalid question clears the mark', async () => {
    // Arrange
    const user = userEvent.setup();
    const runs: Array<Record<string, unknown>> = [];

    // Act
    for (const change of ['type', 'suggestion'] as const) {
      const requests = stubFetch(neverAnswer);
      const { unmount } = await renderScreen2();
      const field = screen.getByRole('textbox', { name: 'Pregunta' });
      await user.type(field, 'hola');
      await user.keyboard('{Enter}');
      const markedBefore = field.getAttribute('aria-invalid') === 'true' && screen.queryByText(INVALID) !== null;
      if (change === 'type') {
        await user.type(field, 's');
      } else {
        await user.click(screen.getByRole('button', { name: Q3 }));
      }
      runs.push({
        markedBefore,
        invalid: field.getAttribute('aria-invalid'),
        describedBy: field.getAttribute('aria-describedby'),
        message: screen.queryByText(INVALID) !== null,
        bodies: requests.map((request) => request.init?.body),
      });
      unmount();
    }

    // Assert
    expect(runs).toEqual([
      { markedBefore: true, invalid: null, describedBy: null, message: false, bodies: [] },
      { markedBefore: true, invalid: null, describedBy: null, message: false, bodies: [`{"question":"${Q3}"}`] },
    ]);
  });
});

describe('Suggested questions', () => {
  it('A suggested question is sent at once', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen2();
    const suggestion = screen.getByRole('button', { name: Q1 });

    // Act
    await user.click(suggestion);

    // Assert
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(ASK_URL);
    expect(requests[0].init?.method).toBe('POST');
    expect(requests[0].init?.body).toBe(`{"question":"${Q1}"}`);
    expect((screen.getByRole('textbox', { name: 'Pregunta' }) as HTMLInputElement).value).toBe(Q1);
    expect(screen.getByRole('status').textContent).toBe(SEARCHING);
    expect(document.activeElement).toBe(suggestion);
  });
});

describe('Pending question', () => {
  it('Sending again while a question is pending sends no request', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen2();
    const field = screen.getByRole('textbox', { name: 'Pregunta' });

    // Act
    await user.click(screen.getByRole('button', { name: Q1 }));
    await user.click(screen.getByRole('button', { name: Q3 }));
    await user.click(field);
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Preguntar' }));

    // Assert
    expect(requests.map((request) => request.init?.body)).toEqual([`{"question":"${Q1}"}`]);
    expect((field as HTMLInputElement).value).toBe(Q1);
    expect(screen.getByRole('status').textContent).toBe(SEARCHING);
  });

  it('A pending question has no time limit of its own', async () => {
    // Arrange: only the page's timers are fake; React's scheduler keeps the real ones (design D30). The
    // press is a `fireEvent`: user-event waits on RTL's async wrapper, whose `setTimeout(0)` the fake
    // clock would never fire.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const requests = stubFetch(neverAnswer);
    renderAt(`/p/${PROJECT_ID}`);

    // Act
    fireEvent.click(screen.getByRole('button', { name: Q1 }));
    await act(() => vi.advanceTimersByTimeAsync(120_000));

    // Assert
    expect(screen.getByRole('status').textContent).toBe(SEARCHING);
    expect(requests).toHaveLength(1);
    expect(requests[0].init?.signal?.aborted).toBe(false);
  });

  it('Leaving the page aborts the pending question', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen2();

    // Act
    await user.click(screen.getByRole('button', { name: Q1 }));
    await user.click(screen.getByRole('link', { name: 'Volver a la selección de proyecto' }));
    await screen.findByRole('heading', { level: 1, name: 'Elige un proyecto para explorar' });

    // Assert
    const askRequest = requests.find((request) => request.url === ASK_URL);
    expect(askRequest?.init?.signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Answer with typed and verified statements', () => {
  it('An answered question shows the answer, its statements and its evidence', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, ANSWERED));
    await renderScreen2();
    const suggestion = screen.getByRole('button', { name: Q1 });

    // Act
    await user.click(suggestion);
    const answerHeading = await screen.findByRole('heading', { level: 2, name: 'Respuesta' });

    // Assert
    const paragraph = answerHeading.nextElementSibling;
    expect(paragraph?.tagName).toBe('P');
    expect(paragraph?.textContent).toBe('El precio final se calcula en PriceCalculator::compute().');
    expect(Array.from(paragraph?.querySelectorAll('code') ?? [], (code) => code.textContent)).toEqual([
      'PriceCalculator::compute()',
    ]);

    const orderedLists = screen.getAllByRole('list').filter((list) => list.tagName === 'OL');
    expect(orderedLists).toHaveLength(1);
    const items = within(orderedLists[0]).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(Array.from(items[0].querySelectorAll('code'), (code) => code.textContent)).toEqual(['compute()']);
    expect(within(items[0]).getByText('HECHO')).toBeDefined();
    expect(within(items[0]).getByText('verificado')).toBeDefined();
    expect(within(items[0]).getByText('Evidencia: ev-1')).toBeDefined();
    expect(within(items[1]).getByText('INFERIDO')).toBeDefined();
    expect(within(items[1]).getByText('sin verificar')).toBeDefined();
    expect(within(items[1]).getByText('Evidencia: ev-1, ev-2')).toBeDefined();
    for (const icon of ['●', '✓', '⚠', '○']) {
      const nodes = textNodesWith(orderedLists[0], icon);
      expect(nodes.length, `icon ${icon} is shown`).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node.parentElement?.closest('[aria-hidden="true"]'), `icon ${icon} is hidden`).not.toBeNull();
      }
    }

    const evidenceHeading = screen.getByRole('heading', { level: 2, name: 'Evidencia' });
    expect(precedes(orderedLists[0], evidenceHeading)).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(SEARCHING)).toBeNull();
    expect(document.body.textContent).not.toContain('0.71');
    expect(document.body.textContent).not.toContain('Confianza');
    expect(document.activeElement).toBe(suggestion);
  });

  it('Every combination of type and verification is labelled', async () => {
    // Arrange
    const user = userEvent.setup();
    const combinations: Array<[AskStatement['type'], AskStatement['verification']]> = [
      ['FACT', 'entailed'],
      ['FACT', 'cited'],
      ['INFERENCE', 'entailed'],
      ['INFERENCE', 'cited'],
    ];
    const statements = combinations.map(([type, verification], index) => ({
      text: `Afirmación ${index + 1}.`,
      type,
      verification,
      evidenceIds: index < 3 ? ['ev-1'] : [],
    }));
    stubFetch(answerWith(200, { ...ANSWERED, statements }));
    await renderScreen2();

    // Act
    await user.click(screen.getByRole('button', { name: Q1 }));
    await screen.findByRole('heading', { level: 2, name: 'Respuesta' });

    // Assert
    const orderedList = screen.getAllByRole('list').find((list) => list.tagName === 'OL');
    const items = within(orderedList as HTMLElement).getAllByRole('listitem');
    const labels = items.map((item) => [
      ['HECHO', 'INFERIDO'].filter((label) => within(item).queryByText(label) !== null),
      ['verificado', 'sin verificar'].filter((label) => within(item).queryByText(label) !== null),
      within(item).queryByText(/^Evidencia:/)?.textContent ?? null,
    ]);
    expect(labels).toEqual([
      [['HECHO'], ['verificado'], 'Evidencia: ev-1'],
      [['HECHO'], ['sin verificar'], 'Evidencia: ev-1'],
      [['INFERIDO'], ['verificado'], 'Evidencia: ev-1'],
      [['INFERIDO'], ['sin verificar'], null],
    ]);
  });

  it('Markup in an answer is shown as text', async () => {
    // Arrange
    const user = userEvent.setup();
    const markupAnswer: AskAnswered = {
      ...ANSWERED,
      answer: 'Usa <b>negrita</b> y `<i>x</i>`.',
      statements: [{ text: '<img src=x onerror=alert(1)>', type: 'FACT', verification: 'entailed', evidenceIds: ['ev-1'] }],
    };
    stubFetch(answerWith(200, markupAnswer));
    await renderScreen2();

    // Act
    await user.click(screen.getByRole('button', { name: Q1 }));
    const answerHeading = await screen.findByRole('heading', { level: 2, name: 'Respuesta' });

    // Assert
    const paragraph = answerHeading.nextElementSibling;
    expect(paragraph?.textContent).toBe('Usa <b>negrita</b> y <i>x</i>.');
    expect(paragraph?.querySelector('code')?.textContent).toBe('<i>x</i>');
    const orderedList = screen.getAllByRole('list').find((list) => list.tagName === 'OL');
    expect(orderedList?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(screen.getByRole('main').querySelectorAll('b, i, img')).toHaveLength(0);
  });
});
