import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../router';
import type { ImpactAnswered } from '../services/api-client';

// Spec: openspec/changes/impact-page/specs/impact-page/spec.md (Screen 3 of the web client; DIS-14). Every
// test renders the real route table in a memory router with `fetch` replaced by a double at the network
// edge (design D16), as `AskPage.test.tsx` does.

/** The acme-shop project of the seed. */
const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

/** A project id that is not in the sample-project constant (a project indexed with the CLI). */
const OTHER_PROJECT_ID = '0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f';

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

/** The impact URL of acme-shop. */
const IMPACT_URL = `/api/projects/${PROJECT_ID}/impact`;

/** The ellipsis of «Calculando impacto…» (U+2026), written by code point. */
const ELLIPSIS = String.fromCodePoint(0x2026);

/** The pending status. */
const CALCULATING = `Calculando impacto${ELLIPSIS}`;

/** The message of an invalid change. */
const INVALID = 'Describe el cambio en 5 a 500 caracteres.';

/** The change of the walkthrough step 4. */
const CHANGE = 'cambiar los descuentos de DiscountService';

/** The first line of every alert. */
const FAILED = 'No se ha podido obtener la respuesta.';

/** The Q2 report of `docs/DEMO.md` «Paso 4», as the API serialises it. */
const Q2: ImpactAnswered = {
  status: 'answered',
  direct: [
    { symbol: 'DiscountApplied', file: 'app/Events/DiscountApplied.php', origin: 'graph', resolution: 'exact', hops: 0 },
    { symbol: 'DiscountService', file: 'app/Services/DiscountService.php', origin: 'graph', resolution: 'exact', hops: 0 },
    { symbol: 'RecordDiscountAudit', file: 'app/Listeners/RecordDiscountAudit.php', origin: 'graph', resolution: 'exact', hops: 0 },
    { symbol: 'PriceCalculator', file: 'app/Services/PriceCalculator.php', origin: 'graph', resolution: 'exact', hops: 1 },
    {
      symbol: 'app/Providers/AppServiceProvider.php',
      file: 'app/Providers/AppServiceProvider.php',
      origin: 'graph',
      resolution: 'exact',
      hops: 1,
    },
    {
      symbol: 'app/Providers/EventServiceProvider.php',
      file: 'app/Providers/EventServiceProvider.php',
      origin: 'graph',
      resolution: 'exact',
      hops: 1,
    },
  ],
  indirect: [
    { symbol: 'CheckoutController', file: 'app/Http/Controllers/CheckoutController.php', origin: 'graph', resolution: 'heuristic', hops: 2 },
    { symbol: 'OrderController', file: 'app/Http/Controllers/OrderController.php', origin: 'graph', resolution: 'heuristic', hops: 2 },
    { symbol: 'RecalculateTotals', file: 'app/Jobs/RecalculateTotals.php', origin: 'graph', resolution: 'heuristic', hops: 2 },
    { symbol: 'SendOrderConfirmation', file: 'app/Listeners/SendOrderConfirmation.php', origin: 'graph', resolution: 'heuristic', hops: 2 },
  ],
  tests: [
    { symbol: 'DiscountServiceTest', file: 'tests/Unit/DiscountServiceTest.php', origin: 'graph' },
    { symbol: 'OrderPricingTest', file: 'tests/Feature/OrderPricingTest.php', origin: 'graph' },
    { symbol: 'PriceCalculatorTest', file: 'tests/Unit/PriceCalculatorTest.php', origin: 'graph' },
  ],
  docs: [{ path: 'README.md', stale: false }],
  history: [{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24, 33, 55], origin: 'git' }],
  risk: {
    level: 'HIGH',
    rationale:
      '10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.',
  },
};

/** The honest `unknown` body. */
const UNKNOWN = { status: 'unknown', reason: 'no-anchor' };

