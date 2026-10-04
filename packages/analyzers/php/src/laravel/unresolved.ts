import type { AnalysisResult, AnalyzerInput, AnalyzerPort, SymbolRef } from '@codemind/core';

/**
 * Why a recognised Laravel site has no edge (spec "PHP unresolved report"; design D4 of
 * php-laravel-heuristics-2b): a facade call rule 1 cannot resolve, an `event(new E)` with no listener
 * `handle`, a job dispatch whose class declares no `handle`, a `route` symbol without a `calls` edge.
 */
export type UnresolvedReason = 'facade-unresolved' | 'event-no-listener' | 'job-no-handle' | 'route-action-missing';

/** One Laravel site the PHP analyzer recognises but emits no edge for (spec "PHP unresolved report"). */
export interface UnresolvedSite {
  /** Repository-relative path of the file of the site. */
  path: string;
  /** 1-based line where the call starts; for a route, the first line of its statement. */
  line: number;
  /** The caller method symbol; for a route, the `route` symbol. */
  source: SymbolRef;
  reason: UnresolvedReason;
}

/**
 * The result of the PHP analyzer: the shared `AnalysisResult` plus its unresolved Laravel sites (author
 * decision D1 on DIS-63: the report lives in the PHP adapter only, never in `AnalyzerPort`).
 */
export type PhpAnalysisResult = AnalysisResult & { unresolved: UnresolvedSite[] };

/** The PHP `AnalyzerPort`, whose `analyze` also reports the unresolved Laravel sites (design D5). */
export interface PhpAnalyzer extends AnalyzerPort {
  analyze(input: AnalyzerInput): Promise<PhpAnalysisResult>;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const siteKey = (site: UnresolvedSite): string =>
  JSON.stringify([site.path, site.line, site.source.file, site.source.name, site.source.startLine, site.reason]);

/**
 * `sites` ordered by `path`, then `line`, then the `name` of `source`, then `reason`, compared by UTF-16
 * code unit (never `localeCompare`), with each repeated site kept once (spec "PHP unresolved report").
 */
export function sortUniqueUnresolved(sites: readonly UnresolvedSite[]): UnresolvedSite[] {
  const seen = new Set<string>();
  const unique = sites.filter((site) => {
    const key = siteKey(site);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort(
    (a, b) =>
      compareText(a.path, b.path) ||
      a.line - b.line ||
      compareText(a.source.name, b.source.name) ||
      compareText(a.reason, b.reason) ||
      compareText(a.source.file, b.source.file) ||
      a.source.startLine - b.source.startLine,
  );
}
