import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './support';
import type { TestApp } from './support';

// Spec: api-foundation → "Rate limit by IP" (DIS-76 design U4).

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The app with a limit of 2 requests per 60 000 ms. */
async function limitedApp(): Promise<TestApp> {
  const built = await buildTestApp({ rateLimit: { max: 2, windowMs: 60_000 } });
  app = built.app;
  return built;
}

/** A valid `POST /api/test-only` from `ip`, with extra headers. */
function ask(target: FastifyInstance, ip: string, headers: Record<string, string> = {}) {
  return target.inject({ method: 'POST', url: '/api/test-only', remoteAddress: ip, headers, payload: { question: 'hello' } });
}

describe('rate limit by IP', () => {
  it('The request beyond the limit answers RATE_LIMITED', async () => {
    // Arrange
    const { app: limited, calls } = await limitedApp();

    // Act
    const first = await ask(limited, '10.0.0.1');
    const second = await ask(limited, '10.0.0.1');
    const third = await ask(limited, '10.0.0.1');

    // Assert
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    const { error } = third.json();
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('too many requests');
    expect(Number.isInteger(error.details.retryAfterSeconds)).toBe(true);
    expect(error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(third.headers['retry-after']).toBe(String(error.details.retryAfterSeconds));
    expect(calls.testOnly).toBe(2);
  });

  it('The limit is per IP and ignores forwarding headers', async () => {
    // Arrange
    const { app: limited } = await limitedApp();
    await ask(limited, '10.0.0.1');
    await ask(limited, '10.0.0.1');

    // Act
    const otherIp = await ask(limited, '10.0.0.2');
    const forwarded = await ask(limited, '10.0.0.1', { 'x-forwarded-for': '10.0.0.9' });

    // Assert
    expect(otherIp.statusCode).toBe(200);
    expect(forwarded.statusCode).toBe(429);
    expect(forwarded.json().error.code).toBe('RATE_LIMITED');
  });

  it('Health and the documentation are not limited', async () => {
    // Arrange
    const { app: limited } = await limitedApp();
    await ask(limited, '10.0.0.1');
    await ask(limited, '10.0.0.1');

    // Act
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await limited.inject({ method: 'GET', url: '/health', remoteAddress: '10.0.0.1' })).statusCode);
      statuses.push((await limited.inject({ method: 'GET', url: '/docs/json', remoteAddress: '10.0.0.1' })).statusCode);
    }

    // Assert
    expect(statuses).toEqual(Array(10).fill(200));
  });

  it('A request that matches no route is not counted', async () => {
    // Arrange
    const { app: limited } = await limitedApp();

    // Act
    const misses: Array<{ status: number; code: string }> = [];
    for (let i = 0; i < 5; i += 1) {
      const response = await limited.inject({ method: 'GET', url: '/api/nope', remoteAddress: '10.0.0.1' });
      misses.push({ status: response.statusCode, code: response.json().error.code });
    }
    const first = await ask(limited, '10.0.0.1');
    const second = await ask(limited, '10.0.0.1');

    // Assert
    expect(misses).toEqual(Array(5).fill({ status: 404, code: 'NOT_FOUND' }));
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('Rejected requests count towards the limit', async () => {
    // Arrange
    const { app: limited } = await limitedApp();
    const invalid = () =>
      limited.inject({ method: 'POST', url: '/api/test-only', remoteAddress: '10.0.0.1', payload: { question: 'abc' } });

    // Act
    const first = await invalid();
    const second = await invalid();
    const third = await ask(limited, '10.0.0.1');

    // Assert
    expect(first.statusCode).toBe(400);
    expect(first.json().error.code).toBe('VALIDATION_ERROR');
    expect(second.statusCode).toBe(400);
    expect(second.json().error.code).toBe('VALIDATION_ERROR');
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('RATE_LIMITED');
  });
});