/** An answer of the API: `status` with `body` as JSON. */
function answerWith(status: number, body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** A `fetch` that fails as a network failure does. */
function failing(): Promise<Response> {
  return Promise.reject(new TypeError('fetch failed'));
}

/** Whether `first` comes before `second` in document order. */
function precedes(first: Node, second: Node): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/**
 * Renders Screen 3 of acme-shop and waits for its level-1 heading.
 *
 * @returns What `render` returns, to unmount between runs.
 */
async function renderScreen3(): Promise<ReturnType<typeof render>> {
  const rendered = renderAt(`/p/${PROJECT_ID}/impact`);
  await screen.findByRole('heading', { level: 1, name: 'acme-shop' });
  return rendered;
}

/** The field «Cambio». */
function changeField(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Cambio' });
}

/** Replaces the text of the field and presses Enter in it. */
async function sendChange(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const field = changeField();
  await user.clear(field);
  await user.type(field, `${text}{Enter}`);
}

/** The text of each paragraph of the alert on screen. */
function alertLines(): string[] {
  return Array.from(screen.getByRole('alert').querySelectorAll('p')).map((line) => line.textContent ?? '');
}

/** The text of each list item of the section named `name`. */
function itemsOf(name: string): string[] {
  return within(screen.getByRole('region', { name })).queryAllByRole('listitem').map((item) => item.textContent ?? '');
}

/** Shows the Q2 report on a fresh Screen 3 and returns the unmount of its render. */
async function showQ2(user: ReturnType<typeof userEvent.setup>): Promise<{ unmount: () => void }> {
  stubFetch(answerWith(200, Q2));
  const { unmount } = await renderScreen3();
  await sendChange(user, CHANGE);
  await screen.findByRole('heading', { level: 2, name: 'Directo' });
  return { unmount };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Screen 3 frame and navigation', () => {
  it('Screen 3 opens on a sample project without any request', async () => {
    // Arrange
    const requests = stubFetch(neverAnswer);

    // Act
    renderAt(`/p/${PROJECT_ID}/impact`);
    const heading = await screen.findByRole('heading', { level: 1 });

    // Assert
    const banner = screen.getByRole('banner');
    const back = within(banner).getByRole('link', { name: 'Volver a la selección de proyecto' });
    expect(back.getAttribute('href')).toBe('/');
    expect(banner.contains(heading)).toBe(true);
    expect(heading.textContent).toBe('acme-shop');
    expect(within(banner).getByText('PHP / Laravel · 170 aristas')).toBeDefined();

    const main = screen.getByRole('main');
    const field = within(main).getByRole('textbox', { name: 'Cambio' });
    const hops = within(main).getByRole('combobox', { name: 'Saltos del grafo' }) as HTMLSelectElement;
    const send = within(main).getByRole('button', { name: 'Analizar' });
    expect(within(hops).getAllByRole('option').map((option) => option.textContent)).toEqual(['1', '2', '3']);
    expect(hops.value).toBe('2');
    expect(
      [field, hops, send].every((control, index, controls) => index === 0 || controls[index - 1].compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual(['']);

    const nav = screen.getByRole('navigation', { name: 'Navegación del proyecto' });
    expect(main.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.contains(nav)).toBe(false);
    expect(within(nav).getByRole('link', { name: 'Volver a las preguntas' }).getAttribute('href')).toBe(`/p/${PROJECT_ID}`);
    expect(requests).toHaveLength(0);
  });

  it('Screen 3 of a project outside the sample constant is shown by its id and leads back', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    renderAt(`/p/${OTHER_PROJECT_ID}/impact`);
    const heading = await screen.findByRole('heading', { level: 1 });
    const headingBefore = heading.textContent;
    const arista = screen.getByRole('banner').textContent?.includes('aristas');

    // Act
    await user.click(screen.getByRole('link', { name: 'Volver a las preguntas' }));
    await screen.findByRole('textbox', { name: 'Pregunta' });

    // Assert
    expect(headingBefore).toBe(OTHER_PROJECT_ID);
    expect(arista).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Cambio' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(OTHER_PROJECT_ID);
    expect(requests).toHaveLength(0);
  });

  it("Another project's Screen 3 starts empty", async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, Q2));
    const router = createMemoryRouter(routes, { initialEntries: [`/p/${PROJECT_ID}/impact`] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: 'acme-shop' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saltos del grafo' }), '3');
    await sendChange(user, CHANGE);
    await screen.findByRole('heading', { level: 2, name: 'Directo' });

    // Act
    await act(() => router.navigate(`/p/${OTHER_PROJECT_ID}/impact`));
    await screen.findByRole('heading', { level: 1, name: OTHER_PROJECT_ID });

    // Assert
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(changeField().value).toBe('');
    expect((screen.getByRole('combobox', { name: 'Saltos del grafo' }) as HTMLSelectElement).value).toBe('2');
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual(['']);
  });
});

