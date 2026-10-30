import type { ImpactReport, ImpactRisk } from './impact-report.js';

// The risk rule of `impact` (DIS-90 design D1, D4): pure and deterministic. `impact.ts` counts the
// two facts that need the graph; everything else is in the report.

/** The part of an answered report the rule reads: the report before its `risk` and `events` exist. */
export type ReportBody = Omit<Extract<ImpactReport, { status: 'answered' }>, 'risk' | 'events'>;

/** What the graph says about the `direct` entries of a report. */
export interface RiskFacts {
  /** `U`: the `direct` components that no `tested_by` edge covers. */
  uncovered: number;
  /** `H`: the `direct` components with a heuristic-only chain. */
  heuristicOnly: number;
}

/**
 * `count` followed by its word: the singular when the count is 1, the plural otherwise (0 included).
 *
 * @param count The number to print.
 * @param singular The word for 1.
 * @param plural The word for any other count.
 */
export function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Rates the change (PH-15 as written, design D1): `HIGH` when some `direct` component is uncovered or
 * has a heuristic-only chain, `LOW` when every one is covered and `exact`, `MEDIUM` otherwise. The
 * rationale names the four counts that decided it and never the text of the change.
 *
 * @param report The report before its risk.
 * @param facts The `U` and `H` counts, over the report's `direct`.
 * @returns The level and its rationale.
 */
export function assessRisk(report: ReportBody, facts: RiskFacts): ImpactRisk {
  const files = new Set([...report.direct, ...report.indirect].map((entry) => entry.file)).size;
  const rationale = [
    plural(files, 'fichero afectado', 'ficheros afectados'),
    plural(report.tests.length, 'test que cubre el cambio', 'tests que cubren el cambio'),
    plural(facts.uncovered, 'elemento directo sin test', 'elementos directos sin test'),
    plural(facts.heuristicOnly, 'elemento directo con cadena solo heurística', 'elementos directos con cadena solo heurística'),
  ].join(', ');
  const allExact = report.direct.every((entry) => entry.resolution === 'exact');
  const level = facts.uncovered > 0 || facts.heuristicOnly > 0 ? 'HIGH' : allExact ? 'LOW' : 'MEDIUM';
  return { level, rationale: `${rationale}.` };
}
