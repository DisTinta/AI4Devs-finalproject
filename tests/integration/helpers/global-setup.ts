import { assertNoCommittedProjects } from './committed-projects';

/**
 * Vitest `globalSetup` of the `node` and `seed-build` projects (DIS-110, integration-test-races design
 * D9): before any test file runs, refuses a test database that holds committed projects. Reads
 * `DATABASE_URL` itself and does nothing when it is unset, `CI` or not: `./db` stays the only gate
 * that skips or fails database tests, and this module must not import it (it throws on import in CI
 * without a URL, and the CI mutation job inherits this setup with no database).
 */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  await assertNoCommittedProjects(url);
}
