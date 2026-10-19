import { useId, type ReactElement } from 'react';
import { Link } from 'react-router';
import type { SAMPLE_PROJECTS } from '../data/sample-projects';
import type { ApiHealthStatus } from '../pages/useApiHealth';
import { formatCount, languageIcon, stackLabel } from './project-display';

/** One project of the versioned sample-project constant. */
export type SampleProject = (typeof SAMPLE_PROJECTS)[number];

/** Props of {@link ProjectCard}. */
export interface ProjectCardProps {
  /** The project the card shows. */
  project: SampleProject;
  /** The card's position in the list, from 0: it picks the colour of the top stripe. */
  position: number;
  /** The API status, which fills the badge next to «indexado». */
  apiStatus: ApiHealthStatus;
}

/** The decorative icon and the written count of each of the four counts, in the wireframe's order. */
function countsOf(project: SampleProject): Array<{ icon: string; text: string }> {
  return [
    { icon: '📁', text: formatCount(project.fileCount, 'fichero', 'ficheros') },
    { icon: '🔷', text: formatCount(project.symbolCount, 'símbolo', 'símbolos') },
    { icon: '↔', text: formatCount(project.edgeCount, 'arista', 'aristas') },
    { icon: '📝', text: formatCount(project.commitCount, 'commit', 'commits') },
  ];
}

/** The badge next to «indexado»: what the page knows about the API (design D6, D23). */
function ApiStatusBadge({ apiStatus }: { apiStatus: ApiHealthStatus }): ReactElement | null {
  if (apiStatus === 'checking') {
    return <span className="rounded-full bg-canvas px-2.5 py-0.5 text-ink-muted">comprobando…</span>;
  }
  if (apiStatus === 'available') {
    return <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-accent">listo</span>;
  }
  return null;
}

/**
 * The card of one sample project on Screen 1 (project-picker, "Sample-project cards without HTTP"; DIS-60
 * design D3–D7): the name, the language and framework, the four counts, the «indexado» badge, the API
 * status badge and the link to the project's query screen. Every figure comes from `project`.
 *
 * @param props - The project, its position and the API status.
 * @returns The card, an article named by the project's name.
 */
export function ProjectCard({ project, position, apiStatus }: ProjectCardProps): ReactElement {
  const headingId = useId();
  const icon = languageIcon(project.language);
  return (
    <article
      aria-labelledby={headingId}
      className="w-72 overflow-hidden rounded-card border border-border bg-surface text-left"
    >
      <div aria-hidden="true" className={`h-1.5 ${position % 2 === 0 ? 'bg-stripe' : 'bg-stripe-soft'}`} />
      <div className="px-6 pt-4 pb-5">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-bold text-ink">
          {icon === undefined ? null : (
            <span aria-hidden="true" className="text-lg">
              {icon}
            </span>
          )}
          <span>{project.name}</span>
        </h2>
        <p className="mt-0.5 text-xs text-ink-subtle">{stackLabel(project.language, project.framework)}</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-ink-muted">
          {countsOf(project).map(({ icon: countIcon, text }) => (
            <li key={text} className="flex gap-1">
              <span aria-hidden="true">{countIcon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex h-6 items-center gap-2 text-xs font-semibold">
          <span className="inline-flex gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-success">
            <span aria-hidden="true">✓</span>
            <span>indexado</span>
          </span>
          <ApiStatusBadge apiStatus={apiStatus} />
        </div>
        <Link
          to={`/p/${encodeURIComponent(project.id)}`}
          className="mt-4 flex items-center justify-center gap-1 rounded-button bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Explorar proyecto
          <span className="sr-only"> {project.name}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
