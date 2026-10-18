import { useEffect, useRef, type ReactElement } from 'react';
import { ErrorBanner } from '../components/ErrorBanner';
import { PageFrame } from '../components/PageFrame';
import { ProjectCard } from '../components/ProjectCard';
import { SAMPLE_PROJECTS } from '../data/sample-projects';
import { useApiHealth } from './useApiHealth';

/**
 * Screen 1 of the web client, on `/` (project-picker; DIS-60 design D2, D3, D8): the heading, the
 * subtitle and one card per project of the versioned sample-project constant, painted on the first
 * render without any HTTP request. The only request it sends is the API health check; when it fails, an
 * alert between the subtitle and the cards says so and offers a retry (design D9).
 *
 * @returns The project selection page.
 */
export function ProjectPickerPage(): ReactElement {
  const { status, retrying, retry } = useApiHealth();
  const heading = useRef<HTMLHeadingElement>(null);
  const retried = useRef(false);

  // Only a successful retry moves the focus: its button disappears (design D17, D25).
  useEffect(() => {
    if (status === 'available' && retried.current) {
      heading.current?.focus();
    }
  }, [status]);

  const onRetry = (): void => {
    retried.current = true;
    retry();
  };

  return (
    <PageFrame>
      <h1 ref={heading} tabIndex={-1} className="text-lg font-semibold text-ink-muted">
        Elige un proyecto para explorar
      </h1>
      <p className="mt-1 text-sm text-ink-subtle">Repositorios precargados · sin registro · sin instalación</p>
      {status === 'unavailable' ? (
        <ErrorBanner onRetry={onRetry} retrying={retrying}>
          La API de CODEMIND no está disponible. Puedes ver los proyectos, pero no preguntar hasta que vuelva.
          Arráncala con <code>make up</code> y pulsa Reintentar.
        </ErrorBanner>
      ) : null}
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
