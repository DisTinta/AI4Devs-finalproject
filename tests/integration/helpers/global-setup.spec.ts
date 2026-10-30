import { afterEach, describe, expect, it, vi } from 'vitest';

// Spec: openspec/changes/integration-test-races/specs/test-db-isolation/spec.md → "A test database with
// committed projects is refused", scenario "No database configured" (DIS-110). Needs no database: the
// check itself is replaced by a spy.

vi.mock('./committed-projects', () => ({ assertNoCommittedProjects: vi.fn(async () => undefined) }));

const { assertNoCommittedProjects } = await import('./committed-projects');
const { default: setup } = await import('./global-setup');

describe('test-db-isolation: the start-up check of the integration run', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(assertNoCommittedProjects).mockClear();
  });

  it('No database configured', async () => {
    // Arrange
    vi.stubEnv('DATABASE_URL', undefined);

    // Act / Assert
    await expect(setup()).resolves.toBeUndefined();
    expect(assertNoCommittedProjects).not.toHaveBeenCalled();
  });

  it('checks the configured database once', async () => {
    // Not a spec scenario: with a URL, setup delegates to the check with that URL.
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:1/db');
    await setup();
    expect(assertNoCommittedProjects).toHaveBeenCalledExactlyOnceWith('postgres://u:p@localhost:1/db');
  });
});
