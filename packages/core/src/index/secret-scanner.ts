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
const PRIVATE_KEY_CLOSING = /-----END ([A-Z ]*)PRIVATE KEY-----/g;
/**
 * A closing ends with five dashes, and a header starts with five: the next header may begin on those
 * same dashes. The header search therefore resumes this many characters before a block's end.
 */
const SHARED_DASHES = 5;
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
  const claims = new Claims(lines.length);
  claimPrivateKeys(lines, claims);
  claimLineMatches(lines, claims, 'jwt', JWT);
  claimLineMatches(lines, claims, 'aws-access-key-id', AWS_ACCESS_KEY_ID);
  claimHighEntropyValues(lines, claims);

  const events = claims.apply(lines, file.path);
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
  // Per header line, built at most once so many headers on one line stay linear (design D3): the
  // index of the line's closings, and the body run (with the indent of the line after it).
  let cachedLine = -1;
  let closings: ClosingIndex | undefined;
  let run: { afterRun: number; indent: number } | undefined;
  while (lineIndex < lines.length) {
    if (cachedLine !== lineIndex) {
      cachedLine = lineIndex;
      closings = undefined;
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

    closings ??= new ClosingIndex(text);
    const sameLine = closings.find(header[1]!, headerEnd);
    if (sameLine !== -1) {
      claims.add({ ...block, endLine: lineIndex, endCol: sameLine + closing.length });
      from = sameLine + closing.length - SHARED_DASHES;
      continue;
    }

    run ??= bodyRunAndIndent(lines, lineIndex + 1);
    const { afterRun, indent } = run;
    const next = lines[afterRun];
    if (next && next.text.startsWith(closing, indent)) {
      claims.add({ ...block, endLine: afterRun, endCol: indent + closing.length });
      lineIndex = afterRun;
      from = indent + closing.length - SHARED_DASHES;
    } else if (afterRun > lineIndex + 1) {
      const lastBody = afterRun - 1;
      claims.add({ ...block, endLine: lastBody, endCol: lines[lastBody]!.text.length });
      lineIndex = afterRun;
      from = 0;
    } else {
      claims.add({ ...block, endLine: lineIndex, endCol: headerEnd });
      from = headerEnd - SHARED_DASHES;
    }
  }
}

/**
 * Where each label's closing appears on one line, found in a single scan. `find` is the same as
 * `text.indexOf(closing, from)` while `from` never decreases between calls for a label, as it does
 * for headers met left to right: a pointer per label only moves forward, so the total work is linear
 * in the line (design D3).
 */
class ClosingIndex {
  private readonly positions = new Map<string, number[]>();
  private readonly next = new Map<string, number>();

  constructor(text: string) {
    PRIVATE_KEY_CLOSING.lastIndex = 0;
    for (let match = PRIVATE_KEY_CLOSING.exec(text); match; match = PRIVATE_KEY_CLOSING.exec(text)) {
      const label = match[1]!;
      let list = this.positions.get(label);
      if (!list) this.positions.set(label, (list = []));
      list.push(match.index);
      // Resume one character later, not after the match: closings may share dashes, as indexOf allows.
      PRIVATE_KEY_CLOSING.lastIndex = match.index + 1;
    }
  }

  /** Start of the first closing of `label` at or after `from`, or -1. */
  find(label: string, from: number): number {
    const list = this.positions.get(label);
    if (!list) return -1;
    let index = this.next.get(label) ?? 0;
    while (index < list.length && list[index]! < from) index++;
    this.next.set(label, index);
    return index < list.length ? list[index]! : -1;
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
    const pass = claims.pass(index, 'generic-high-entropy');
    for (const run of line.text.matchAll(IDENTIFIER_RUN)) {
      if (!SECRET_KEYWORD.test(run[0])) continue;
      ASSIGNED_VALUE.lastIndex = run.index + run[0].length;
      const tail = ASSIGNED_VALUE.exec(line.text);
      if (!tail) continue;
      const value = tail[3]!;
      if (shannonEntropy(value) < MIN_SECRET_ENTROPY) continue;
      // The overlap test uses the whole match; only the quoted value is replaced.
      const matchEnd = tail.index + tail[0].length;
      if (pass.overlaps(run.index, matchEnd)) continue;
      const valueEnd = matchEnd - 1;
      pass.add(valueEnd - value.length, valueEnd);
    }
    pass.finish();
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
    const pass = claims.pass(index, rule);
    for (const match of line.text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (!pass.overlaps(start, end)) pass.add(start, end);
    }
    pass.finish();
  });
}

/** A half-open column interval `[from, to)` of one line covered by a claim. */
interface Covered {
  from: number;
  to: number;
  /** Whether the claim starts on this line: the marker and the claim's one event go here. */
  marker: boolean;
  /** 0-based column of the claim's event (the first dash of a header); used only where `marker` is set. */
  column: number;
  /** The rule that claimed it. */
  rule: SecretRule;
}

