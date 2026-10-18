import type { ReactElement } from 'react';
import { PageFrame } from '../components/PageFrame';
import { ProjectCard } from '../components/ProjectCard';
import { SAMPLE_PROJECTS } from '../data/sample-projects';
import { useApiHealth } from './useApiHealth';

/**
 * Screen 1 of the web client, on `/` (project-picker; DIS-60 design D2, D3, D8): the heading, the
 * subtitle and one card per project of the versioned sample-project constant, painted on the first
 * render without any HTTP request. The only request it sends is the API health check.
 *
 * @returns The project selection page.
 */
export function ProjectPickerPage(): ReactElement {
  const { status } = useApiHealth();
  return (
    <PageFrame>
      <h1 tabIndex={-1} className="text-lg font-semibold text-ink-muted">
        Elige un proyecto para explorar
      </h1>
      <p className="mt-1 text-sm text-ink-subtle">Repositorios precargados · sin registro · sin instalación</p>
      <ul aria-label="Proyectos de muestra" className="mt-6 flex flex-wrap justify-center gap-6">
        {SAMPLE_PROJECTS.map((project, position) => (
          <li key={project.id}>
            <ProjectCard project={project} position={position} apiStatus={status} />
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
