import type { ReactElement, ReactNode } from 'react';
import type { ImpactAnswered, ImpactDoc, ImpactEntry, ImpactHistory, ImpactTest } from '../services/api-client';
import { coChangeLabel, hopsLabel, prsLabel, resolutionLabel, staleLabel } from './impact-display';
import { ImpactSection, type ImpactSectionEntry } from './ImpactSection';
import { RiskBanner } from './RiskBanner';

/** Props of {@link ImpactReport}. */
export interface ImpactReportProps {
  /** The answered report of the API. */
  report: ImpactAnswered;
}

/** A symbol, in the strong text colour. */
function symbolPart(symbol: string): ReactNode {
  return <span className="font-semibold text-ink">{symbol}</span>;
}

/** A file or path, in a code-styled span. */
function filePart(file: string): ReactNode {
  return <code className="font-mono text-ink-muted">{file}</code>;
}

/** The symbol of a component, left out when it equals its file (a file-level component). */
function namedParts(symbol: string, file: string): ReactNode[] {
  return symbol === file ? [filePart(file)] : [symbolPart(symbol), filePart(file)];
}

/** The entry of a component of `direct` or `indirect`: symbol, file, hops and resolution, from the graph. */
function componentEntry({ symbol, file, hops, resolution }: ImpactEntry): ImpactSectionEntry {
  return {
    key: `${symbol} ${file} ${hops} ${resolution}`,
    parts: [...namedParts(symbol, file), hopsLabel(hops), resolutionLabel(resolution)],
    origin: 'graph',
  };
}

/** The entry of a test: symbol and file, from the graph. */
function testEntry({ symbol, file }: ImpactTest): ImpactSectionEntry {
  return { key: `${symbol} ${file}`, parts: namedParts(symbol, file), origin: 'graph' };
}

/** The entry of a document: its path and «al día», or the warning pair and the commit it went stale at. */
function docEntry(doc: ImpactDoc): ImpactSectionEntry {
  const state: ReactNode = doc.stale ? (
    <span className="rounded-button bg-warning-soft px-1 text-warning-ink">
      <span aria-hidden="true">⚠</span> {staleLabel(doc.staleSince)}
    </span>
  ) : (
    'al día'
  );
  return { key: `${doc.path} ${doc.stale}`, parts: [filePart(doc.path), state] };
}

/** The entry of the history: the file, its co-change rate and its pull requests, from Git. */
function historyEntry({ file, coChangeRate, prs }: ImpactHistory): ImpactSectionEntry {
  return {
    key: `${file} ${coChangeRate} ${prs.join(',')}`,
    parts: [filePart(file), coChangeLabel(coChangeRate), prsLabel(prs)],
    origin: 'git',
  };
}

/**
 * An answered impact report (impact-page, "Answered report"; DIS-14 design D6, D7, D15): the five
 * sections «Directo», «Indirecto», «Tests», «Documentación» and «Historial» in the order the API sent
 * their entries, the risk block, the origin legend and the line that says the report made no model call.
 * Every text of the API is a React text child, never markup. It adds no tab stop and moves no focus.
 *
 * @param props - The answered report.
 * @returns The report.
 */
export function ImpactReport({ report }: ImpactReportProps): ReactElement {
  return (
    <div className="mt-6 flex flex-col gap-5 text-left wrap-break-word">
      <ImpactSection heading="Directo" entries={report.direct.map(componentEntry)} />
      <ImpactSection heading="Indirecto" entries={report.indirect.map(componentEntry)} />
      <ImpactSection heading="Tests" entries={report.tests.map(testEntry)} />
      <ImpactSection heading="Documentación" entries={report.docs.map(docEntry)} />
      <ImpactSection heading="Historial" entries={report.history.map(historyEntry)} />
      <RiskBanner level={report.risk.level} rationale={report.risk.rationale} />
      <p className="text-xs text-ink-muted">
        Origen: [grafo] análisis estático determinista · [git] señal histórica de co-cambio
      </p>
      <p className="text-xs text-ink-muted">Informe determinista: sin llamada al modelo de lenguaje.</p>
    </div>
  );
}
