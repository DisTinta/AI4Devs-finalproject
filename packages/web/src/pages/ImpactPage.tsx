import { useState, type ReactElement } from 'react';
import { AskErrorNotice } from '../components/AskErrorNotice';
import { ChangeBox } from '../components/ChangeBox';
import { ImpactReport } from '../components/ImpactReport';
import { ImpactUnknownState } from '../components/ImpactUnknownState';
import { validChange } from '../components/impact-display';
import { PageFrame } from '../components/PageFrame';
import { projectHeadingOf } from '../components/project-display';
import { ProjectBar } from '../components/ProjectBar';
import { ProjectNav } from '../components/ProjectNav';
import { useImpact, type ImpactState } from './useImpact';

/** Props of {@link ImpactPage}. */
export interface ImpactPageProps {
  /** The project id of the path. */
  projectId: string;
}

/** The text of the pending state, shown in the result area and announced by the status region. */
const CALCULATING = 'Calculando impacto…';

/**
 * What the status region of Screen 3 holds in a state (impact-page, "Screen reader announcements of Screen
 * 3"; DIS-14 design D17): empty before the first send and after a failure (the alert announces itself), the
 * pending text, or one sentence per outcome.
 *
 * @param state - The state of the last change sent.
 * @returns The text of the status region.
 */
function announcementOf(state: ImpactState): string {
  switch (state.status) {
    case 'pending':
      return CALCULATING;
    case 'answered':
      return 'Informe de impacto recibido.';
    case 'unknown':
      return 'Sin ancla en el grafo.';
    case 'idle':
    case 'failed':
      return '';
  }
}

/**
 * The result area: nothing before the first send, then the pending text, the answered report, the unknown
 * state or an error alert (DIS-14 design D10, D11). The pending text takes the place of whatever was shown
 * before; it is hidden from assistive technology because the status region announces it.
 */
function ResultArea({ state }: { state: ImpactState }): ReactElement | null {
  switch (state.status) {
    case 'pending':
      return (
        <p aria-hidden="true" className="mt-6 text-sm text-ink-muted">
          {CALCULATING}
        </p>
      );
    case 'answered':
      return <ImpactReport report={state.report} />;
    case 'unknown':
      return <ImpactUnknownState reason={state.reason} />;
    case 'failed':
      return <AskErrorNotice failure={state.failure} />;
    case 'idle':
      return null;
  }
}

/**
 * Screen 3 of the web client, on `/p/{projectId}/impact` (impact-page; DIS-14 design D2, D3, D12, D17): the
 * project bar as banner, the change box, the result area, the visually hidden status region that announces
 * each outcome, and after the main landmark the link back to Screen 2. It sends no request until a valid
 * change is sent; it composes the components and the page hook and implements nothing else.
 *
 * @param props - The project id of the path.
 * @returns The impact page.
 */
export function ImpactPage({ projectId }: ImpactPageProps): ReactElement {
  const { title, detail } = projectHeadingOf(projectId);
  const { state, send } = useImpact(projectId);
  const [change, setChange] = useState('');
  const [hops, setHops] = useState(2);
  const [invalid, setInvalid] = useState(false);
  const [invalidSends, setInvalidSends] = useState(0);
  const pending = state.status === 'pending';

  const onChange = (text: string): void => {
    setChange(text);
    setInvalid(false);
  };

  // While a report is pending, a send changes nothing on the screen (design D12).
  const onSubmit = (): void => {
    if (pending) {
      return;
    }
    const checked = validChange(change);
    setInvalid(checked === undefined);
    if (checked === undefined) {
      setInvalidSends((count) => count + 1);
    } else {
      send({ change: checked, maxHops: hops });
    }
  };

  return (
    <PageFrame
      banner={<ProjectBar title={title} detail={detail} />}
      nav={<ProjectNav to={`/p/${encodeURIComponent(projectId)}`} label="Volver a las preguntas" />}
    >
      <div className="text-left wrap-break-word">
        <ChangeBox
          value={change}
          hops={hops}
          onChange={onChange}
          onHopsChange={setHops}
          onSubmit={onSubmit}
          invalid={invalid}
          invalidSends={invalidSends}
        />
        <ResultArea state={state} />
        <p role="status" className="sr-only">
          {announcementOf(state)}
        </p>
      </div>
    </PageFrame>
  );
}
