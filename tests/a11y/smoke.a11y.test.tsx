import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SAMPLE_PROJECTS } from '../../packages/web/src/data/sample-projects';
import { routes } from '../../packages/web/src/router';

// The accessibility gate of the web client (`npm run test:a11y`; web-foundation, "Accessibility gate on
// the real routes"; DIS-58 design D11, D21). It renders the real route table, so it scans whatever
// screen DIS-60/65/66 put on each route without being edited. axe in jsdom computes no styles: colour
// contrast is the theme test's job (`packages/web/src/theme.test.ts`), and keyboard and focus are
// checked by hand.

/** The paths the gate scans: Screen 1, Screen 2 of the seed project, and an unknown path. */
const SCANNED_PATHS = ['/', `/p/${SAMPLE_PROJECTS[0].id}`, '/ruta-que-no-existe'];

/** The ids of the rules axe found violated, for a readable failure. */
function violatedRules(results: axe.AxeResults): string[] {
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('Accessibility gate on the real routes', () => {
  it('The negative control proves axe runs', async () => {
    // Arrange: an image without alternative text, rendered with RTL so the setup's cleanup removes it.
    render(<img src="x.png" />);

    // Act
    const results = await axe.run(document);

    // Assert
    expect(results.violations.map((violation) => violation.id)).toContain('image-alt');
  });

  it('The three routes have no axe violations', async () => {
    // Arrange: the document as index.html declares it.
    document.documentElement.lang = 'es';
    document.title = 'CODEMIND';

    // Act
    const violationsByPath: Record<string, string[]> = {};
    for (const path of SCANNED_PATHS) {
      const { unmount } = render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />,
      );
      await screen.findByRole('heading', { level: 1 });
      violationsByPath[path] = violatedRules(await axe.run(document));
      unmount();
    }

    // Assert
    expect(violationsByPath).toEqual(Object.fromEntries(SCANNED_PATHS.map((path) => [path, []])));
  });
});
