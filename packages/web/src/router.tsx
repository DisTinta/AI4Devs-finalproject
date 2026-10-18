import type { ReactElement } from 'react';
import { createBrowserRouter, useParams, type RouteObject } from 'react-router';
import { PendingScreen } from './components/PendingScreen';
import { NotFoundPage } from './pages/NotFoundPage';

/** The Screen 2 placeholder: the project query screen, with the `projectId` of its path (DIS-65 replaces it). */
function ProjectQueryPlaceholder(): ReactElement {
  const { projectId = '' } = useParams();
  return <PendingScreen heading="Consulta del proyecto" detail={projectId} />;
}

/**
 * The routes of the web client (web-foundation, "Routes of the web client"; DIS-58 design D2). The app
 * mounts them in a browser router; the tests and the accessibility gate mount the same table in a memory
 * router.
 */
export const routes: RouteObject[] = [
  { path: '/', element: <PendingScreen heading="Elige un proyecto para explorar" /> },
  { path: '/p/:projectId', element: <ProjectQueryPlaceholder /> },
  { path: '*', element: <NotFoundPage /> },
];

/**
 * Creates the browser router of the app over {@link routes}.
 *
 * @returns The router `main.tsx` mounts.
 */
export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes);
}
