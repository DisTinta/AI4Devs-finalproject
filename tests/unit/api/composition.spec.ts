import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BudgetExhausted } from '@codemind/core';
import type { CompletionResult, LlmPort, StorePort } from '@codemind/core';
import { LlmConfigError } from '@codemind/adapter-llm';
import type { LlmConfig } from '@codemind/adapter-llm';
import { apiConfigFromEnv, ApiConfigError, composeFromEnv } from '../../../packages/api/src/composition';
import type { ComposeSeams } from '../../../packages/api/src/composition';
import { createInMemoryStore } from '../../support/in-memory-store';

// Spec: api-foundation → "Configuration from the environment" and "Composition from the
// environment" (DIS-76 design U7).

const DATABASE_URL = 'postgres://codemind:codemind@localhost:5432/codemind';

/** What `fn` threw. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('configuration from the environment', () => {
  it('Defaults apply to unset and empty variables', () => {
    // Arrange
    const blank = '  ';
    const unset = { DATABASE_URL };
    const empty = { DATABASE_URL, PORT: blank, HOST: blank, RATE_LIMIT_MAX: blank, RATE_LIMIT_WINDOW_MS: blank };

    // Act
    const configs = [apiConfigFromEnv(unset), apiConfigFromEnv(empty)];

    // Assert
    for (const config of configs) {
      expect(config).toEqual({ databaseUrl: DATABASE_URL, port: 3000, host: '127.0.0.1', rateLimit: { max: 30, windowMs: 60_000 } });
    }
  });

  it('An invalid variable fails with its name and without its value', () => {
    // Arrange
    const cases: Array<[string, string | undefined]> = [
      ['DATABASE_URL', undefined],
      ['DATABASE_URL', '  '],
      ['PORT', '70000'],
      ['PORT', '0'],
      ['PORT', '3e3'],
      ['RATE_LIMIT_MAX', '0'],
      ['RATE_LIMIT_MAX', 'abc'],
      ['RATE_LIMIT_MAX', '1000001'],
      ['RATE_LIMIT_WINDOW_MS', '0'],
      ['RATE_LIMIT_WINDOW_MS', '1m'],
      ['RATE_LIMIT_WINDOW_MS', '86400001'],
    ];

    for (const [variable, value] of cases) {
      // Act
      const error = thrown(() => apiConfigFromEnv({ DATABASE_URL, [variable]: value }));

      // Assert
      expect(error, `${variable}=${String(value)}`).toBeInstanceOf(ApiConfigError);
      const failure = error as ApiConfigError;
      expect(failure.code).toBe('INVALID_CONFIG');
      expect(failure.variable).toBe(variable);
      expect(failure.message).toBe(`${variable} is missing or invalid; see .env.example`);
      if (value !== undefined && value.trim() !== '') expect(failure.message).not.toContain(value);
    }
  });
});

/** A model double that counts its completions. */
function countingModel(mode: LlmPort['mode'] = 'live'): { llm: LlmPort; completions: () => number } {
  let completions = 0;
  const llm: LlmPort = {
    mode,
    async complete(): Promise<CompletionResult> {
      completions += 1;
      return { text: 'ok', model: 'qwen2.5-coder', usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async embed() {
      throw new Error('not used');
    },
  };
  return { llm, completions: () => completions };
}

/** An `openStore` seam over `store` that records its calls. */
function recordingOpenStore(store: StorePort = createInMemoryStore({ projects: [] }).store): {
  openStore: NonNullable<ComposeSeams['openStore']>;
  opened: string[];
} {
  const opened: string[] = [];
  return {
    opened,
    openStore: async (databaseUrl: string) => {
      opened.push(databaseUrl);
      return { store, close: async () => undefined };
    },
  };
}

/** A live configuration whose every model is priced in the cost table. */
const LIVE = { DATABASE_URL, LLM_BASE_URL: 'http://localhost:11434/v1', LLM_MODEL: 'qwen2.5-coder' };

describe('composition from the environment', () => {
  it('Configuration errors are raised before the store is opened', async () => {
    // Arrange
    const { openStore, opened } = recordingOpenStore();

    // Act
    const missingUrl = await composeFromEnv({}, { openStore }).then(
      () => undefined,
      (error: unknown) => error,
    );
    const badLlm = await composeFromEnv({ DATABASE_URL, LLM_API_KEY: 'k' }, { openStore }).then(
      () => undefined,
      (error: unknown) => error,
    );

    // Assert
    expect(missingUrl).toBeInstanceOf(ApiConfigError);
    expect((missingUrl as ApiConfigError).code).toBe('INVALID_CONFIG');
    expect((missingUrl as ApiConfigError).variable).toBe('DATABASE_URL');
    expect(badLlm).toBeInstanceOf(LlmConfigError);
    expect((badLlm as LlmConfigError).code).toBe('LLM_CONFIG_INVALID');
    expect((badLlm as LlmConfigError).variable).toBe('LLM_BASE_URL');
    expect(opened).toEqual([]);
  });

  it('Evaluation mode uses the model as built', async () => {
    // Arrange
    const { openStore } = recordingOpenStore();
    const model = countingModel('evaluation');
    const received: LlmConfig[] = [];

    // Act
    const composed = await composeFromEnv({ DATABASE_URL }, { openStore, createLlm: (config) => (received.push(config), model.llm) });

    // Assert
    expect(received).toEqual([{ mode: 'evaluation' }]);
    expect(composed.deps.llm).toBe(model.llm);
    await composed.close();
  });

  it('A daily budget stops the model call', async () => {
    // Arrange
    const store: StorePort = { ...createInMemoryStore({ projects: [] }).store, sumCostSince: async () => 1 };
    const now = () => new Date('2026-10-16T12:00:00Z');
    const capped = countingModel();
    const uncapped = countingModel();
    const request = { purpose: 'answer' as const, messages: [{ role: 'user' as const, content: 'hello' }] };

    // Act
    const withCeiling = await composeFromEnv(
      { ...LIVE, DAILY_BUDGET_USD: '1' },
      { openStore: recordingOpenStore(store).openStore, createLlm: () => capped.llm, now },
    );
    const rejection = await withCeiling.deps.llm.complete(request).then(
      () => undefined,
      (error: unknown) => error,
    );
    const withoutCeiling = await composeFromEnv(LIVE, { openStore: recordingOpenStore(store).openStore, createLlm: () => uncapped.llm, now });
    await withoutCeiling.deps.llm.complete(request);

    // Assert
    expect(rejection).toBeInstanceOf(BudgetExhausted);
    expect(capped.completions()).toBe(0);
    expect(uncapped.completions()).toBe(1);
  });

  it("The composed repository root is the repository's top directory", async () => {
    // Arrange
    const { openStore } = recordingOpenStore();

    // Act
    const composed = await composeFromEnv({ DATABASE_URL }, { openStore });

    // Assert
    expect(isAbsolute(composed.deps.workspaceRoot)).toBe(true);
    expect(existsSync(join(composed.deps.workspaceRoot, 'packages/api/package.json'))).toBe(true);
  });
});
