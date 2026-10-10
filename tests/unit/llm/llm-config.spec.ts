import { describe, expect, it } from 'vitest';
import { DEFAULT_LLM_TIMEOUT_MS, LlmConfigError, llmConfigFromEnv } from '@codemind/adapter-llm';

// Spec `llm-adapter` → LLM configuration is classified and validated at boot (design D5).
const OLLAMA = 'http://localhost:11434/v1';

function configError(env: Record<string, string | undefined>): LlmConfigError {
  try {
    llmConfigFromEnv(env);
  } catch (error) {
    if (error instanceof LlmConfigError) return error;
    throw error;
  }
  throw new Error('expected an LlmConfigError');
}

describe('LLM configuration', () => {
  it('No URL and no key selects evaluation mode', () => {
    // Arrange
    const envs = [
      {},
      { LLM_BASE_URL: '', LLM_API_KEY: '', LLM_MODEL: '' },
      { LLM_BASE_URL: '   ', LLM_API_KEY: '   ', LLM_MODEL: '' },
    ];

    // Act / Assert
    for (const env of envs) expect(llmConfigFromEnv(env)).toEqual({ mode: 'evaluation' });
  });

  it('A URL without a key selects live mode', () => {
    // Act
    const config = llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_API_KEY: '', LLM_MODEL: 'chat-x' });

    // Assert
    expect(config).toEqual({
      mode: 'live',
      baseUrl: OLLAMA,
      model: 'chat-x',
      verifyModel: 'chat-x',
      timeoutMs: 120_000,
    });
    expect(config.mode === 'live' && config.apiKey).toBeFalsy();
    expect(DEFAULT_LLM_TIMEOUT_MS).toBe(120_000);
  });

  it('A key without a URL fails without showing the key', () => {
    // Act
    const error = configError({ LLM_API_KEY: 'centinela-secreta', LLM_BASE_URL: '' });

    // Assert
    expect(error.code).toBe('LLM_CONFIG_INVALID');
    expect(error.variable).toBe('LLM_BASE_URL');
    expect(error.message).toContain('LLM_BASE_URL');
    expect(error.message).not.toContain('centinela-secreta');
  });

  it('A URL without a model fails', () => {
    // Arrange
    const envs = [
      { LLM_BASE_URL: OLLAMA, LLM_MODEL: '' },
      { LLM_BASE_URL: OLLAMA, LLM_MODEL: '', LLM_API_KEY: 'centinela-secreta' },
    ];

    for (const env of envs) {
      // Act
      const error = configError(env);

      // Assert
      expect(error.code).toBe('LLM_CONFIG_INVALID');
      expect(error.variable).toBe('LLM_MODEL');
      expect(error.message).toContain('LLM_MODEL');
      expect(error.message).not.toContain('centinela-secreta');
      expect(error.message).not.toContain(OLLAMA);
    }
  });

  it('A malformed timeout or URL fails naming the variable', () => {
    // Arrange
    const valid = { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x' };
    const cases: Array<[Record<string, string>, string, string]> = [
      ...['abc', '0', '-5', '1.5', '9999999999', '300001'].map(
        (value): [Record<string, string>, string, string] => [{ ...valid, LLM_TIMEOUT_MS: value }, 'LLM_TIMEOUT_MS', value],
      ),
      ...[
        'localhost:11434',
        'ftp://x',
        'http://user:pw@localhost:11434/v1',
        'http://localhost:11434/v1?k=1',
        'http://localhost:11434/v1#x',
      ].map(
        (value): [Record<string, string>, string, string] => [
          { ...valid, LLM_TIMEOUT_MS: '50', LLM_BASE_URL: value },
          'LLM_BASE_URL',
          value,
        ],
      ),
    ];

    for (const [env, variable, value] of cases) {
      // Act
      const error = configError(env);

      // Assert
      expect(error.code).toBe('LLM_CONFIG_INVALID');
      expect(error.variable).toBe(variable);
      expect(error.message).toContain(variable);
      expect(error.message).not.toContain(value);
    }
  });

  it('A valid timeout overrides the default', () => {
    // Act
    const config = llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '50' });

    // Assert
    expect(config).toMatchObject({ mode: 'live', timeoutMs: 50 });
  });

  // Extra cases (not spec scenarios), design D5.
  it('stores the base URL without trailing slashes', () => {
    expect(llmConfigFromEnv({ LLM_BASE_URL: `${OLLAMA}//`, LLM_MODEL: 'chat-x' })).toMatchObject({ baseUrl: OLLAMA });
  });

  it('keeps the key, the verify model and the embedding model, trimmed', () => {
    // Act
    const config = llmConfigFromEnv({
      LLM_BASE_URL: ` ${OLLAMA} `,
      LLM_API_KEY: ' clave-x ',
      LLM_MODEL: ' chat-x ',
      LLM_MODEL_VERIFY: ' verify-y ',
      LLM_EMBED_MODEL: ' embed-z ',
      LLM_TIMEOUT_MS: ' 300000 ',
    });

    // Assert
    expect(config).toEqual({
      mode: 'live',
      baseUrl: OLLAMA,
      apiKey: 'clave-x',
      model: 'chat-x',
      verifyModel: 'verify-y',
      embedModel: 'embed-z',
      timeoutMs: 300000,
    });
  });

  it('checks nothing else in evaluation mode', () => {
    expect(llmConfigFromEnv({ LLM_TIMEOUT_MS: 'abc', LLM_MODEL: '' })).toEqual({ mode: 'evaluation' });
  });

  it('rejects a timeout far above the undici limit', () => {
    expect(configError({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '2147483648' }).variable).toBe(
      'LLM_TIMEOUT_MS',
    );
  });

  it('The daily budget is read in live mode only', () => {
    // Arrange
    const live = { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2' };

    // Act
    const unset = llmConfigFromEnv(live);
    const blank = llmConfigFromEnv({ ...live, DAILY_BUDGET_USD: '  ' });
    const set = llmConfigFromEnv({ ...live, DAILY_BUDGET_USD: '2.5' });
    const evaluation = llmConfigFromEnv({ DAILY_BUDGET_USD: 'abc' });

    // Assert
    expect(unset).toMatchObject({ mode: 'live' });
    expect(unset).not.toHaveProperty('dailyBudgetUsd');
    expect(blank).toMatchObject({ mode: 'live' });
    expect(blank).not.toHaveProperty('dailyBudgetUsd');
    expect(set).toMatchObject({ mode: 'live', dailyBudgetUsd: 2.5 });
    expect(evaluation).toEqual({ mode: 'evaluation' });
  });

  it('A malformed daily budget fails naming the variable', () => {
    // Arrange
    const live = { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2' };

    for (const value of ['abc', '0', '0.0', '-1', '1e3', '1.']) {
      // Act
      const error = configError({ ...live, DAILY_BUDGET_USD: value });

      // Assert
      expect(error.code).toBe('LLM_CONFIG_INVALID');
      expect(error.variable).toBe('DAILY_BUDGET_USD');
      expect(error.message).toContain('DAILY_BUDGET_USD');
      expect(error.message).not.toContain(value);
      expect(error).not.toHaveProperty('modelVariable');
    }
  });

  it('With a ceiling every configured model needs a price', () => {
    // Arrange
    const ceiling = { LLM_BASE_URL: OLLAMA, DAILY_BUDGET_USD: '1' };
    const cases: Array<[Record<string, string>, string]> = [
      [{ ...ceiling, LLM_MODEL: 'llama3.2:3b' }, 'LLM_MODEL'],
      [{ ...ceiling, LLM_MODEL: 'llama3.2', LLM_MODEL_VERIFY: 'sin-precio' }, 'LLM_MODEL_VERIFY'],
      [{ ...ceiling, LLM_MODEL: 'llama3.2', LLM_EMBED_MODEL: 'sin-precio' }, 'LLM_EMBED_MODEL'],
    ];

    // Act
    const priced = llmConfigFromEnv({ ...ceiling, LLM_MODEL: 'llama3.2' });

    // Assert
    expect(priced).toMatchObject({ mode: 'live', dailyBudgetUsd: 1 });
    for (const [env, modelVariable] of cases) {
      const error = configError(env);
      expect(error.code).toBe('LLM_CONFIG_INVALID');
      expect(error.variable).toBe('DAILY_BUDGET_USD');
      expect(error.modelVariable).toBe(modelVariable);
      expect(error.message).toContain('DAILY_BUDGET_USD');
      expect(error.message).toContain(modelVariable);
      expect(error.message).toContain('with a local Ollama leave DAILY_BUDGET_USD empty');
      expect(error.message).not.toContain('llama3.2:3b');
      expect(error.message).not.toContain('sin-precio');
    }
  });

  it('Without a ceiling a model needs no price', () => {
    // Act
    const config = llmConfigFromEnv({
      LLM_BASE_URL: OLLAMA,
      DAILY_BUDGET_USD: '',
      LLM_MODEL: 'llama3.2:3b',
      LLM_MODEL_VERIFY: 'sin-precio',
      LLM_EMBED_MODEL: 'sin-precio',
    });

    // Assert
    expect(config).toMatchObject({ mode: 'live', model: 'llama3.2:3b' });
    expect(config).not.toHaveProperty('dailyBudgetUsd');
  });
});
