import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmUnavailable, type CompletionRequest } from '@codemind/core';
import { createEvaluationLlm, createLlm, llmConfigFromEnv } from '@codemind/adapter-llm';

// Spec `llm-adapter` → Evaluation mode never calls the model (design D1, D2). A spy on the global
// `fetch` proves no request leaves.

const ANSWER: CompletionRequest = { messages: [{ role: 'user', content: 'q' }], purpose: 'answer' };
const VERIFY: CompletionRequest = { messages: [{ role: 'user', content: 'q' }], purpose: 'verify' };

async function failure(promise: Promise<unknown>): Promise<LlmUnavailable> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmUnavailable) return error;
    throw error;
  }
  throw new Error('expected an LlmUnavailable');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Evaluation mode', () => {
  it('Without URL and key no request is sent', async () => {
    // Arrange
    const spy = vi.spyOn(globalThis, 'fetch');
    const envs = [{}, { LLM_BASE_URL: '  ', LLM_API_KEY: '', LLM_MODEL: 'x' }];

    for (const env of envs) {
      const llm = createLlm(llmConfigFromEnv(env));

      // Act
      const failures = [
        await failure(llm.complete(ANSWER)),
        await failure(llm.complete(VERIFY)),
        await failure(llm.embed(['a'])),
        await failure(llm.embed([])),
      ];

      // Assert
      expect(llm.mode).toBe('evaluation');
      for (const error of failures) {
        expect(error.code).toBe('LLM_UNAVAILABLE');
        expect(error.reason).toBe('evaluation-mode');
      }
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('A live configuration does not type-check against the evaluation model', () => {
    // Arrange
    const live = llmConfigFromEnv({ LLM_BASE_URL: 'http://localhost:11434/v1', LLM_MODEL: 'chat-x' });
    const evaluation = llmConfigFromEnv({});
    if (live.mode !== 'live' || evaluation.mode !== 'evaluation') throw new Error('unexpected modes');

    // Act / Assert: `npm run typecheck` fails if the directive below stops being needed. The call is
    // never run: the spec asks for a type-level check only, not a runtime guard.
    // @ts-expect-error -- only an EvaluationLlmConfig builds the evaluation model (design D1).
    const neverCalled = (): unknown => createEvaluationLlm(live);
    expect(typeof neverCalled).toBe('function');
    expect(createEvaluationLlm(evaluation).mode).toBe('evaluation');
  });
});

// Spec `llm-adapter` → One entry point builds the model for the configured mode (design D3).
describe('LLM entry point', () => {
  it('The entry point builds a live model for a live configuration', async () => {
    // Arrange
    const urls: string[] = [];
    const recordingFetch = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'hola' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const config = llmConfigFromEnv({
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: 'chat-x',
      DAILY_BUDGET_USD: '',
    });

    // Act
    const llm = createLlm(config, { fetch: recordingFetch });
    const result = await llm.complete(ANSWER);

    // Assert
    expect(llm.mode).toBe('live');
    expect(result.text).toBe('hola');
    expect(urls).toEqual(['http://localhost:11434/v1/chat/completions']);
  });
});
