import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from './router';

/** Renders the web client's routes in a memory router at `path`. */
function renderAt(path: string): void {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
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
