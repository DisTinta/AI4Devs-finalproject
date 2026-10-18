import type { ReactElement } from 'react';
import { createBrowserRouter, useParams, type RouteObject } from 'react-router';
import { PendingScreen } from './components/PendingScreen';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectPickerPage } from './pages/ProjectPickerPage';
import { RouteErrorPage } from './pages/RouteErrorPage';

/** The Screen 2 placeholder: the project query screen, with the `projectId` of its path (DIS-65 replaces it). */
function ProjectQueryPlaceholder(): ReactElement {
  const { projectId = '' } = useParams();
  return <PendingScreen heading="Consulta del proyecto" detail={projectId} />;
}

/**
 * The routes of the web client (web-foundation, "Routes and screens of the web client"; DIS-58 design D2).
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
      { path: '/p/:projectId', element: <ProjectQueryPlaceholder /> },
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
