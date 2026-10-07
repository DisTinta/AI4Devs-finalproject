import { INDEX_PHASES } from '@codemind/core';
import type { IndexPhase, IndexReport } from '@codemind/core';
import { toTerminalSafeJson } from './safe-json.js';

/**
 * Quotes `value` as a JSON string literal that is also safe on a terminal (see
 * {@link toTerminalSafeJson}).
 *
 * @param value An untrusted string, such as a path or an analyzer message from the analysed repository.
 * @returns The quoted literal, with no raw control character.
 */
export function escapeLiteral(value: string): string {
  return toTerminalSafeJson(value);
}

/**
 * One progress line for the phase that just started, numbered in the order phases run.
 *
 * @param phase The phase reported by the indexing.
 * @returns For example `[1/6] confine`.
 */
export function renderProgress(phase: IndexPhase): string {
  return `[${INDEX_PHASES.indexOf(phase) + 1}/${INDEX_PHASES.length}] ${phase}`;
}

/**
 * The report as text for stdout: what was indexed, then every skipped entry and analyzer
 * diagnostic, whose paths and messages are printed with {@link escapeLiteral}.
 *
 * @param report The report of a committed indexing.
 * @returns The text, ending with a newline.
 */
export function renderReport(report: IndexReport): string {
  const lines = [
    `Indexed project ${report.projectId}`,
    `  commit:      ${report.indexedCommit}`,
    `  framework:   ${report.framework} (${report.frameworkSource})`,
    `  files:       ${report.files} (${report.filesDeleted} deleted)`,
    `  symbols:     ${report.symbols}`,
    `  commits:     ${report.commits}`,
    `  edges:       ${report.edges.total} total / ${report.edges.exact} exact / ${report.edges.heuristic} heuristic`,
    `  redactions:  ${report.events.length} in files, ${report.commitEvents.length} in commit messages`,
    `  skipped:     ${report.skipped.length}`,
    ...report.skipped.map((entry) => `    ${escapeLiteral(entry.path)} (${entry.reason})`),
    `  diagnostics: ${report.diagnostics.length}`,
    ...report.diagnostics.map(
      (diagnostic) =>
        `    ${escapeLiteral(diagnostic.path)}${diagnostic.line === undefined ? '' : `:${diagnostic.line}`} ${escapeLiteral(diagnostic.message)}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}
