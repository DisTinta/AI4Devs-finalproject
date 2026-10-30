import { anchor, questionTerms } from '../context/anchor.js';
import type { StorePort } from '../ports/StorePort.js';
import { DEFAULT_IMPACT_HOPS, parseImpactRequest } from './impact-request.js';
import type { ImpactReport } from './impact-report.js';
import { impactQueryLogEntry, saveImpactRow } from './query-log.js';
import { buildReport, componentKey, groupComponents } from './relevance.js';
import { directCoverage, findTests, reverseWalk } from './reverse-walk.js';
import { assessRisk } from './risk.js';

// The impact use case (DIS-89, DIS-90): from a change described in words to the components that depend
// on it, the tests that cover it and its risk, from the deterministic graph only. Every returned report
// writes one `query_log` row; the change is stored there and nowhere else, never in an error or event.

/** The seams of {@link impact}. */
export interface ImpactOptions {
  /** The clock; the system clock when absent. Read exactly twice per call that returns a report. */
  now?: () => Date;
}

/**
 * Tells which components of one indexed project depend on a change, directly and transitively, which
 * tests cover it and how risky it is. The request is checked first. The change is anchored as the
 * Context Engine anchors a question, unchanged, and the symbols of `test` files are dropped; when
 * nothing is left the answer is `unknown`/`no-anchor` and the graph is not traversed. Otherwise one
 * reverse traversal (`calls`, `imports`, `extends`, `implements`, target to source) runs from the
 * anchor symbols and their files, the reached nodes are grouped by component, the tests are found with
 * one `tested_by` step and the coverage of the direct components is read with one more. Every list is
 * ordered by a lexicographic relevance key. Once the report is built, its `query_log` row is written;
 * when the store cannot write it, the report is still returned, with a `query_not_logged` event.
 *
 * @param store The graph store.
 * @param request The project, the change and, optionally, the hop limit; checked before any call.
 * @param options The clock.
 * @returns The report, or `unknown` when the change anchors nothing.
 * @throws InvalidImpactRequest naming the field at fault, before any call; no row is written.
 * @throws ProjectNotFound when the change has a search term and `projectId` names no project; no row is written.
 * @throws Any failure of a store read after anchoring, unchanged and without a row; or of the row's write
 *   that is not one the event covers.
 */
export async function impact(store: StorePort, request: unknown, options: ImpactOptions = {}): Promise<ImpactReport> {
  const now = options.now ?? (() => new Date());
  const { projectId, change, maxHops = DEFAULT_IMPACT_HOPS } = parseImpactRequest(request);
  const startedAt = now();
  const report = await answer(store, projectId, change, maxHops);
  const code = await saveImpactRow(store, impactQueryLogEntry(projectId, change, startedAt, now()));
  return code === undefined ? report : { ...report, events: [{ type: 'query_not_logged', code }] };
}

/** The report of a checked request, before its row. */
async function answer(store: StorePort, projectId: string, change: string, maxHops: number): Promise<ImpactReport> {
  const anchors = (await anchor(store, projectId, change)).filter((symbol) => symbol.fileKind !== 'test');
  if (anchors.length === 0) return { status: 'unknown', reason: 'no-anchor' };

  const reached = await reverseWalk(store, projectId, anchors, maxHops);
  const walked = groupComponents(anchors, reached);
  const direct = walked.filter((component) => !component.test && component.hops <= 1);
  const found = await findTests(store, projectId, { anchors, reached, direct });
  const body = buildReport(questionTerms(change), walked, found.tests);
  const covered = await directCoverage(store, projectId, found);
  // U and H are counted over the entries of the report's `direct`, matched to their component (design D2).
  const byEntry = new Map(walked.map((component) => [`${component.file}\0${component.name}`, component]));
  let uncovered = 0;
  let heuristicOnly = 0;
  for (const entry of body.direct) {
    const component = byEntry.get(`${entry.file}\0${entry.symbol}`);
    if (component === undefined) continue;
    if (!covered.has(componentKey(component))) uncovered += 1;
    if (!component.exactChain) heuristicOnly += 1;
  }
  return { ...body, risk: assessRisk(body, { uncovered, heuristicOnly }) };
}