describe('Change box', () => {
  it('A valid change is sent trimmed with the selected hops', async () => {
    // Arrange
    const user = userEvent.setup();
    const written = `  ${CHANGE}  `;
    const runs: Array<{ requests: RecordedRequest[]; field: HTMLInputElement; hops: string; focused: Element | null; expected: Element }> = [];

    // Act
    for (const via of ['button', 'hops-1', 'hops-3'] as const) {
      const requests = stubFetch(neverAnswer);
      const { unmount } = await renderScreen3();
      const field = changeField();
      const list = screen.getByRole('combobox', { name: 'Saltos del grafo' }) as HTMLSelectElement;
      const button = screen.getByRole('button', { name: 'Analizar' });
      if (via === 'button') {
        await user.type(field, written);
        await user.click(button);
      } else {
        await user.selectOptions(list, via === 'hops-1' ? '1' : '3');
        await user.type(field, `${written}{Enter}`);
      }
      runs.push({ requests: [...requests], field, hops: list.value, focused: document.activeElement, expected: via === 'button' ? button : field });
      unmount();
    }

    // Assert
    const bodies = [
      `{"change":"${CHANGE}","maxHops":2}`,
      `{"change":"${CHANGE}","maxHops":1}`,
      `{"change":"${CHANGE}","maxHops":3}`,
    ];
    runs.forEach(({ requests, focused, expected }, index) => {
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(IMPACT_URL);
      expect(requests[0].init?.method).toBe('POST');
      expect(new Headers(requests[0].init?.headers).get('content-type')).toBe('application/json');
      expect(requests[0].init?.body).toBe(bodies[index]);
      expect(focused).toBe(expected);
    });
    expect(runs.map(({ field }) => field.value)).toEqual([written, written, written]);
    expect(runs.map(({ hops }) => hops)).toEqual(['2', '1', '3']);
  });

  it('An invalid change is not sent', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen3();
    const field = changeField();
    const inputs = ['hola', '     ', '  hola  ', 'a'.repeat(501), 'cambiar\u0000descuentos'];
    const afterEachSend: Array<Record<string, unknown>> = [];
    let previousAlert: HTMLElement | undefined;
    const alertsAreNew: boolean[] = [];

    // Act
    const observe = (): void => {
      const describedBy = field.getAttribute('aria-describedby');
      const description = describedBy === null ? null : document.getElementById(describedBy);
      const alerts = screen.getAllByRole('alert');
      alertsAreNew.push(alerts[0] !== previousAlert);
      previousAlert = alerts[0];
      afterEachSend.push({
        requests: requests.length,
        invalid: field.getAttribute('aria-invalid'),
        description: description?.textContent,
        alerts: alerts.map((alert) => alert.textContent),
        describedByAlert: description === alerts[0],
        focusOnField: document.activeElement === field,
        calculating: screen.queryByText(CALCULATING) !== null,
      });
    };
    for (const input of inputs) {
      fireEvent.change(field, { target: { value: input } });
      await user.click(field);
      await user.keyboard('{Enter}');
      observe();
    }
    await user.keyboard('{Enter}');
    observe();

    // Assert
    const expected = {
      requests: 0,
      invalid: 'true',
      description: INVALID,
      alerts: [INVALID],
      describedByAlert: true,
      focusOnField: true,
      calculating: false,
    };
    expect(afterEachSend).toEqual([...inputs, 'again'].map(() => expected));
    expect(alertsAreNew).toEqual([true, true, true, true, true, true]);
  });

  it('Changing an invalid change clears the mark', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen3();
    const field = changeField();
    await user.type(field, 'hola{Enter}');
    const markedBefore = field.getAttribute('aria-invalid') === 'true' && screen.queryByText(INVALID) !== null;

    // Act
    await user.type(field, 's');

    // Assert
    expect(markedBefore).toBe(true);
    expect(field.getAttribute('aria-invalid')).toBeNull();
    expect(field.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText(INVALID)).toBeNull();
    expect(requests).toHaveLength(0);
  });
});

