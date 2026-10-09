import {
  EMBEDDING_DIMENSIONS,
  LlmUnavailable,
  type CompletionRequest,
  type CompletionResult,
  type EmbeddingResult,
  type LlmPort,
} from '@codemind/core';
import type { z } from 'zod';
import type { LiveLlmConfig } from './config.js';
import { chatCompletionResponse, embeddingsResponse } from './response-schemas.js';

/** Test seams of {@link createOpenAiCompatibleLlm}. */
export interface OpenAiCompatibleLlmOptions {
  /** The `fetch` to use; Node's global one by default. */
  fetch?: typeof fetch;
}

/**
 * An {@link LlmPort} over an OpenAI-compatible endpoint (`chat/completions`, `embeddings`), Ollama
 * by default. Only a live configuration builds one. Every failure is an `LlmUnavailable` that holds
 * no text from the endpoint or the runtime (design D4).
 */
export function createOpenAiCompatibleLlm(config: LiveLlmConfig, options: OpenAiCompatibleLlmOptions = {}): LlmPort {
  const fetchImpl = options.fetch ?? fetch;

  async function post<T>(path: string, body: object, schema: z.ZodType<T>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey !== undefined) headers.Authorization = `Bearer ${config.apiKey}`;
    let response: Response;
    try {
      // Inside the `try`: an invalid `timeoutMs` (hand-built config) must not escape as a RangeError.
      const signal = AbortSignal.timeout(config.timeoutMs);
      // `manual`: a 3xx comes back as itself (a non-2xx) instead of being followed (design D6).
      response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
        redirect: 'manual',
      });
    } catch (error) {
      if (isAbort(error)) throw new LlmUnavailable('timeout');
      throw new LlmUnavailable('network', systemCodeOf(error));
    }
    if (!response.ok) {
      // Never read: an error body may echo the key. Cancel it so the connection is released.
      await response.body?.cancel().catch(() => undefined);
      throw new LlmUnavailable('http-status', { status: response.status });
    }

    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      // The body stopped: our timeout, or the connection was cut mid-body (design D6).
      if (isAbort(error)) throw new LlmUnavailable('timeout');
      throw new LlmUnavailable('network', systemCodeOf(error));
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new LlmUnavailable('invalid-response');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new LlmUnavailable('invalid-response');
    return parsed.data;
  }

  return {
    mode: 'live',

    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const model = request.purpose === 'verify' ? config.verifyModel : config.model;
      const { choices, usage } = await post(
        '/chat/completions',
        { model, messages: request.messages },
        chatCompletionResponse,
      );
      return {
        text: choices[0].message.content,
        model,
        usage: { inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0 },
      };
    },

    async embed(texts: readonly string[]): Promise<EmbeddingResult> {
      const model = config.embedModel;
      if (model === undefined) throw new LlmUnavailable('not-configured');
      if (texts.length === 0) return { vectors: [], usage: { inputTokens: 0 } };
      const { data, usage } = await post('/embeddings', { model, input: texts }, embeddingsResponse);
      const vectors = inInputOrder(data, texts.length);
      for (const vector of vectors) {
        if (vector.length !== EMBEDDING_DIMENSIONS) {
          throw new LlmUnavailable('dimension-mismatch', { expected: EMBEDDING_DIMENSIONS, received: vector.length });
        }
      }
      return { vectors, usage: { inputTokens: usage?.prompt_tokens ?? 0 } };
    },
  };
}

/** Whether `error` is the abort of the request's timeout signal (classified by name, design D6). */
function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * The runtime's system error code (`ECONNREFUSED`, `ECONNRESET`…) of a failed request, from the error
 * itself or from its `cause` (where Node's `fetch` puts the socket error); never free text (design D4).
 */
function systemCodeOf(error: unknown): { systemCode?: string } {
  for (const candidate of [error, isRecord(error) ? error.cause : undefined]) {
    const code: unknown = isRecord(candidate) ? candidate.code : undefined;
    if (typeof code === 'string' && /^E[A-Z]+$/.test(code)) return { systemCode: code };
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The vectors ordered by `index`; the indexes must be exactly `0..count-1`, each once. */
function inInputOrder(data: readonly { index: number; embedding: number[] }[], count: number): number[][] {
  const vectors: number[][] = [];
  for (const { index, embedding } of data) {
    if (index >= count || vectors[index] !== undefined) throw new LlmUnavailable('invalid-response');
    vectors[index] = embedding;
  }
  if (data.length !== count) throw new LlmUnavailable('invalid-response');
  return vectors;
}
