import type { SourceFile } from '../ports/AnalyzerPort.js';
import type { AuditEvent, SecretRule } from './audit-event.js';

/** Text that replaces every redacted span. */
export const REDACTION_MARKER = '[REDACTED: possible secret]';

/** A file after redaction, with one audit event per replaced span. */
export interface RedactionResult {
  /** Same `path`; content with every secret span replaced by {@link REDACTION_MARKER}. */
  file: SourceFile;
  /** `true` if and only if at least one span was replaced. */
  redacted: boolean;
  /** One event per replaced span, ordered by `line`, `column`, then `rule`. */
  events: AuditEvent[];
}

interface Line {
  /** The line without its terminator. */
  text: string;
  /** `'\r'` when the line ended with `\r\n`, else `''`. */
  cr: string;
}

/** A claimed span, 0-based; `endCol` is exclusive and refers to `endLine`. */
interface Claim {
  rule: SecretRule;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

/** Minimum Shannon entropy, in bits per character, of a `generic-high-entropy` value. */
export const MIN_SECRET_ENTROPY = 3.5;

/** Minimum length of a `generic-high-entropy` value. */
export const MIN_SECRET_LENGTH = 20;

const PRIVATE_KEY_HEADER = /-----BEGIN ([A-Z ]*)PRIVATE KEY-----/g;
const JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_-])/g;
const AWS_ACCESS_KEY_ID = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const PEM_BASE64 = /^[A-Za-z0-9+/=]+$/;
const PEM_NAME_VALUE = /^[A-Za-z][A-Za-z0-9-]*:\s*\S/;

// `generic-high-entropy` is defined by the spec regex
// (?<![A-Za-z0-9_-])([A-Za-z0-9_-]*(?:secret|password|passwd|token|api[_-]?key)[A-Za-z0-9_-]*)(['"]?)\s*(?:=>|=|:)\s*(['"])([^\s'"]{20,})\3
// with flag `i`. Its group 1 is always a whole maximal run of [A-Za-z0-9_-] (nothing of that class may
// precede or follow it), so it is matched as: maximal run, keyword test, sticky tail. That is linear,
// where the literal regex backtracks quadratically on a long run of repeated keywords (design D3).
const IDENTIFIER_RUN = /[A-Za-z0-9_-]+/g;
const SECRET_KEYWORD = /secret|password|passwd|token|api[_-]?key/i;
const ASSIGNED_VALUE = new RegExp(`(['"]?)\\s*(?:=>|=|:)\\s*(['"])([^\\s'"]{${MIN_SECRET_LENGTH},})\\2`, 'y');

/**
 * Replaces the secret spans of `file.content` by {@link REDACTION_MARKER}, keeping the rest of each
 * line and the number of lines. Pure: uses only the content it receives.
 *
 * @param file The file to scan.
 * @returns The redacted file, whether anything was replaced, and the audit events.
 */
export function redactSecrets(file: SourceFile): RedactionResult {
  const lines: Line[] = file.content.split('\n').map((raw) =>
    raw.endsWith('\r') ? { text: raw.slice(0, -1), cr: '\r' } : { text: raw, cr: '' },
  );
  const claims = new Claims();
  claimPrivateKeys(lines, claims);
  claimLineMatches(lines, claims, 'jwt', JWT);
  claimLineMatches(lines, claims, 'aws-access-key-id', AWS_ACCESS_KEY_ID);
  claimHighEntropyValues(lines, claims);

  const ordered = [...claims.all].sort(compareClaims);
  claims.render(lines);

  const events: AuditEvent[] = ordered.map((claim) => ({
    type: 'secret_redacted',
    file: file.path,
    line: claim.startLine + 1,
    column: claim.startCol + 1,
    rule: claim.rule,
  }));
  return {
    file: { path: file.path, content: lines.map((line) => line.text + line.cr).join('\n') },
    redacted: events.length > 0,
    events,
  };
}

/**
 * `private-key` blocks, checked in the order c (closing on the header line), a (closing directly after
 * the PEM body run), b (anything else: the block ends with the body run, or with the header).
 */
function claimPrivateKeys(lines: Line[], claims: Claims): void {
  let lineIndex = 0;
  let from = 0;
  // Per header line, both cached so many headers on one line stay linear (design D3): the closings
  // already searched for in vain, and the body run (with the indent of the line after it).
  let cachedLine = -1;
  let missingClosings = new Set<string>();
  let run: { afterRun: number; indent: number } | undefined;
  while (lineIndex < lines.length) {
    if (cachedLine !== lineIndex) {
      cachedLine = lineIndex;
      missingClosings = new Set();
      run = undefined;
    }
    const text = lines[lineIndex]!.text;
    PRIVATE_KEY_HEADER.lastIndex = from;
    const header = PRIVATE_KEY_HEADER.exec(text);
    if (!header) {
      lineIndex++;
      from = 0;
      continue;
    }
    const startCol = header.index;
    const headerEnd = startCol + header[0].length;
    const closing = `-----END ${header[1]}PRIVATE KEY-----`;
    const block = { rule: 'private-key' as const, startLine: lineIndex, startCol };

    // Not found from an earlier header's end means not found from this later one either.
    const sameLine = missingClosings.has(closing) ? -1 : text.indexOf(closing, headerEnd);
    if (sameLine !== -1) {
      claims.add({ ...block, endLine: lineIndex, endCol: sameLine + closing.length });
      from = sameLine + closing.length;
      continue;
    }
    missingClosings.add(closing);

    run ??= bodyRunAndIndent(lines, lineIndex + 1);
    const { afterRun, indent } = run;
    const next = lines[afterRun];
    if (next && next.text.startsWith(closing, indent)) {
      claims.add({ ...block, endLine: afterRun, endCol: indent + closing.length });
      lineIndex = afterRun;
      from = indent + closing.length;
    } else if (afterRun > lineIndex + 1) {
      const lastBody = afterRun - 1;
      claims.add({ ...block, endLine: lastBody, endCol: lines[lastBody]!.text.length });
      lineIndex = afterRun;
      from = 0;
    } else {
      claims.add({ ...block, endLine: lineIndex, endCol: headerEnd });
      from = headerEnd;
    }
  }
}

