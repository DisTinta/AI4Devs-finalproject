import { anchor, questionTerms } from '../context/anchor.js';
import type { StorePort } from '../ports/StorePort.js';
import { DEFAULT_IMPACT_HOPS, parseImpactRequest } from './impact-request.js';
import type { ImpactReport } from './impact-report.js';
import { buildReport, groupComponents } from './relevance.js';
import { findTests, reverseWalk } from './reverse-walk.js';

// The impact use case (DIS-89): from a change described in words to the components that depend on it
// and the tests that cover it, from the deterministic graph only. Core returns a report; it never
// logs the change.

/**
 * Tells which components of one indexed project depend on a change, directly and transitively, and
 * which tests cover it. The request is checked first. The change is anchored as the Context Engine
 * anchors a question, unchanged, and the symbols of `test` files are dropped; when nothing is left the
 * answer is `unknown`/`no-anchor` and the graph is not traversed. Otherwise one reverse traversal
 * (`calls`, `imports`, `extends`, `implements`, target to source) runs from the anchor symbols and
 * their files, the reached nodes are grouped by component and the tests are found with one `tested_by`
 * step. Every list is ordered by a lexicographic relevance key.
 *
 * @param store The graph store.
 * @param request The project, the change and, optionally, the hop limit; checked before any call.
 * @returns The report, or `unknown` when the change anchors nothing.
 * @throws InvalidImpactRequest naming the field at fault, before any call.
 * @throws ProjectNotFound when the change has a search term and `projectId` names no project.
 */
export async function impact(store: StorePort, request: unknown): Promise<ImpactReport> {
  const { projectId, change, maxHops = DEFAULT_IMPACT_HOPS } = parseImpactRequest(request);
  const anchors = (await anchor(store, projectId, change)).filter((symbol) => symbol.fileKind !== 'test');
  if (anchors.length === 0) return { status: 'unknown', reason: 'no-anchor' };

  const reached = await reverseWalk(store, projectId, anchors, maxHops);
  const walked = groupComponents(anchors, reached);
  const direct = walked.filter((component) => !component.test && component.hops <= 1);
  const found = await findTests(store, projectId, { anchors, reached, direct });
  return buildReport(questionTerms(change), walked, found);
}
