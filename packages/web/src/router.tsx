import type { ReactElement } from 'react';
import { createBrowserRouter, useParams, type RouteObject } from 'react-router';
import { AskPage } from './pages/AskPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectPickerPage } from './pages/ProjectPickerPage';
import { RouteErrorPage } from './pages/RouteErrorPage';

/**
 * Screen 2 for the `projectId` of its path, keyed by that id: going from one project to another remounts
 * the page, so no answer of the other project survives and its pending question is aborted (DIS-65
 * design D21).
 */
function ProjectQueryRoute(): ReactElement {
  const { projectId = '' } = useParams();
  return <AskPage key={projectId} projectId={projectId} />;
}

/**
 * The routes of the web client (web-foundation, "Paths of the web client and their screens"; DIS-58 design
 * D2): `/` is Screen 1, `/p/{projectId}` is Screen 2 (DIS-65) and any other path is the not-found screen.
 * One pathless root route wraps every screen and declares the app's error screen as its `errorElement`
 * (project-picker, "App error screen"; DIS-60 design D11): it has no element, so React Router renders its
 * children. The app mounts the table in a browser router; the tests and the accessibility gate mount the
 * same table in a memory router.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <ProjectPickerPage /> },
      { path: '/p/:projectId', element: <ProjectQueryRoute /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/**
 * Creates the browser router of the app over {@link routes}.
 *
 * @returns The router `main.tsx` mounts.
 */
export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes);
}