/** The body run from `start`, and the leading-whitespace length of the line right after it (0 if none). */
function bodyRunAndIndent(lines: Line[], start: number): { afterRun: number; indent: number } {
  const afterRun = bodyRunEnd(lines, start);
  const next = lines[afterRun];
  return { afterRun, indent: next ? next.text.length - next.text.trimStart().length : 0 };
}

/** Index of the first line at or after `start` that is not PEM body (or `lines.length`). */
function bodyRunEnd(lines: Line[], start: number): number {
  let index = start;
  let afterNameValue = false;
  while (index < lines.length) {
    const trimmed = lines[index]!.text.trim();
    if (PEM_BASE64.test(trimmed)) afterNameValue = false;
    else if (PEM_NAME_VALUE.test(trimmed)) afterNameValue = true;
    else if (trimmed === '' && afterNameValue) afterNameValue = false;
    else break;
    index++;
  }
  return index;
}

function claimHighEntropyValues(lines: Line[], claims: Claims): void {
  lines.forEach((line, index) => {
    for (const run of line.text.matchAll(IDENTIFIER_RUN)) {
      if (!SECRET_KEYWORD.test(run[0])) continue;
      ASSIGNED_VALUE.lastIndex = run.index + run[0].length;
      const tail = ASSIGNED_VALUE.exec(line.text);
      if (!tail) continue;
      const value = tail[3]!;
      if (shannonEntropy(value) < MIN_SECRET_ENTROPY) continue;
      // The overlap test uses the whole match; only the quoted value is replaced.
      const matchEnd = tail.index + tail[0].length;
      const whole: Claim = { rule: 'generic-high-entropy', startLine: index, startCol: run.index, endLine: index, endCol: matchEnd };
      if (claims.overlaps(index, run.index, matchEnd)) continue;
      const valueEnd = matchEnd - 1;
      claims.add({ ...whole, startCol: valueEnd - value.length, endCol: valueEnd });
    }
  });
}

/** Shannon entropy in bits per UTF-16 code unit. */
function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (let i = 0; i < value.length; i++) counts.set(value[i]!, (counts.get(value[i]!) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function claimLineMatches(lines: Line[], claims: Claims, rule: SecretRule, pattern: RegExp): void {
  lines.forEach((line, index) => {
    for (const match of line.text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!claims.overlaps(index, start, end)) claims.add({ rule, startLine: index, startCol: start, endLine: index, endCol: end });
    }
  });
}

/** A half-open column interval `[from, to)` of one line covered by a claim. */
interface Covered {
  from: number;
  to: number;
  /** Whether the claim starts on this line: the marker is written here. */
  marker: boolean;
}

/**
 * The claimed spans, and for each line the intervals they cover, sorted by `from`. A multi-line claim
 * covers every line from its start to its end. Claims never overlap, so an overlap test only has to
 * look at the last interval starting before the candidate's end: a binary search, which keeps
 * redaction linear in the number of matches (design D3).
 */
class Claims {
  /** Every claim, in the order it was added. */
  readonly all: Claim[] = [];
  private readonly byLine = new Map<number, Covered[]>();

  add(claim: Claim): void {
    this.all.push(claim);
    for (let line = claim.startLine; line <= claim.endLine; line++) {
      const from = line === claim.startLine ? claim.startCol : 0;
      const to = line === claim.endLine ? claim.endCol : Number.POSITIVE_INFINITY;
      let covered = this.byLine.get(line);
      if (!covered) this.byLine.set(line, (covered = []));
      covered.splice(firstStartingAtOrAfter(covered, from), 0, { from, to, marker: line === claim.startLine });
    }
  }

  /** Whether `[start, end)` of `line` shares at least one character with a claim. */
  overlaps(line: number, start: number, end: number): boolean {
    const covered = this.byLine.get(line);
    if (!covered) return false;
    const last = covered[firstStartingAtOrAfter(covered, end) - 1];
    return last !== undefined && last.to > start;
  }

  /**
   * Rewrites every covered line once: the text between intervals is kept, each interval becomes the
   * marker on its claim's start line and nothing elsewhere. Building a line once (not once per claim)
   * keeps many claims on one line linear (design D3).
   */
  render(lines: Line[]): void {
    for (const [index, covered] of this.byLine) {
      const line = lines[index]!;
      const parts: string[] = [];
      let column = 0;
      for (const { from, to, marker } of covered) {
        parts.push(line.text.slice(column, from));
        if (marker) parts.push(REDACTION_MARKER);
        column = to;
      }
      if (column !== Number.POSITIVE_INFINITY) parts.push(line.text.slice(column));
      line.text = parts.join('');
    }
  }
}

/** Index of the first interval whose `from` is at least `column` (`covered.length` if none). */
function firstStartingAtOrAfter(covered: Covered[], column: number): number {
  let low = 0;
  let high = covered.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (covered[mid]!.from < column) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** By `line`, then `column`. Claims never overlap, so two never start at the same place and the spec's `rule` tie-break never applies. */
function compareClaims(a: Claim, b: Claim): number {
  return a.startLine - b.startLine || a.startCol - b.startCol;
}
