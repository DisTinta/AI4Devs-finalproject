import { describe, expect, it } from 'vitest';
import { apiConfigFromEnv, ApiConfigError } from '../../../packages/api/src/composition';

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
