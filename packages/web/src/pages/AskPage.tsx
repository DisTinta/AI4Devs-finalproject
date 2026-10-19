import { useState, type ReactElement } from 'react';
import { PageFrame } from '../components/PageFrame';
import { formatCount, stackLabel } from '../components/project-display';
import { ProjectBar } from '../components/ProjectBar';
import { QueryBox } from '../components/QueryBox';
import { SuggestedQuestions } from '../components/SuggestedQuestions';
import { SAMPLE_PROJECTS } from '../data/sample-projects';
import { suggestedQuestionsOf } from '../data/suggested-questions';

/** Props of {@link AskPage}. */
export interface AskPageProps {
  /** The project id of the path. */
  projectId: string;
}

/** What the project bar and the field show for a project. */
interface ProjectHeading {
  /** The level-1 heading. */
  title: string;
  /** The label and edge count, only for a sample project. */
  detail?: string;
  /** The field's placeholder. */
  placeholder: string;
}

/** The sample project's name and figures, or only the id for any other project (design D3, D24). */
function projectHeading(projectId: string): ProjectHeading {
  const project = SAMPLE_PROJECTS.find((candidate) => candidate.id === projectId);
  if (project === undefined) {
    return { title: projectId, placeholder: 'Pregunta sobre el código del proyecto' };
  }
  return {
    title: project.name,
    detail: `${stackLabel(project.language, project.framework)} · ${formatCount(project.edgeCount, 'arista', 'aristas')}`,
    placeholder: `Pregunta sobre el código de ${project.name}`,
  };
}

/**
 * Screen 2 of the web client, on `/p/{projectId}` (ask-page; DIS-65 design D3, D22, D27): the project bar
 * as banner, then the question box, the suggested questions and the result area. It sends no request
 * until a question is sent.
 *
 * @param props - The project id of the path.
 * @returns The project query page.
 */
export function AskPage({ projectId }: AskPageProps): ReactElement {
  const { title, detail, placeholder } = projectHeading(projectId);
  const suggestions = suggestedQuestionsOf(projectId);
  const [question, setQuestion] = useState('');
  return (
    <PageFrame banner={<ProjectBar title={title} detail={detail} />}>
      <div className="text-left">
        <QueryBox
          value={question}
          onChange={setQuestion}
          onSubmit={() => undefined}
          invalid={false}
          placeholder={placeholder}
        />
        {suggestions.length === 0 ? null : <SuggestedQuestions questions={suggestions} onPick={() => undefined} />}
      </div>
    </PageFrame>
  );
}
