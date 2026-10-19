/**
 * How Screen 2 writes the figures of its usage panel (ask-page, "How usage figures and notice details are
 * written"; DIS-66 design D2, D3, D4, D20, D25, D28): pure functions, no React. A point is the decimal
 * separator and no `Intl` is used, so the output is the same in every browser locale.
 *
 * @module
 */

import { formatCount, groupDigits } from './project-display';

/**
 * Writes a confidence with exactly two decimals («0.71», «1.00»): it is ordinal (`docs/CONFIDENCE.md`).
 *
 * @param confidence - The confidence of the answer, from 0 to 1.
 * @returns The written confidence.
 */
export function formatConfidence(confidence: number): string {
  return confidence.toFixed(2);
}

/**
 * Writes the tokens of an answer, input plus output, as a count of «token» / «tokens» with its digits
 * grouped («4 812 tokens»): what was consumed and paid (design D2).
 *
 * @param inputTokens - The input tokens of the whole answer.
 * @param outputTokens - The output tokens of the whole answer.
 * @returns The written count.
 */
export function formatTokens(inputTokens: number, outputTokens: number): string {
  return formatCount(inputTokens + outputTokens, 'token', 'tokens');
}

/**
 * Writes the baseline line: the raw-context tokens as a count against the input tokens as a bare number
 * («41 200 tokens sin selección de contexto → 4 000 con CODEMIND»). It compares only the input, as the
 * API's savings do (design D2).
 *
 * @param baselineTokens - The tokens of the naive baseline.
 * @param inputTokens - The input tokens of the whole answer.
 * @returns The written line.
 */
export function baselineLine(baselineTokens: number, inputTokens: number): string {
  return `${formatCount(baselineTokens, 'token', 'tokens')} sin selección de contexto → ${groupDigits(inputTokens)} con CODEMIND`;
}

/** The three-decimal form of a positive cost too small to show, written «< $0.001» instead. */
const ROUNDED_ZERO_COST = '0.000';

/**
 * Writes a cost in US dollars (design D3): «$0» when it is 0, «< $0.001» when it is positive but rounds
 * to 0.000, otherwise «$» and the amount with exactly three decimals («$0.014»).
 *
 * @param costUsd - The cost of the answer in US dollars.
 * @returns The written cost.
 */
export function formatCost(costUsd: number): string {
  if (costUsd === 0) {
    return '$0';
  }
  const amount = costUsd.toFixed(3);
  return costUsd > 0 && amount === ROUNDED_ZERO_COST ? '< $0.001' : `$${amount}`;
}

/** Milliseconds in one second: from this latency up, it is written in seconds. */
const MS_PER_SECOND = 1_000;

/**
 * Writes a latency (design D3, D25): «<n> ms» under 1 000 ms, otherwise the seconds with exactly one
 * decimal and « s» («2.1 s»). A cache hit takes milliseconds, and «0.0 s» would hide it.
 *
 * @param latencyMs - The latency of the answer in milliseconds.
 * @returns The written latency.
 */
export function formatLatency(latencyMs: number): string {
  return latencyMs < MS_PER_SECOND ? `${latencyMs} ms` : `${(latencyMs / MS_PER_SECOND).toFixed(1)} s`;
}

/** The savings badge of the usage panel: its whole text and whether it is a saving. */
export interface SavingsBadge {
  /** «ahorro <savings> % vs bruto», or «sin ahorro vs bruto». */
  text: string;
  /** `true` for a saving (the success colours), `false` otherwise (the muted colours). */
  saving: boolean;
}

/**
 * Writes the savings badge (design D4, D25, D28): the savings rounded to one decimal with no trailing
 * «.0» («ahorro 88 % vs bruto»), or «sin ahorro vs bruto» when the rounded savings are 0 or less, so a
 * negative saving is never shown as a saving. The decision uses the rounded value, so no badge reads
 * «ahorro 0 %».
 *
 * @param savingsPct - The percentage saved against the baseline, as the API sent it.
 * @returns The badge's text and whether it is a saving.
 */
export function savingsBadge(savingsPct: number): SavingsBadge {
  const rounded = Math.round(savingsPct * 10) / 10;
  return rounded > 0 ? { text: `ahorro ${String(rounded)} % vs bruto`, saving: true } : { text: 'sin ahorro vs bruto', saving: false };
}