/**
 * For each line, the intervals the claims cover, sorted by `from` and disjoint; these intervals are
 * the only record of a claim. A multi-line claim covers every line from its start to its end, with
 * `marker` set only on its start line. Nothing is ever inserted in the middle of a list:
 * `private-key` claims arrive in order and are appended, and each later rule works a line in one
 * {@link LinePass} that is merged in once. Lines and intervals are both in order, so one walk yields
 * the rewritten text and the events, already sorted (design D3).
 */
class Claims {
  /** Covered intervals per line index; `undefined` for a line with no claim. */
  readonly byLine: (Covered[] | undefined)[];

  /** @param lineCount Number of lines of the content. */
  constructor(lineCount: number) {
    this.byLine = new Array<Covered[] | undefined>(lineCount);
  }

  /** Adds a `private-key` claim. Such claims come in increasing position, so each line list stays sorted. */
  add(claim: Claim): void {
    for (let line = claim.startLine; line <= claim.endLine; line++) {
      const from = line === claim.startLine ? claim.startCol : 0;
      const to = line === claim.endLine ? claim.endCol : Number.POSITIVE_INFINITY;
      const covered = (this.byLine[line] ??= []);
      // A header sharing its first dashes with the previous closing: those dashes stay in the previous
      // span, so this one starts where that one ends and the spans never overlap (design D3).
      const previousEnd = covered.length > 0 ? covered[covered.length - 1]!.to : 0;
      covered.push({ from: Math.max(from, previousEnd), to, marker: line === claim.startLine, rule: claim.rule, column: claim.startCol });
    }
  }

  /** Starts one rule's pass over `line`; candidates must then come in non-decreasing start. */
  pass(line: number, rule: SecretRule): LinePass {
    return new LinePass(this, line, rule, this.byLine[line] ?? []);
  }

  /**
   * Rewrites every covered line once and returns the events. The text between intervals is kept; each
   * interval becomes the marker on its claim's start line and nothing elsewhere. One event per
   * interval with `marker`, so a multi-line claim gives one, at its start. Walking lines, then each
   * line's sorted intervals, emits the events by `line` then `column` with no sort; claims never
   * overlap, so the spec's `rule` tie-break never applies.
   */
  apply(lines: Line[], file: string): AuditEvent[] {
    const events: AuditEvent[] = [];
    for (let index = 0; index < lines.length; index++) {
      const covered = this.byLine[index];
      if (!covered) continue;
      const line = lines[index]!;
      const parts: string[] = [];
      let column = 0;
      for (const { from, to, marker, rule, column: eventColumn } of covered) {
        parts.push(line.text.slice(column, from));
        if (marker) {
          parts.push(REDACTION_MARKER);
          events.push({ type: 'secret_redacted', file, line: index + 1, column: eventColumn + 1, rule });
        }
        column = to;
      }
      if (column !== Number.POSITIVE_INFINITY) parts.push(line.text.slice(column));
      line.text = parts.join('');
    }
    return events;
  }
}

/**
 * One rule's single-line candidates on one line, in non-decreasing start. Each is checked against the
 * intervals of earlier rules (a pointer that only moves forward) and the last one this pass accepted.
 * `finish` merges the accepted ones into the line's list: linear, with no sort and no insertion.
 */
class LinePass {
  private pointer = 0;
  private readonly accepted: Covered[] = [];

  constructor(
    private readonly claims: Claims,
    private readonly line: number,
    private readonly rule: SecretRule,
    private readonly earlier: readonly Covered[],
  ) {}

  /** Whether `[start, end)` shares at least one character with an earlier rule or this pass. */
  overlaps(start: number, end: number): boolean {
    while (this.pointer < this.earlier.length && this.earlier[this.pointer]!.to <= start) this.pointer++;
    const next = this.earlier[this.pointer];
    if (next !== undefined && next.from < end) return true;
    const last = this.accepted[this.accepted.length - 1];
    return last !== undefined && last.from < end && last.to > start;
  }

  /** Accepts `[from, to)` of this line for this pass's rule. */
  add(from: number, to: number): void {
    this.accepted.push({ from, to, marker: true, rule: this.rule, column: from });
  }

  /** Merges the accepted intervals into the line's list. */
  finish(): void {
    if (this.accepted.length === 0) return;
    this.claims.byLine[this.line] = mergeCovered(this.earlier, this.accepted);
  }
}

/** Merges two sorted, mutually disjoint interval lists into one sorted list. */
function mergeCovered(a: readonly Covered[], b: readonly Covered[]): Covered[] {
  const merged: Covered[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) merged.push(a[i]!.from < b[j]!.from ? a[i++]! : b[j++]!);
  while (i < a.length) merged.push(a[i++]!);
  while (j < b.length) merged.push(b[j++]!);
  return merged;
}
