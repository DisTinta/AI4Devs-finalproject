import { useState, type ReactElement } from 'react';
import { AnswerView } from '../components/AnswerView';
import { AskErrorNotice } from '../components/AskErrorNotice';
import { validQuestion } from '../components/answer-display';
import { LlmRequiredNotice } from '../components/LlmRequiredNotice';
import { PageFrame } from '../components/PageFrame';
import { projectHeadingOf } from '../components/project-display';
import { ProjectBar } from '../components/ProjectBar';
import { ProjectNav } from '../components/ProjectNav';
import { QueryBox } from '../components/QueryBox';
import { SuggestedQuestions } from '../components/SuggestedQuestions';
import { UnknownState } from '../components/UnknownState';
import { UsagePanel } from '../components/UsagePanel';
import { suggestedQuestionsOf } from '../data/suggested-questions';
import { useAsk, type AskState } from './useAsk';

/** Props of {@link AskPage}. */
export interface AskPageProps {
  /** The project id of the path. */
  projectId: string;
}

/**
 * The field's placeholder: the sample project's name when it has one, a generic text for any other
 * project (DIS-65 design D3, D24; DIS-14 design D14).
 */
function placeholderOf(title: string, detail: string | undefined): string {
  return detail === undefined ? 'Pregunta sobre el código del proyecto' : `Pregunta sobre el código de ${title}`;
}

/** The text of the pending state, shown in the result area and announced by the status region. */
const SEARCHING = 'Buscando evidencia…';

/**
 * What the status region of Screen 2 holds in a state (ask-page, "Screen reader announcements of Screen
 * 2"; DIS-66 design D11, D22, D32): empty before the first question and after a failure (the alert
 * announces itself), the pending text, or one sentence per outcome.
 *
 * @param state - The state of the last question sent.
 * @returns The text of the status region.
 */
function announcementOf(state: AskState): string {
  switch (state.status) {
    case 'pending':
      return SEARCHING;
    case 'answered':
      return 'Respuesta recibida.';
    case 'unknown':
      return state.reason === 'llm-required' ? 'Hace falta un modelo de lenguaje.' : 'Sin respuesta verificada.';
    case 'idle':
    case 'failed':
      return '';
  }
}

/**
 * The result area: nothing before the first question, then the pending text, the answer and its usage
 * panel, an `UNKNOWN` state or the configuration notice, or an error notice (DIS-65 design D7, D10; DIS-66
 * design D7, D8, D21). The pending text takes the place of whatever was shown before; it is hidden from
 * assistive technology because the status region announces it (DIS-66 design D22).
 */
function ResultArea({ state, hasSuggestions }: { state: AskState; hasSuggestions: boolean }): ReactElement | null {
  if (state.status === 'pending') {
    return (
      <p aria-hidden="true" className="mt-6 text-sm text-ink-muted">
        {SEARCHING}
      </p>
    );
  }
  if (state.status === 'answered') {
    return (
      <>
        <AnswerView answer={state.answer} />
        <UsagePanel confidence={state.answer.confidence} usage={state.answer.usage} />
      </>
    );
  }
  if (state.status === 'unknown') {
    return state.reason === 'llm-required' ? (
      <LlmRequiredNotice message={state.message} hasSuggestions={hasSuggestions} />
    ) : (
      <UnknownState reason={state.reason} />
    );
  }
  if (state.status === 'failed') {
    return <AskErrorNotice failure={state.failure} />;
  }
  return null;
}

/**
 * Screen 2 of the web client, on `/p/{projectId}` (ask-page; DIS-65 design D3, D22, D27): the project bar
 * as banner, then the question box, the suggested questions, the result area and the visually hidden
 * status region that announces each outcome (DIS-66 design D11, D22). It sends no request until a question
 * is sent; it composes the components and the page hook and implements nothing else.
 *
 * @param props - The project id of the path.
 * @returns The project query page.
 */
export function AskPage({ projectId }: AskPageProps): ReactElement {
  const { title, detail } = projectHeadingOf(projectId);
  const placeholder = placeholderOf(title, detail);
  const suggestions = suggestedQuestionsOf(projectId);
  const { state, send } = useAsk(projectId);
  const [question, setQuestion] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [invalidSends, setInvalidSends] = useState(0);
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
    if (checked === undefined) {
      setInvalidSends((count) => count + 1);
    } else {
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
    <PageFrame
      banner={<ProjectBar title={title} detail={detail} />}
      nav={<ProjectNav to={`/p/${encodeURIComponent(projectId)}/impact`} label="Analizar el impacto de un cambio" />}
    >
      <div className="text-left wrap-break-word">
        <QueryBox
          value={question}
          onChange={onChange}
          onSubmit={onSubmit}
          invalid={invalid}
          invalidSends={invalidSends}
          placeholder={placeholder}
        />
        {suggestions.length === 0 ? null : <SuggestedQuestions questions={suggestions} onPick={onPick} />}
        <ResultArea state={state} hasSuggestions={suggestions.length > 0} />
        <p role="status" className="sr-only">
          {announcementOf(state)}
        </p>
      </div>
    </PageFrame>
  );
}
