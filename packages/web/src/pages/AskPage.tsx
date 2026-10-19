import { useState, type ReactElement } from 'react';
import { AnswerView } from '../components/AnswerView';
import { validQuestion } from '../components/answer-display';
import { PageFrame } from '../components/PageFrame';
import { formatCount, stackLabel } from '../components/project-display';
import { ProjectBar } from '../components/ProjectBar';
import { QueryBox } from '../components/QueryBox';
import { SuggestedQuestions } from '../components/SuggestedQuestions';
import { SAMPLE_PROJECTS } from '../data/sample-projects';
import { suggestedQuestionsOf } from '../data/suggested-questions';
import { useAsk, type AskState } from './useAsk';

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
 * The result area: nothing before the first question, then the pending status, the answer or a notice
 * (design D7, D10). The pending status takes the place of whatever was shown before.
 */
function ResultArea({ state }: { state: AskState }): ReactElement | null {
  if (state.status === 'pending') {
    return (
      <p role="status" className="mt-6 text-sm text-ink-muted">
        Buscando evidencia…
      </p>
    );
  }
  if (state.status === 'answered') {
    return <AnswerView answer={state.answer} />;
  }
  return null;
}

/**
 * Screen 2 of the web client, on `/p/{projectId}` (ask-page; DIS-65 design D3, D22, D27): the project bar
 * as banner, then the question box, the suggested questions and the result area. It sends no request
 * until a question is sent; it composes the components and the page hook and implements nothing else.
 *
 * @param props - The project id of the path.
 * @returns The project query page.
 */
export function AskPage({ projectId }: AskPageProps): ReactElement {
  const { title, detail, placeholder } = projectHeading(projectId);
  const suggestions = suggestedQuestionsOf(projectId);
  const { state, send } = useAsk(projectId);
  const [question, setQuestion] = useState('');
  const [invalid, setInvalid] = useState(false);
  const pending = state.status === 'pending';

  const onChange = (text: string): void => {
    setQuestion(text);
    setInvalid(false);
  };

  // While a question is pending, a send changes nothing on the screen (design D7).
  const onSubmit = (): void => {
    if (pending) {
      return;
    }
    const checked = validQuestion(question);
    setInvalid(checked === undefined);
    if (checked !== undefined) {
      send(checked);
    }
  };

  const onPick = (suggestion: string): void => {
    if (pending) {
      return;
    }
    setQuestion(suggestion);
    setInvalid(false);
    send(suggestion);
  };

  return (
    <PageFrame banner={<ProjectBar title={title} detail={detail} />}>
      <div className="text-left">
        <QueryBox value={question} onChange={onChange} onSubmit={onSubmit} invalid={invalid} placeholder={placeholder} />
        {suggestions.length === 0 ? null : <SuggestedQuestions questions={suggestions} onPick={onPick} />}
        <ResultArea state={state} />
      </div>
    </PageFrame>
  );
}
