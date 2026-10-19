import { describe, expect, it } from 'vitest';
import { resetTimeOf, retryWaitOf } from './notice-display';

// Spec: openspec/changes/ask-page-states/specs/ask-page/spec.md → "How usage figures and notice details
// are written" (DIS-66 design D9, D19, D26, D27).

describe('How usage figures and notice details are written', () => {
  it('The budget reset time is written in UTC', () => {
    // Arrange
    const details: Array<Record<string, unknown>> = [
      { resetsAt: '2026-10-20T00:00:00.000Z' },
      { resetsAt: '2026-10-20T02:00:00+02:00' },
      { resetsAt: '2026-10-20' },
      { resetsAt: 'mañana' },
      { resetsAt: '2026-13-45T00:00:00Z' },
      { resetsAt: 1760918400000 },
      {},
    ];

    // Act
    const written = details.map((detail) => resetTimeOf(detail));

    // Assert
    expect(written).toEqual([
      '2026-10-20 a las 00:00 UTC',
      '2026-10-20 a las 00:00 UTC',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  // Not a scenario of its own: it pins the "denotes a real instant" clause of the requirement, which the
  // scenario above only reaches through an impossible month (design D27, D34).
  it('A reset time is read only from a whole ISO date-time that exists on the calendar', () => {
    // Arrange
    const values = [
      '2026-10-20T00:00Z',
      '2026-01-01T00:00:00Z',
      '2026-12-31T23:59:59Z',
      '2026-02-30T00:00:00Z',
      '2026-10-20T24:00:00Z',
      '2026-00-10T00:00:00Z',
      'x2026-10-20T00:00:00Z',
      '2026-10-20T00:00:00Zx',
    ];

    // Act
    const written = values.map((resetsAt) => resetTimeOf({ resetsAt }));

    // Assert
    expect(written).toEqual([
      '2026-10-20 a las 00:00 UTC',
      '2026-01-01 a las 00:00 UTC',
      '2026-12-31 a las 23:59 UTC',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('The wait of a rate limit is read only when it is a whole number of seconds', () => {
    // Arrange
    const details: Array<Record<string, unknown>> = [
      { retryAfterSeconds: 42 },
      { retryAfterSeconds: 1 },
      { retryAfterSeconds: 0 },
      { retryAfterSeconds: -1 },
      { retryAfterSeconds: 1.5 },
      { retryAfterSeconds: '42' },
      {},
    ];

    // Act
    const waits = details.map((detail) => retryWaitOf(detail));

    // Assert
    expect(waits).toEqual([42, 1, undefined, undefined, undefined, undefined, undefined]);
  });
});
