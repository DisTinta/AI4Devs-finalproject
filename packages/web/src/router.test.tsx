import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from './router';

/** The acme-shop project of the seed. */
const PROJECT_ID = 'a794456d-6d1b-5b55-a360-13fec83dc7bc';

/** Replaces the global `fetch` with a double that records every request and never answers. */
function recordRequests(): unknown[] {
  const requests: unknown[] = [];
  vi.stubGlobal('fetch', (...args: unknown[]) => {
    requests.push(args);
    return new Promise(() => undefined);
  });
  return requests;
}

/** Renders the web client's routes in a memory router at `path`. */
function renderAt(path: string): void {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

/** The text of every element directly inside the main landmark, in order. */
function mainBlocks(): string[] {
  return Array.from(screen.getByRole('main').children, (child) => child.textContent ?? '');
}

/** Asserts the banner holds the product name and its tagline. */
function expectBanner(): void {
  const banner = screen.getByRole('banner');
  expect(within(banner).getByText('CODEMIND')).toBeDefined();
  expect(within(banner).getByText('Comprensión de repositorios con evidencia verificable')).toBeDefined();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Routes of the web client', () => {
  it('A project path shows the Screen 2 placeholder with its id', async () => {
    // Arrange
    const requests = recordRequests();

    // Act
    renderAt(`/p/${PROJECT_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Consulta del proyecto' });

    // Assert
    expect(screen.getByText(PROJECT_ID)).toBeDefined();
    expectBanner();
    expect(mainBlocks()).toEqual(['Consulta del proyecto', 'Esta pantalla está en construcción.', PROJECT_ID]);
    expect(screen.getByText(PROJECT_ID).tagName).toBe('P');
    expect(requests).toHaveLength(0);
  });

  it('An unknown path shows the not-found screen and leads back', async () => {
    // Arrange
    const user = userEvent.setup();
    renderAt('/no-existe');
    const notFoundHeading = await screen.findByRole('heading', { level: 1 });
    const beforeClick = notFoundHeading.textContent;
    expectBanner();

    // Act
    await user.click(screen.getByRole('link', { name: 'Volver a la selección de proyecto' }));

    // Assert
    expect(beforeClick).toBe('Página no encontrada');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Elige un proyecto para explorar' }),
    ).toBeDefined();
  });
});

describe('Component test environment', () => {
  it('Leak check, step 1: the not-found screen is rendered first', async () => {
    // Arrange / Act
    renderAt('/no-existe');

    // Assert
    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeDefined();
  });

  it('Rendered output does not leak between tests', async () => {
    // Arrange: the previous test rendered the not-found screen.

    // Act
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Elige un proyecto para explorar' });

    // Assert
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Elige un proyecto para explorar');
  });
});
