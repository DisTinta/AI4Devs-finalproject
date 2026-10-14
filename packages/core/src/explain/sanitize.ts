import type { ContextSpan } from '../context/context-pack.js';
import { estimateTokens } from '../context/tokenizer.js';
import { INSTRUCTION_PATTERNS } from './explain-event.js';
import type { InstructionPatternCode, SanitizationEvent } from './explain-event.js';
import { MAX_EVIDENCE_TEXT_CHARS } from './limits.js';

// The sanitisation of untrusted content before the explain prompt (DIS-41 design D1–D3): a pure
// function over the question and the pack's spans. It cuts each span to `MAX_EVIDENCE_TEXT_CHARS`
// at a line boundary, then flags instruction-like lines of the kept text with a closed set of coarse
// patterns, and returns events that carry codes, ids, a path and line numbers, never text.
// Defence in depth, not a barrier (readme §2.5): nothing is blocked, and the text is returned
// unchanged; neutralising the marker sequences is the prompt's job (prompt.ts), on what it sends only.

/**
 * The source of the regular expression of a marker sequence: `<<<`, optional whitespace, and
 * `UNTRUSTED_DATA` or `END_UNTRUSTED_DATA`, to be compiled case-insensitive. The one definition the
 * `delimiter-spoof` pattern and the prompt's neutralisation share, so they cannot drift apart.
 */
export const MARKER_SEQUENCE_SOURCE = '<<<\\s*(?:END_)?UNTRUSTED_DATA';

