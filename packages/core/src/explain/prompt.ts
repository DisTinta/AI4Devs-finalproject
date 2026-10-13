import { createHash } from 'node:crypto';
import type { ContextSpan } from '../context/context-pack.js';
import type { LlmMessage } from '../llm/llm-request.js';

// The prompt of `explain` (DIS-39 design D5): one fixed instruction and the question with the pack's
// spans as JSON data, each under an evidence id local to the prompt (`E1…En`, in rank order). The
// hash is over exactly what is sent. The prompt states the contract and nothing more; sanitising the
// untrusted span text is DIS-41.

/** The instruction sent as the system message of every explain prompt. */
export const EXPLAIN_SYSTEM_PROMPT = [
  'You explain how a code base works, using only the evidence given in the user message.',
  'The user message is a JSON object with the question and the evidence: each piece has an id, a file path, its first and last line and its text.',
  'Answer in the language of the question.',
  'Return only one JSON object, with no other text: {"answer": string, "statements": [{"text": string, "evidenceIds": string[]}]}.',
  'Each statement is one checkable sentence and cites at least one evidence id; cite only the ids given.',
  'Add no other field. If the evidence does not answer the question, return an empty "statements" list.',
].join('\n');

/** The prompt of one question, ready to send, with what the answer needs to read the output back. */
export interface ExplainPrompt {
  /** The messages to send, in order. */
  messages: LlmMessage[];
  /** Each evidence id of the prompt with the span it names, in rank order. */
  evidenceIds: Map<string, ContextSpan>;
  /** SHA-256, lowercase hexadecimal, of the UTF-8 bytes of `JSON.stringify(messages)`. */
  promptHash: string;
}

/**
 * Builds the prompt of `question` over the spans of its pack: span `i` (from 0) gets the id
 * `E{i + 1}`.
 *
 * @param question The question as validated; it goes to the model, never to a log.
 * @param spans The spans of the pack, in rank order.
 */
export function buildPrompt(question: string, spans: readonly ContextSpan[]): ExplainPrompt {
  const evidenceIds = new Map(spans.map((span, i) => [`E${i + 1}`, span]));
  const evidence = [...evidenceIds].map(([id, span]) => ({
    id,
    path: span.path,
    startLine: span.startLine,
    endLine: span.endLine,
    text: span.text,
  }));
  const messages: LlmMessage[] = [
    { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ question, evidence }) },
  ];
  const promptHash = createHash('sha256').update(JSON.stringify(messages), 'utf8').digest('hex');
  return { messages, evidenceIds, promptHash };
}
