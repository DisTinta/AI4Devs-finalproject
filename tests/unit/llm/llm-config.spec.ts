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
      ...['abc', '0', '-5', '1.5', '9999999999'].map(
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
      LLM_TIMEOUT_MS: ' 2147483647 ',
    });

    // Assert
    expect(config).toEqual({
      mode: 'live',
      baseUrl: OLLAMA,
      apiKey: 'clave-x',
      model: 'chat-x',
      verifyModel: 'verify-y',
      embedModel: 'embed-z',
      timeoutMs: 2147483647,
    });
  });

  it('checks nothing else in evaluation mode', () => {
    expect(llmConfigFromEnv({ LLM_TIMEOUT_MS: 'abc', LLM_MODEL: '' })).toEqual({ mode: 'evaluation' });
  });

  it('rejects a timeout just above the timer limit', () => {
    expect(configError({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '2147483648' }).variable).toBe(
      'LLM_TIMEOUT_MS',
    );
  });
});
