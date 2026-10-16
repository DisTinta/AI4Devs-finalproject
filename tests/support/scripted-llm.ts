import type { CompletionRequest, CompletionResult, CompletionUsage, EmbeddingResult, LlmPort } from '@codemind/core';

// A scripted LlmPort double for the explain tests (DIS-39 design D13). It records every request and
// answers with the output a script builds from the evidence the prompt gives (the ids `E1…En` and
// their spans), so a test can cite "the span of `PriceCalculator.php`" without knowing its id. A
// script may also throw, to stand for a model failure. An optional shared `order` list records the
// call, so a test can check it came after the store's reads.
//
// Since DIS-70 (design S10) a request with the purpose `verify` goes to `options.verify` instead of the
// script, with the pair the semantic check sent (`VerifyView`); its default entails every pair. In the
// shared `order`, an `answer` request pushes `complete` (as before) and a `verify` request `verify`.

/**
 * One evidence entry of the prompt, as the user message carries it. Since DIS-41 `text` is wrapped
 * between `<<<UNTRUSTED_DATA <id>>>>` markers (and a cut span ends at its kept last line), so a script
 * matches a span by path and lines, not by text.
 */
export interface PromptEvidence {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  flags?: string[];
}

/** What the script receives: the question (wrapped in markers) and the evidence of the prompt. */
export interface PromptView {
  question: string;
  questionFlags?: string[];
  evidence: PromptEvidence[];
}

/** Builds the model's raw output from the prompt; throws to fail the call. */
export type Script = (prompt: PromptView) => string;

/** What a verifier script receives: the statement and the evidence of one pair, markers included. */
export interface VerifyView {
  statement: string;
  evidence: { path: string; startLine: number; endLine: number; text: string };
}

/** Builds the verifier's raw output for one pair; throws (or rejects) to fail the call. */
export type VerifyScript = (view: VerifyView) => string | Promise<string>;

/** What a `verify` request is answered with and what each request reports. */
export interface ScriptedLlmOptions {
  /** The verifier; `{"entails":true}` for every pair when absent. */
  verify?: VerifyScript;
  /** The tokens an `answer` request reports; 0/0 when absent. */
  answerUsage?: CompletionUsage;
  /** The tokens a `verify` request reports; 0/0 when absent. */
  verifyUsage?: CompletionUsage;
  /** The model a `verify` request reports; `SCRIPTED_MODEL` when absent. */
  verifyModel?: string;
  /** The model an `answer` request reports; `SCRIPTED_MODEL` when absent (DIS-74). */
  answerModel?: string;
}

/** The double and what it recorded. */
export interface ScriptedLlm {
  llm: LlmPort;
  /** Every completion request, in order, `answer` and `verify` alike. */
  requests: CompletionRequest[];
}

/** The model name the double reports. */
export const SCRIPTED_MODEL = 'scripted-model';

/** Reads the question and evidence out of the user message of `request`. */
export function promptView(request: CompletionRequest): PromptView {
  const user = request.messages.find((message) => message.role === 'user');
  if (user === undefined) throw new Error('the prompt has no user message');
  return JSON.parse(user.content) as PromptView;
}

/** Reads the pair out of the user message of a `verify` request. */
export function verifyView(request: CompletionRequest): VerifyView {
  const user = request.messages.find((message) => message.role === 'user');
  if (user === undefined) throw new Error('the verify request has no user message');
  return JSON.parse(user.content) as VerifyView;
}

/** The pairs of the `verify` requests among `requests`, in order. */
export function verifyRequests(requests: readonly CompletionRequest[]): VerifyView[] {
  return requests.filter((request) => request.purpose === 'verify').map(verifyView);
}

/** Whether `view` is the pair of the statement holding `statementText` and a citation of `path`. */
export function isAbout(view: VerifyView, statementText: string, path: string): boolean {
  return view.statement.includes(statementText) && view.evidence.path === path;
}

const NO_USAGE: CompletionUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * A scripted model in `mode`. In evaluation mode `complete` throws, as the real evaluation model
 * never answers.
 */
export function createScriptedLlm(
  mode: LlmPort['mode'],
  script: Script = () => '{"answer":"ok","statements":[]}',
  order?: string[],
  options: ScriptedLlmOptions = {},
): ScriptedLlm {
  const requests: CompletionRequest[] = [];
  const verify = options.verify ?? (() => '{"entails":true}');
  const llm: LlmPort = {
    mode,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      requests.push(request);
      const isVerify = request.purpose === 'verify';
      order?.push(isVerify ? 'verify' : 'complete');
      if (mode === 'evaluation') throw new Error('the evaluation model must never be called');
      if (isVerify) {
        const text = await verify(verifyView(request));
        return { text, model: options.verifyModel ?? SCRIPTED_MODEL, usage: { ...(options.verifyUsage ?? NO_USAGE) } };
      }
      return {
        text: script(promptView(request)),
        model: options.answerModel ?? SCRIPTED_MODEL,
        usage: { ...(options.answerUsage ?? NO_USAGE) },
      };
    },
    async embed(): Promise<EmbeddingResult> {
      throw new Error('not used by explain');
    },
  };
  return { llm, requests };
}

/** The JSON text of a model output with `answer` and statements citing the given ids. */
export function modelOutput(answer: string, statements: Array<{ text: string; evidenceIds: string[] }>): string {
  return JSON.stringify({ answer, statements });
}
