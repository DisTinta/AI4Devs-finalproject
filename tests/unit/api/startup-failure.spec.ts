import { describe, expect, it } from 'vitest';
import { LlmConfigError } from '@codemind/adapter-llm';
import { DatabaseUnavailable } from '@codemind/adapter-store-postgres';
import { ApiConfigError } from '../../../packages/api/src/composition';
import { startupFailure } from '../../../packages/api/src/startup-failure';

// Spec: api-foundation → "Start-up failure" (DIS-76 design U6).

describe('start-up failure', () => {
  it('Start-up errors map to their line', () => {
    // Arrange
    const errors: unknown[] = [
      new ApiConfigError('PORT'),
      new LlmConfigError('LLM_BASE_URL'),
      new LlmConfigError('DAILY_BUDGET_USD', 'LLM_MODEL'),
      new DatabaseUnavailable(),
      Object.assign(new Error('listen EADDRINUSE: address already in use 127.0.0.1:3000'), { code: 'EADDRINUSE' }),
      new Error('boom'),
    ];

    // Act
    const lines = errors.map(startupFailure);

    // Assert
    expect(lines).toEqual([
      { code: 'INVALID_CONFIG', message: 'PORT is missing or invalid; see .env.example', details: { variable: 'PORT' } },
      { code: 'LLM_CONFIG_INVALID', message: 'LLM_BASE_URL is missing or invalid; see .env.example', details: { variable: 'LLM_BASE_URL' } },
      {
        code: 'LLM_CONFIG_INVALID',
        message: 'DAILY_BUDGET_USD is set but LLM_MODEL has no price in COST_TABLE; see .env.example',
        details: { variable: 'DAILY_BUDGET_USD', modelVariable: 'LLM_MODEL' },
      },
      { code: 'DATABASE_UNAVAILABLE', message: 'cannot connect to the database', details: {} },
      { code: 'STARTUP_FAILED', message: 'the API could not start', details: { systemCode: 'EADDRINUSE' } },
      { code: 'STARTUP_FAILED', message: 'the API could not start', details: {} },
    ]);
  });
});
