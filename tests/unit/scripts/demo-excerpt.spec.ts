import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runDemoExcerpt } from '../../../scripts/demo-excerpt.mjs';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "The demo
// excerpt helper" (DIS-102 design D8). Each test is one scenario, named after it. The fixtures are
// the real `fixtures/` of the repository, read only.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = resolve(ROOT, 'fixtures');
const CALCULATOR = 'app/Services/PriceCalculator.php';

/** A stream double that records every write. */
function recorder(): { write: (chunk: string) => boolean; text: () => string } {
  const chunks: string[] = [];
  return {
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    text: () => chunks.join(''),
  };
}

/** Runs `demo:excerpt` with `args` on the real fixtures and returns what it printed and its exit code. */
function excerpt(...args: string[]): { stdout: string; stderr: string; code: number } {
  const stdout = recorder();
  const stderr = recorder();
  const code = runDemoExcerpt(args, { fixturesRoot: FIXTURES, stdout, stderr });
  return { stdout: stdout.text(), stderr: stderr.text(), code };
}

/** The lines of a fixture file as the spec defines them: LF-split, trailing CR dropped, no line after a final LF. */
function fixtureLines(project: string, path: string): string[] {
  const lines = readFileSync(resolve(FIXTURES, project, path), 'utf8').split('\n').map((line) => line.replace(/\r$/, ''));
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

describe('The demo excerpt helper', () => {
  it('An excerpt prints exactly the cited lines', () => {
    // Arrange
    const expected = fixtureLines('acme-shop', CALCULATOR).slice(15, 44);

    // Act
    const result = excerpt('acme-shop', `${CALCULATOR}:16-44`);

    // Assert
    expect(expected).toHaveLength(29);
    expect(expected[0]).toBe('class PriceCalculator');
    expect(result.stdout).toBe(expected.map((line) => `${line}\n`).join(''));
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });
});