// One regex per code, so a code without a rule fails the type check. Flags `iu`: case-insensitive,
// and `.`/`{0,40}` count code points. No `g`, so `lastIndex` never carries state between calls. No
// repeated group holds a quantifier and every gap is bounded: linear in the line length.
const PATTERN_RULES: Record<InstructionPatternCode, RegExp> = {
  'ignore-instructions':
    /(?:ignore|disregard|forget|override).{0,40}(?:previous|prior|above|all|earlier).{0,40}(?:instructions|rules|prompt|directions)|(?:ignora|olvida|descarta|omite).{0,40}(?:instrucciones|reglas|indicaciones).{0,40}(?:anteriores|previas)/iu,
  'role-override': /you are now|from now on, you|pretend (?:to be|you are)|ahora eres|a partir de ahora (?:eres|actúa)|finge (?:ser|que eres)/iu,
  'system-impersonation': /^\s*(?:(?:\/\/|#|\*|--|\/\*)\s*)?(?:system|assistant|developer)\s*:|\[INST\]|<\|im_start\|>|<system>/iu,
  'delimiter-spoof': new RegExp(MARKER_SEQUENCE_SOURCE, 'iu'),
};

/** A span of the pack after sanitisation: still a `ContextSpan`, so every later step takes it. */
export interface SanitizedSpan extends ContextSpan {
  /** Distinct pattern codes that matched the kept text, in `INSTRUCTION_PATTERNS` order. */
  flags: InstructionPatternCode[];
  /** Present only when the span was cut: its prompt mark and its last line before the cut. */
  truncation?: { mark: string; originalEndLine: number };
}

/** The question and the spans of one prompt after sanitisation, with the events it raised. */
export interface SanitizedPrompt {
  /** The question, unchanged. */
  question: string;
  /** Distinct pattern codes that matched the question, in `INSTRUCTION_PATTERNS` order. */
  questionFlags: InstructionPatternCode[];
  /** The spans in rank order; a cut span carries its kept last line, text and tokens. */
  spans: SanitizedSpan[];
  /** The question's flagged events, then each span's flagged events and its truncated event. */
  events: SanitizationEvent[];
}

/**
 * The evidence id of the span at `index` (from 0) of the pack: `E1…En` in rank order. The one rule
 * for evidence ids, shared by the events and the prompt.
 *
 * @param index Position of the span in the pack, from 0.
 */
export function evidenceIdAt(index: number): string {
  return `E${index + 1}`;
}

/**
 * Sanitises the question and the pack's spans for the explain prompt: cuts each span over
 * `MAX_EVIDENCE_TEXT_CHARS`, flags every kept line that matches an instruction pattern, and lists the
 * events in the order an answer carries them. Reads nothing but its arguments; the same input gives
 * the same result.
 *
 * @param question The question as validated; never cut.
 * @param spans The spans of the pack, in rank order.
 */
export function sanitizeForPrompt(question: string, spans: readonly ContextSpan[]): SanitizedPrompt {
  const questionMatches = firstMatches(question);
  const events: SanitizationEvent[] = questionMatches.map(({ code }) => ({
    type: 'untrusted_content_flagged',
    source: 'question',
    pattern: code,
  }));
  const sanitized = spans.map((span, i): SanitizedSpan => {
    const evidenceId = evidenceIdAt(i);
    const kept = truncate(span);
    const matches = firstMatches(kept.text);
    for (const { code, offset } of matches) {
      events.push({
        type: 'untrusted_content_flagged',
        source: 'evidence',
        evidenceId,
        path: span.path,
        line: span.startLine + offset,
        pattern: code,
      });
    }
    if (kept.truncation) {
      events.push({
        type: 'untrusted_content_truncated',
        evidenceId,
        path: span.path,
        originalEndLine: kept.truncation.originalEndLine,
        keptEndLine: kept.endLine,
      });
    }
    return { ...kept, flags: codesOf(matches) };
  });
  return { question, questionFlags: codesOf(questionMatches), spans: sanitized, events };
}

/** A pattern that matched a text, and the offset (from 0) of the first line where it did. */
interface PatternMatch {
  code: InstructionPatternCode;
  offset: number;
}

/** The codes of `matches`, in their order. */
function codesOf(matches: readonly PatternMatch[]): InstructionPatternCode[] {
  return matches.map(({ code }) => code);
}

/** For each pattern that matches a line of `text`, in list order, the offset of its first such line. */
function firstMatches(text: string): PatternMatch[] {
  const lines = text.split('\n');
  return INSTRUCTION_PATTERNS.flatMap((code) => {
    const offset = lines.findIndex((line) => PATTERN_RULES[code].test(line));
    return offset === -1 ? [] : [{ code, offset }];
  });
}

/**
 * `span` cut to `MAX_EVIDENCE_TEXT_CHARS` code points (design D2): one forward walk over at most
 * `MAX + 1` code points, remembering the last newline seen. A longer text keeps the whole lines before
 * that newline, minus one trailing `\r`; with no newline there, the first line alone is too long and
 * keeps its first `MAX` code points.
 */
function truncate(span: ContextSpan): Omit<SanitizedSpan, 'flags'> {
  const { text } = span;
  let codePoints = 0;
  let index = 0;
  let endOfMax = 0;
  let newlines = 0;
  let lastNewline = -1;
  while (index < text.length && codePoints <= MAX_EVIDENCE_TEXT_CHARS) {
    const codePoint = text.codePointAt(index) as number;
    if (codePoint === 0x0a) {
      newlines++;
      lastNewline = index;
    }
    index += codePoint > 0xffff ? 2 : 1;
    codePoints++;
    if (codePoints === MAX_EVIDENCE_TEXT_CHARS) endOfMax = index;
  }
  if (codePoints <= MAX_EVIDENCE_TEXT_CHARS) return span;

  const lineCut = lastNewline === -1;
  const kept = lineCut ? text.slice(0, endOfMax) : text.slice(0, lastNewline).replace(/\r$/, '');
  const keptEndLine = lineCut ? span.startLine : span.startLine + newlines - 1;
  const omitted = span.endLine - keptEndLine;
  const mark = lineCut
    ? '[TRUNCATED: line cut]'
    : `[TRUNCATED: ${omitted} ${omitted === 1 ? 'line' : 'lines'} omitted]`;
  return {
    ...span,
    endLine: keptEndLine,
    text: kept,
    tokens: estimateTokens(kept),
    truncation: { mark, originalEndLine: span.endLine },
  };
}
