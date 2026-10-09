import { describe, expect, it } from 'vitest';
import { DomainError, EMBEDDING_DIMENSIONS, LlmUnavailable } from '@codemind/core';

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
