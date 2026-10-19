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

/** The provisional status of an `UNKNOWN` `no-anchor`. */
const UNKNOWN_NOTICE = 'Sin respuesta verificada (motivo: no-anchor).';

/** The first line of the provisional alert. */
const FAILED = 'No se ha podido obtener la respuesta.';

/** The second line of the provisional alert for an unavailable API. */
const UNAVAILABLE = 'La API de CODEMIND no responde.';

/** The `429` body of an exhausted daily budget, in the API's error format. */
const BUDGET_EXHAUSTED = {
  error: { code: 'BUDGET_EXHAUSTED', message: 'the daily LLM budget is exhausted', details: { cacheOnly: true } },
};

/** The suggested questions of acme-shop, in golden order. */
const Q1 = '¿Cómo se calcula el precio final de un pedido?';
const Q3 = '¿Cómo se validan los cupones?';
const Q4 = '¿Qué hace OrderObserver al crear un pedido?';

/** The excerpt of `ev-1`, with its line breaks and leading spaces. */
const EV1_EXCERPT = 'class PriceCalculator\n{\n    public function compute(Order $order): float\n}';

/** The excerpt of `ev-2`. */
const EV2_EXCERPT = '        return $order->shippingCost();';

/** The accessible names of the two evidence buttons of {@link ANSWERED}. */
const EV1_NAME = 'ev-1 · app/Services/PriceCalculator.php:16-44';
const EV2_NAME = 'ev-2 · app/Services/ShippingService.php:12';

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
    // No label of any language: the banner holds only the back arrow and the id.
    expect(banner.textContent).toBe(`←${OTHER_PROJECT_ID}`);
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

  it('A new question replaces what was shown', async () => {
    // Arrange
    const user = userEvent.setup();
    const firstAnswers: Array<{ answer: () => Promise<Response>; shown: () => Promise<unknown> }> = [
      { answer: answerWith(200, ANSWERED), shown: () => screen.findByRole('heading', { level: 2, name: 'Respuesta' }) },
      { answer: () => Promise.reject(new TypeError('fetch failed')), shown: () => screen.findByRole('alert') },
    ];
    const runs: Array<Record<string, unknown>> = [];

    // Act
    for (const { answer, shown } of firstAnswers) {
      stubFetch(answer);
      const { unmount } = await renderScreen2();
      await user.click(screen.getByRole('button', { name: Q1 }));
      await shown();
      const requests = stubFetch(neverAnswer);
      await user.click(screen.getByRole('button', { name: Q3 }));
      runs.push({
        requests: requests.length,
        status: screen.queryByRole('status')?.textContent,
        answer: screen.queryByRole('heading', { name: 'Respuesta' }) !== null,
        evidence: screen.queryByRole('heading', { name: 'Evidencia' }) !== null,
        previousStatements: screen.queryByText('El envío se suma al final.') !== null,
        alert: screen.queryByRole('alert') !== null,
      });
      unmount();
    }

    // Assert
    const replaced = { requests: 1, status: SEARCHING, answer: false, evidence: false, previousStatements: false, alert: false };
    expect(runs).toEqual([replaced, replaced]);
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

describe('Expandable evidence', () => {
  it('Evidence expands and collapses with a pointer', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, ANSWERED));
    await renderScreen2();
    await user.click(screen.getByRole('button', { name: Q1 }));
    const first = await screen.findByRole('button', { name: EV1_NAME });
    const second = screen.getByRole('button', { name: EV2_NAME });
    const before = {
      expanded: [first.getAttribute('aria-expanded'), second.getAttribute('aria-expanded')],
      pre: document.querySelectorAll('pre').length,
    };

    // Act
    await user.click(first);
    const afterOne = {
      expanded: first.getAttribute('aria-expanded'),
      pre: Array.from(document.querySelectorAll('pre'), (pre) => pre.textContent),
    };
    await user.click(first);
    const afterTwo = { expanded: first.getAttribute('aria-expanded'), pre: document.querySelectorAll('pre').length };

    // Assert
    expect(before).toEqual({ expanded: ['false', 'false'], pre: 0 });
    expect(afterOne).toEqual({ expanded: 'true', pre: [EV1_EXCERPT] });
    expect(afterTwo).toEqual({ expanded: 'false', pre: 0 });
  });

  it('Evidence expands with the keyboard, one item at a time', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, ANSWERED));
    await renderScreen2();
    await user.click(screen.getByRole('button', { name: Q1 }));
    const first = await screen.findByRole('button', { name: EV1_NAME });
    const second = screen.getByRole('button', { name: EV2_NAME });

    // Act
    const maxTabs = document.querySelectorAll('a, button, input, select, textarea, [tabindex]').length + 1;
    for (let presses = 0; presses < maxTabs && document.activeElement !== second; presses += 1) {
      await user.tab();
    }
    const focusedByKeyboard = document.activeElement === second;
    await user.keyboard('{Enter}');
    const afterEnter = {
      second: second.getAttribute('aria-expanded'),
      first: first.getAttribute('aria-expanded'),
      pre: Array.from(document.querySelectorAll('pre'), (pre) => pre.textContent),
    };
    await user.keyboard('[Space]');
    const afterSpace = { second: second.getAttribute('aria-expanded'), pre: document.querySelectorAll('pre').length };

    // Assert
    expect(focusedByKeyboard).toBe(true);
    expect(afterEnter).toEqual({ second: 'true', first: 'false', pre: [EV2_EXCERPT] });
    expect(afterSpace).toEqual({ second: 'false', pre: 0 });
  });

  it('Repeated evidence is listed as received', async () => {
    // Arrange
    const user = userEvent.setup();
    const excerpt = "    public function created(Order $order): void\n    {\n        event(new OrderCreated($order));\n    }";
    const repeated = { file: 'app/Observers/OrderObserver.php', startLine: 14, endLine: 28, excerpt };
    stubFetch(
      answerWith(200, {
        ...ANSWERED,
        statements: [{ text: 'OrderObserver lanza un evento.', type: 'FACT', verification: 'entailed', evidenceIds: ['ev-1', 'ev-2'] }],
        evidence: [
          { id: 'ev-1', ...repeated },
          { id: 'ev-2', ...repeated },
        ],
      }),
    );
    await renderScreen2();

    // Act
    await user.click(screen.getByRole('button', { name: Q4 }));
    const evidenceHeading = await screen.findByRole('heading', { level: 2, name: 'Evidencia' });
    const evidenceList = evidenceHeading.nextElementSibling as HTMLElement;
    const buttons = within(evidenceList).getAllByRole('button');
    await user.click(buttons[1]);

    // Assert
    expect(within(evidenceList).getAllByRole('listitem')).toHaveLength(2);
    expect(buttons.map((button) => button.textContent?.replace(/^[▸▾]/, ''))).toEqual([
      'ev-1 · app/Observers/OrderObserver.php:14-28',
      'ev-2 · app/Observers/OrderObserver.php:14-28',
    ]);
    expect(screen.getByRole('button', { name: 'ev-1 · app/Observers/OrderObserver.php:14-28' })).toBe(buttons[0]);
    expect(screen.getByRole('button', { name: 'ev-2 · app/Observers/OrderObserver.php:14-28' })).toBe(buttons[1]);
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Provisional notice for what is not an answer', () => {
  it('An UNKNOWN shows the provisional status', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, { answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [] }));
    await renderScreen2();

    // Act
    await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), '¿Por qué existe legacy_ref?');
    await user.keyboard('{Enter}');
    await screen.findByText(UNKNOWN_NOTICE);

    // Assert
    expect(screen.getByRole('status').textContent).toBe(UNKNOWN_NOTICE);
    expect(screen.queryByRole('heading', { name: 'Respuesta' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Evidencia' })).toBeNull();
    expect(document.querySelector('ol')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('An API error shows the provisional alert with its code', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(429, BUDGET_EXHAUSTED));
    await renderScreen2();
    const suggestion = screen.getByRole('button', { name: Q3 });

    // Act
    await user.click(suggestion);
    const alert = await screen.findByRole('alert');

    // Assert
    expect(within(alert).getByText(FAILED)).toBeDefined();
    expect(within(alert).getByText('Código: BUDGET_EXHAUSTED.')).toBeDefined();
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Respuesta' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(SEARCHING)).toBeNull();
    expect(document.activeElement).toBe(suggestion);
  });

  it('An unavailable API shows the provisional alert', async () => {
    // Arrange
    const user = userEvent.setup();
    const failures: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.resolve(new Response('', { status: 500 })),
    ];
    const runs: Array<Record<string, unknown>> = [];

    // Act
    for (const failure of failures) {
      stubFetch(failure);
      const { unmount } = await renderScreen2();
      await user.click(screen.getByRole('button', { name: Q3 }));
      const alert = await screen.findByRole('alert');
      runs.push({
        failed: within(alert).queryByText(FAILED) !== null,
        unavailable: within(alert).queryByText(UNAVAILABLE) !== null,
        answer: screen.queryByRole('heading', { name: 'Respuesta' }) !== null,
      });
      unmount();
    }

    // Assert
    expect(runs).toEqual([
      { failed: true, unavailable: true, answer: false },
      { failed: true, unavailable: true, answer: false },
    ]);
  });
});

describe('Accessibility of Screen 2', () => {
  it('The tab order follows question, suggestions and evidence', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, ANSWERED));
    await renderScreen2();
    await user.click(screen.getByRole('button', { name: Q1 }));
    await screen.findByRole('heading', { level: 2, name: 'Respuesta' });
    (document.activeElement as HTMLElement).blur();
    const startsOnBody = document.activeElement === document.body;
    const expected = [
      screen.getByRole('link', { name: 'Volver a la selección de proyecto' }),
      screen.getByRole('textbox', { name: 'Pregunta' }),
      screen.getByRole('button', { name: 'Preguntar' }),
      screen.getByRole('button', { name: Q1 }),
      screen.getByRole('button', { name: Q3 }),
      screen.getByRole('button', { name: Q4 }),
      screen.getByRole('button', { name: EV1_NAME }),
      screen.getByRole('button', { name: EV2_NAME }),
    ];

    // Act
    const visited: Array<Element | null> = [];
    for (let presses = 0; presses < 8; presses += 1) {
      await user.tab();
      visited.push(document.activeElement);
    }

    // Assert
    expect(startsOnBody).toBe(true);
    expect(visited).toEqual(expected);
  });
});
