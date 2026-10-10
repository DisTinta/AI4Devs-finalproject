import { describe, expect, it } from 'vitest';
import { BudgetExhausted, DomainError, EMBEDDING_DIMENSIONS, LlmUnavailable } from '@codemind/core';

// Not a spec scenario: it backs design D3/D4 (one class, closed reason, no cause, a message built only
// from the reason and its numbers) and gives the mutation run something to kill in core.
describe('LlmUnavailable', () => {
  it('carries its stable code and the reason', () => {
    // Arrange / Act
    const error = new LlmUnavailable('not-configured');

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('LLM_UNAVAILABLE');
    expect(error.name).toBe('LlmUnavailable');
    expect(error.reason).toBe('not-configured');
    expect(error.message).toBe('LLM unavailable: not-configured');
    for (const detail of ['status', 'expected', 'received', 'systemCode']) expect(error).not.toHaveProperty(detail);
    expect(JSON.parse(JSON.stringify(error))).toEqual({ reason: 'not-configured', code: 'LLM_UNAVAILABLE', name: 'LlmUnavailable' });
  });

  it('keeps the HTTP status of an http-status failure', () => {
    // Arrange / Act
    const error = new LlmUnavailable('http-status', { status: 500 });

    // Assert
    expect(error.status).toBe(500);
    expect(error.message).toBe('LLM unavailable: http-status 500');
    expect(JSON.parse(JSON.stringify(error))).toMatchObject({ reason: 'http-status', status: 500 });
  });

  it('keeps both dimensions of a dimension mismatch', () => {
    // Arrange / Act
    const error = new LlmUnavailable('dimension-mismatch', { expected: EMBEDDING_DIMENSIONS, received: 768 });

    // Assert
    expect(error.expected).toBe(1536);
    expect(error.received).toBe(768);
    expect(error.message).toBe('LLM unavailable: dimension-mismatch (expected 1536, received 768)');
  });

  it('prints the dimensions only as a complete pair', () => {
    // Act
    const expectedOnly = new LlmUnavailable('dimension-mismatch', { expected: 1536 });
    const receivedOnly = new LlmUnavailable('dimension-mismatch', { received: 768 });

    // Assert
    expect(expectedOnly.message).toBe('LLM unavailable: dimension-mismatch');
    expect(receivedOnly.message).toBe('LLM unavailable: dimension-mismatch');
  });

  it('keeps the system code of a network failure', () => {
    // Arrange / Act
    const error = new LlmUnavailable('network', { systemCode: 'ECONNREFUSED' });

    // Assert
    expect(error.systemCode).toBe('ECONNREFUSED');
    expect(error.message).toBe('LLM unavailable: network ECONNREFUSED');
  });

  it('never has a cause', () => {
    // Arrange / Act
    const error = new LlmUnavailable('invalid-response');

    // Assert
    expect('cause' in error).toBe(false);
  });

  it('fixes the embedding dimension to the schema columns', () => {
    // Assert
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
});

// Not a spec scenario: it backs the requirement "Daily spend ceiling" (design D5: only numbers and the
// reset time, no cause) and gives the mutation run something to kill in core.
describe('BudgetExhausted', () => {
  it('carries its stable code, the spend, the ceiling and the reset time', () => {
    // Arrange / Act
    const resetsAt = new Date('2026-10-10T00:00:00Z');
    const error = new BudgetExhausted(1.000001, 1, resetsAt);

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('BUDGET_EXHAUSTED');
    expect(error.name).toBe('BudgetExhausted');
    expect(error.spentUsd).toBe(1.000001);
    expect(error.dailyBudgetUsd).toBe(1);
    expect(error.resetsAt).toEqual(resetsAt);
    expect(error.message).toBe(
      'Daily LLM budget exhausted: spent 1.000001 USD of 1 USD; resets at 2026-10-10T00:00:00.000Z',
    );
  });

  it('never has a cause', () => {
    // Arrange / Act
    const error = new BudgetExhausted(2, 1, new Date('2026-10-10T00:00:00Z'));

    // Assert
    expect('cause' in error).toBe(false);
  });
});

// Not a spec scenario: the evaluation adapter's reason (design D2) prints as itself.
describe('LlmUnavailable evaluation-mode', () => {
  it('names the evaluation-mode reason', () => {
    // Arrange / Act
    const error = new LlmUnavailable('evaluation-mode');

    // Assert
    expect(error.reason).toBe('evaluation-mode');
    expect(error.message).toBe('LLM unavailable: evaluation-mode');
  });
});
