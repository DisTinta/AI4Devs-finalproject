import { describe, expect, it } from 'vitest';
import { runCommand } from '../store/support';

// The DATABASE_URL gate runs when a module is imported, so it is observed from a child Vitest run.
// One harness spec (imports helpers/db.ts directly) and one store spec (through store/support.ts)
// are enough: both reach the same gate. This file needs no database itself.
// No colour codes in the child output, so the summary lines can be matched as plain text.
const PLAIN_OUTPUT = { NO_COLOR: '1', FORCE_COLOR: undefined };
const CHILD_RUN =
  'npx vitest run tests/integration/helpers/harness.spec.ts tests/integration/store/graph-schema-constraints.spec.ts';

describe('test-db-isolation: single database availability gate', () => {
  it('Database tests are skipped locally without a database', { timeout: 60_000 }, () => {
    const result = runCommand(CHILD_RUN, { ...PLAIN_OUTPUT, DATABASE_URL: undefined, CI: undefined });
    const output = result.stdout + result.stderr;

    expect(result.status, output).toBe(0);
    expect(output).toContain('WARNING: DATABASE_URL is not set');
    expect(output).toMatch(/Test Files\s+2 skipped \(2\)/);
    // Vitest 1.x reports both files as skipped; it counts as skipped only the tests of suites it
    // skipped explicitly, so the assertion is on files: none passed, none failed.
    expect(output).not.toMatch(/\d+ (passed|failed)/);
  });

  it('Database tests fail in CI without a database', { timeout: 60_000 }, () => {
    const result = runCommand(CHILD_RUN, { ...PLAIN_OUTPUT, DATABASE_URL: undefined, CI: 'true' });
    const output = result.stdout + result.stderr;

    expect(result.status, output).not.toBe(0);
    expect(output).toContain('DATABASE_URL must be set in CI');
  });
});
