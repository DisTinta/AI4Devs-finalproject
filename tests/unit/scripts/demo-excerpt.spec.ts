import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

  it('Paths outside the project are refused', () => {
    // Arrange
    const absolute = resolve(ROOT, 'package.json');

    for (const path of ['../task-api/package.json', absolute, 'app/../../acme-shop/../../package.json']) {
      // Act
      const result = excerpt('acme-shop', `${path}:1-1`);

      // Assert
      expect(result.stderr, path).toBe(`demo:excerpt: ${path} is outside fixtures/acme-shop\n`);
      expect(result.stdout, path).toBe('');
      expect(result.code, path).toBe(1);
    }
    for (const project of ['..', '.']) {
      // Act
      const result = excerpt(project, 'package.json:1-1');

      // Assert
      expect(result.stderr, project).toBe(`demo:excerpt: unknown project ${project}\n`);
      expect(result.stdout, project).toBe('');
      expect(result.code, project).toBe(1);
    }
  });

  it('A missing file or a range past its end is reported', () => {
    // Arrange
    const lineCount = fixtureLines('acme-shop', CALCULATOR).length;

    // Act
    const missing = excerpt('acme-shop', 'app/Nope.php:1-2');
    const directory = excerpt('acme-shop', 'app/Services:1-2');
    const pastEnd = excerpt('acme-shop', `${CALCULATOR}:16-9999`);

    // Assert
    expect(missing.stderr).toBe('demo:excerpt: app/Nope.php not found in fixtures/acme-shop\n');
    expect(directory.stderr).toBe('demo:excerpt: app/Services not found in fixtures/acme-shop\n');
    expect(pastEnd.stderr).toBe(`demo:excerpt: ${CALCULATOR} has ${lineCount} lines\n`);
    for (const result of [missing, directory, pastEnd]) {
      expect(result.stdout).toBe('');
      expect(result.code).toBe(1);
    }
  });

  it('A malformed citation is a usage error', () => {
    // Arrange
    const usage = 'usage: npm run demo:excerpt -- <project> <path>:<start>-<end>\n';
    const calls = [
      ['acme-shop', CALCULATOR],
      ['acme-shop', `${CALCULATOR}:0-3`],
      ['acme-shop', `${CALCULATOR}:9-3`],
      ['acme-shop', `${CALCULATOR}:a-b`],
      ['acme-shop'],
    ];

    for (const args of calls) {
      // Act
      const result = excerpt(...args);

      // Assert
      expect(result.stderr, args.join(' ')).toBe(usage);
      expect(result.stdout, args.join(' ')).toBe('');
      expect(result.code, args.join(' ')).toBe(2);
    }
  });

  it('A link that leads out of the project is refused', () => {
    // Arrange: a temporary fixtures directory whose project holds a directory link to a folder outside
    // it (a junction on Windows, which needs no privilege; a symbolic link elsewhere)
    const base = mkdtempSync(join(tmpdir(), 'codemind-excerpt-'));
    try {
      const fixturesRoot = join(base, 'fixtures');
      mkdirSync(join(fixturesRoot, 'demo'), { recursive: true });
      mkdirSync(join(base, 'outside'));
      writeFileSync(join(base, 'outside', 'secret.txt'), 'secret\n');
      symlinkSync(join(base, 'outside'), join(fixturesRoot, 'demo', 'link'), 'junction');
      const stdout = recorder();
      const stderr = recorder();

      // Act
      const code = runDemoExcerpt(['demo', 'link/secret.txt:1-1'], { fixturesRoot, stdout, stderr });

      // Assert
      expect(stderr.text()).toBe('demo:excerpt: link/secret.txt is outside fixtures/demo\n');
      expect(stdout.text()).toBe('');
      expect(code).toBe(1);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('A file whose name starts with two dots is inside the project', () => {
    // Arrange: a temporary fixtures directory whose project holds a file named `..notes.txt`
    const fixturesRoot = mkdtempSync(join(tmpdir(), 'codemind-excerpt-'));
    try {
      mkdirSync(join(fixturesRoot, 'demo'));
      writeFileSync(join(fixturesRoot, 'demo', '..notes.txt'), 'first\nsecond\n');
      const stdout = recorder();
      const stderr = recorder();

      // Act
      const code = runDemoExcerpt(['demo', '..notes.txt:1-2'], { fixturesRoot, stdout, stderr });

      // Assert
      expect(stdout.text()).toBe('first\nsecond\n');
      expect(stderr.text()).toBe('');
      expect(code).toBe(0);
    } finally {
      rmSync(fixturesRoot, { recursive: true, force: true });
    }
  });
});