describe('Pending report', () => {
  it('Sending again while a report is pending sends no request', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen3();

    // Act
    await sendChange(user, CHANGE);
    await sendChange(user, 'hola');
    await user.click(screen.getByRole('button', { name: 'Analizar' }));

    // Assert
    expect(requests).toHaveLength(1);
    expect(screen.getByText(CALCULATING, { selector: '[aria-hidden="true"]' })).toBeDefined();
    expect(changeField().getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('A pending report has no time limit of its own', async () => {
    // Arrange: only the page's timers are fake; React's scheduler keeps the real ones. The send is a
    // `fireEvent`: user-event waits on RTL's async wrapper, whose `setTimeout(0)` the fake clock would
    // never fire.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const requests = stubFetch(neverAnswer);
    renderAt(`/p/${PROJECT_ID}/impact`);

    // Act
    fireEvent.change(changeField(), { target: { value: CHANGE } });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar' }));
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    // Assert
    expect(screen.getByText(CALCULATING, { selector: '[aria-hidden="true"]' })).toBeDefined();
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual([CALCULATING]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0].init?.signal?.aborted).toBe(false);
  });

  it('A new change replaces the report that was shown', async () => {
    // Arrange
    const user = userEvent.setup();
    await showQ2(user);
    stubFetch(neverAnswer);

    // Act
    await sendChange(user, 'cambiar el envío de ShippingService');

    // Assert
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.getByText(CALCULATING, { selector: '[aria-hidden="true"]' })).toBeDefined();
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual([CALCULATING]);
  });

  it('Leaving the page aborts the pending report', async () => {
    // Arrange
    const user = userEvent.setup();
    const requests = stubFetch(neverAnswer);
    await renderScreen3();

    // Act
    await sendChange(user, CHANGE);
    await user.click(screen.getByRole('link', { name: 'Volver a las preguntas' }));
    await screen.findByRole('textbox', { name: 'Pregunta' });

    // Assert
    expect(requests).toHaveLength(1);
    expect(requests[0].init?.signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Answered report', () => {
  it('The answered report shows its five sections, its origins and its risk', async () => {
    // Arrange
    const user = userEvent.setup();

    // Act
    await showQ2(user);

    // Assert
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Directo',
      'Indirecto',
      'Tests',
      'Documentación',
      'Historial',
      'Riesgo alto',
    ]);
    headings.slice(1).forEach((heading, index) => expect(precedes(headings[index], heading)).toBe(true));

    const direct = itemsOf('Directo');
    expect(direct).toHaveLength(6);
    expect(direct[0]).toBe('DiscountApplied · app/Events/DiscountApplied.php · 0 saltos · exacta · [grafo]');
    expect(direct[3]).toBe('PriceCalculator · app/Services/PriceCalculator.php · 1 salto · exacta · [grafo]');
    expect(direct[4]).toBe('app/Providers/AppServiceProvider.php · 1 salto · exacta · [grafo]');
    expect(direct[5]).toBe('app/Providers/EventServiceProvider.php · 1 salto · exacta · [grafo]');
    expect(direct.map((text) => text.split(' · ')[0])).toEqual([
      'DiscountApplied',
      'DiscountService',
      'RecordDiscountAudit',
      'PriceCalculator',
      'app/Providers/AppServiceProvider.php',
      'app/Providers/EventServiceProvider.php',
    ]);

    const indirect = itemsOf('Indirecto');
    expect(indirect).toHaveLength(4);
    for (const text of indirect) {
      expect(text).toContain('2 saltos');
      expect(text).toContain('heurística');
    }
    const tests = itemsOf('Tests');
    expect(tests).toEqual([
      'DiscountServiceTest · tests/Unit/DiscountServiceTest.php · [grafo]',
      'OrderPricingTest · tests/Feature/OrderPricingTest.php · [grafo]',
      'PriceCalculatorTest · tests/Unit/PriceCalculatorTest.php · [grafo]',
    ]);
    for (const text of [...direct, ...indirect, ...tests]) {
      expect(text.endsWith('[grafo]')).toBe(true);
    }

    const docs = itemsOf('Documentación');
    expect(docs).toEqual(['README.md · al día']);
    expect(docs[0]).not.toMatch(/\[(grafo|git)\]/);
    const history = itemsOf('Historial');
    expect(history).toEqual(['app/Services/ShippingService.php · co-cambia 100 % · PR #24, #33, #55 · [git]']);

    const risk = screen.getByRole('region', { name: 'Riesgo alto' });
    expect(risk.textContent).toBe(`Riesgo alto${Q2.risk.rationale}`);
    const legend = screen.getByText('Origen: [grafo] análisis estático determinista · [git] señal histórica de co-cambio');
    const deterministic = screen.getByText('Informe determinista: sin llamada al modelo de lenguaje.');
    expect(precedes(risk, legend)).toBe(true);
    expect(precedes(legend, deterministic)).toBe(true);

    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual(['Informe de impacto recibido.']);
    expect(document.activeElement).toBe(changeField());
  });

  it('An empty section, a stale document and a history entry without pull requests', async () => {
    // Arrange
    const user = userEvent.setup();
    const stale = '0123456789abcdef0123456789abcdef01234567';
    stubFetch(
      answerWith(200, {
        ...Q2,
        indirect: [],
        docs: [{ path: 'docs/pricing.md', stale: true, staleSince: stale }],
        history: [{ file: 'app/Services/ShippingService.php', coChangeRate: 0.8, prs: [], origin: 'git' }],
      }),
    );
    await renderScreen3();

    // Act
    await sendChange(user, CHANGE);
    await screen.findByRole('heading', { level: 2, name: 'Indirecto' });

    // Assert
    const indirect = screen.getByRole('region', { name: 'Indirecto' });
    expect(within(indirect).getByText('Sin elementos')).toBeDefined();
    expect(within(indirect).queryAllByRole('listitem')).toHaveLength(0);
    const [doc] = itemsOf('Documentación');
    expect(doc).toContain('docs/pricing.md');
    expect(doc).toContain('desactualizada desde el commit 0123456');
    expect(screen.getByText('⚠').closest('[aria-hidden="true"]')).not.toBeNull();
    const [entry] = itemsOf('Historial');
    expect(entry).toContain('co-cambia 80 %');
    expect(entry).toContain('sin PR');
  });

  it('Texts of the API in the report are shown as text', async () => {
    // Arrange
    const user = userEvent.setup();
    const symbol = '<img src=x onerror=alert(1)>';
    const rationale = '<b>alto</b>';
    stubFetch(
      answerWith(200, {
        ...Q2,
        direct: [{ ...Q2.direct[0], symbol }, ...Q2.direct.slice(1)],
        risk: { level: 'HIGH', rationale },
      }),
    );
    await renderScreen3();

    // Act
    await sendChange(user, CHANGE);
    await screen.findByRole('heading', { level: 2, name: 'Directo' });

    // Assert
    expect(screen.getByText(symbol)).toBeDefined();
    expect(screen.getByText(rationale)).toBeDefined();
    const main = screen.getByRole('main');
    expect(main.querySelector('img')).toBeNull();
    expect(main.querySelector('b')).toBeNull();
  });
});

describe('Risk', () => {
  it('Every risk level is written in words', async () => {
    // Arrange
    const user = userEvent.setup();
    const runs: Array<{ heading: string; text: string }> = [];

    // Act
    for (const level of ['HIGH', 'MEDIUM', 'LOW'] as const) {
      stubFetch(answerWith(200, { ...Q2, risk: { level, rationale: 'r' } }));
      const { unmount } = await renderScreen3();
      await sendChange(user, CHANGE);
      await screen.findByRole('heading', { level: 2, name: /^Riesgo/ });
      const region = screen.getByRole('region', { name: /^Riesgo/ });
      runs.push({ heading: within(region).getByRole('heading', { level: 2 }).textContent ?? '', text: region.textContent ?? '' });
      unmount();
    }

    // Assert
    expect(runs).toEqual([
      { heading: 'Riesgo alto', text: 'Riesgo altor' },
      { heading: 'Riesgo medio', text: 'Riesgo medior' },
      { heading: 'Riesgo bajo', text: 'Riesgo bajor' },
    ]);
  });
});

describe('Unknown report', () => {
  it('An unknown report says the change anchors nothing', async () => {
    // Arrange
    const user = userEvent.setup();
    stubFetch(answerWith(200, UNKNOWN));
    await renderScreen3();

    // Act
    await sendChange(user, 'mejorar el rendimiento general');
    await screen.findByRole('heading', { level: 2, name: 'Sin ancla en el grafo' });

    // Assert
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(
      screen.getByText(
        'El cambio no nombra ningún símbolo ni fichero que CODEMIND encuentre en el grafo de este proyecto, así que no hay nada desde lo que calcular el impacto. Nombra una clase o un fichero, por ejemplo DiscountService.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Motivo: no-anchor')).toBeDefined();
    expect(screen.queryByText('Directo')).toBeNull();
    expect(screen.queryByText(/Riesgo/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual(['Sin ancla en el grafo.']);
    expect(document.activeElement).toBe(changeField());
  });
});

describe('Error alerts', () => {
  it('A rate limit, an API error and an unavailable API are alerted', async () => {
    // Arrange
    const user = userEvent.setup();
    const failure = (code: string, message: string, details: unknown) => ({ error: { code, message, details } });
    const answers: Array<{ answer: () => Promise<Response>; lines: string[] }> = [
      {
        answer: answerWith(429, failure('RATE_LIMITED', 'too many requests', { retryAfterSeconds: 30 })),
        lines: [FAILED, 'Demasiadas peticiones seguidas a la API.', 'Espera 30 s y vuelve a preguntar.', 'Código: RATE_LIMITED.'],
      },
      {
        answer: answerWith(404, failure('PROJECT_NOT_FOUND', 'project not found', {})),
        lines: [FAILED, 'La API no tiene este proyecto: vuelve a la selección de proyecto o indéxalo con la CLI.', 'Código: PROJECT_NOT_FOUND.'],
      },
      {
        answer: answerWith(400, failure('INVALID_IMPACT_REQUEST', 'invalid request', { field: 'maxHops' })),
        lines: [FAILED, 'Código: INVALID_IMPACT_REQUEST.'],
      },
      { answer: answerWith(500, failure('INTERNAL', 'internal error', {})), lines: [FAILED, 'Código: INTERNAL.'] },
      { answer: failing, lines: [FAILED, 'La API de CODEMIND no responde.'] },
    ];
    const runs: Array<Record<string, unknown>> = [];

    // Act
    for (const { answer } of answers) {
      stubFetch(answer);
      const { unmount } = await renderScreen3();
      await sendChange(user, CHANGE);
      await screen.findByRole('alert');
      runs.push({
        lines: alertLines(),
        headings: screen.queryAllByRole('heading', { level: 2 }).length,
        status: screen.getAllByRole('status').map((status) => status.textContent),
        focusOnField: document.activeElement === changeField(),
      });
      unmount();
    }

    // Assert
    expect(runs).toEqual(answers.map(({ lines }) => ({ lines, headings: 0, status: [''], focusOnField: true })));
  });

  it('A failure removes the report that was shown', async () => {
    // Arrange
    const user = userEvent.setup();
    await showQ2(user);
    stubFetch(failing);

    // Act
    await sendChange(user, 'cambiar el envío de ShippingService');
    await screen.findByRole('alert');

    // Assert
    expect(screen.getByText('La API de CODEMIND no responde.')).toBeDefined();
    expect(screen.queryByText('Directo')).toBeNull();
    expect(screen.queryByText('Riesgo alto')).toBeNull();
  });
});

describe('Screen reader announcements of Screen 3', () => {
  it('The status region announces every outcome', async () => {
    // Arrange
    const user = userEvent.setup();
    const answers: Array<() => Promise<Response>> = [answerWith(200, Q2), answerWith(200, UNKNOWN), failing];
    let answered = 0;
    stubFetch(() => answers[answered++]());
    await renderScreen3();
    const region = screen.getByRole('status');
    const texts: Array<string | null> = [];
    const sameRegion: boolean[] = [];
    const read = (): void => {
      const statuses = screen.getAllByRole('status');
      sameRegion.push(statuses.length === 1 && statuses[0] === region);
      texts.push(region.textContent);
    };

    // Act
    read();
    await sendChange(user, CHANGE);
    await screen.findByRole('heading', { level: 2, name: 'Directo' });
    read();
    await sendChange(user, 'hola');
    read();
    await sendChange(user, 'mejorar el rendimiento general');
    await screen.findByRole('heading', { level: 2, name: 'Sin ancla en el grafo' });
    read();
    await sendChange(user, 'cambiar el envío de ShippingService');
    await screen.findByRole('alert', { name: '' });
    read();

    // Assert
    expect(answered).toBe(3);
    expect(texts).toEqual(['', 'Informe de impacto recibido.', 'Informe de impacto recibido.', 'Sin ancla en el grafo.', '']);
    expect(sameRegion).toEqual([true, true, true, true, true]);
  });
});

describe('Accessibility of Screen 3', () => {
  it('The tab order of Screen 3 skips the report', async () => {
    // Arrange
    const user = userEvent.setup();
    const results: Array<{ answer: () => Promise<Response>; shown: () => Promise<unknown> }> = [
      { answer: answerWith(200, Q2), shown: () => screen.findByRole('heading', { level: 2, name: 'Directo' }) },
      { answer: failing, shown: () => screen.findByRole('alert') },
      { answer: answerWith(200, UNKNOWN), shown: () => screen.findByRole('heading', { level: 2, name: 'Sin ancla en el grafo' }) },
    ];
    const runs: Array<{ startsOnBody: boolean; visited: Array<Element | null>; expected: Element[] }> = [];

    // Act
    for (const { answer, shown } of results) {
      stubFetch(answer);
      const { unmount } = await renderScreen3();
      await sendChange(user, CHANGE);
      await shown();
      (document.activeElement as HTMLElement).blur();
      const startsOnBody = document.activeElement === document.body;
      const expected = [
        screen.getByRole('link', { name: 'Volver a la selección de proyecto' }),
        changeField(),
        screen.getByRole('combobox', { name: 'Saltos del grafo' }),
        screen.getByRole('button', { name: 'Analizar' }),
        screen.getByRole('link', { name: 'Volver a las preguntas' }),
      ];
      const visited: Array<Element | null> = [];
      for (let presses = 0; presses < 5; presses += 1) {
        await user.tab();
        visited.push(document.activeElement);
      }
      runs.push({ startsOnBody, visited, expected });
      unmount();
    }

    // Assert
    expect(runs.map(({ startsOnBody }) => startsOnBody)).toEqual([true, true, true]);
    for (const { visited, expected } of runs) {
      expect(visited).toEqual(expected);
    }
  });
});
