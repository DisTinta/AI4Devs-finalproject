import type { CompletionRequest, CompletionResult, EmbeddingResult, LlmPort } from '@codemind/core';

// A scripted LlmPort double for the explain tests (DIS-39 design D13). It records every request and
// answers with the output a script builds from the evidence the prompt gives (the ids `E1…En` and
// their spans), so a test can cite "the span of `PriceCalculator.php`" without knowing its id. A
// script may also throw, to stand for a model failure. An optional shared `order` list records the
// call, so a test can check it came after the store's reads.

/** One evidence entry of the prompt, as the user message carries it. */
export interface PromptEvidence {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

/** What the script receives: the question and the evidence of the prompt. */
export interface PromptView {
  question: string;
  evidence: PromptEvidence[];
}

/** Builds the model's raw output from the prompt; throws to fail the call. */
export type Script = (prompt: PromptView) => string;

/** The double and what it recorded. */
export interface ScriptedLlm {
  llm: LlmPort;
  /** Every completion request, in order. */
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

/**
 * A scripted model in `mode`. In evaluation mode `complete` throws, as the real evaluation model
 * never answers.
 */
export function createScriptedLlm(
  mode: LlmPort['mode'],
  script: Script = () => '{"answer":"ok","statements":[]}',
  order?: string[],
): ScriptedLlm {
  const requests: CompletionRequest[] = [];
  const llm: LlmPort = {
    mode,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      requests.push(request);
      order?.push('complete');
      if (mode === 'evaluation') throw new Error('the evaluation model must never be called');
      return { text: script(promptView(request)), model: SCRIPTED_MODEL, usage: { inputTokens: 0, outputTokens: 0 } };
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
