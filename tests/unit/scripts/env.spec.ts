import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DOTENV_PATH, loadEnvFile, parseEnv } from '../../../scripts/env.mjs';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "The .env file
// grammar" and "Loading .env into a process" (DIS-102 design D2, D3, D12). Each test is one scenario,
// named after it. The files are temporary files of the OS temporary directory, never the real `.env`.

describe('The .env file grammar', () => {
  it('The .env grammar of .env.example is read', () => {
    // Arrange
    const text = [
      '# comment',
      '   # indented comment',
      '',
      'DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind',
      'PORT=',
      'LLM_MODEL=qwen2.5-coder # inline comment',
      'HOST = 127.0.0.1',
      'A="quoted # not a comment"',
      "B='single'  # after",
      'C=a#b',
      'D=${HOME}/x',
    ].join('\n');

    // Act
    const values = parseEnv(text);

    // Assert
    expect(values).toEqual({
      DATABASE_URL: 'postgresql://codemind:codemind@localhost:5432/codemind',
      PORT: '',
      LLM_MODEL: 'qwen2.5-coder',
      HOST: '127.0.0.1',
      A: 'quoted # not a comment',
      B: 'single',
      C: 'a#b',
      D: '${HOME}/x',
    });
  });

  it('Lines that do not match are ignored and the last assignment wins', () => {
    // Arrange
    const text = '\uFEFF' + ['not a line', '1BAD=x', 'export E=y', '=z', 'F="open', 'G=1', 'G=2'].join('\r\n') + '\r\n';

    // Act
    const values = parseEnv(text);

    // Assert
    expect(values).toEqual({ F: '"open', G: '2' });
  });

  it('A comment after an empty value leaves the value empty', () => {
    // Arrange
    const text = ['E= # set it here', 'H=\t# after a tab', 'I=#kept'].join('\n');

    // Act
    const values = parseEnv(text);

    // Assert
    expect(values).toEqual({ E: '', H: '', I: '#kept' });
  });
});

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

const directories: string[] = [];

/** A new temporary directory, removed after the test. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-env-'));
  directories.push(directory);
  return directory;
}

/** A temporary `.env` file holding `lines`, one per line. */
function temporaryEnvFile(lines: string[]): string {
  const path = join(temporaryDirectory(), '.env');
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Loading .env into a process', () => {
  it('Values of .env fill only the variables the environment lacks', () => {
    // Arrange
    const path = temporaryEnvFile(['DATABASE_URL=from-file', 'PORT=4000', 'LLM_MODEL=m']);
    const env: Record<string, string | undefined> = { DATABASE_URL: 'from-env', PORT: '' };
    const stderr = recorder();

    // Act
    loadEnvFile(path, env, stderr);

    // Assert
    expect(env).toEqual({ DATABASE_URL: 'from-env', PORT: '', LLM_MODEL: 'm' });
    expect(stderr.text()).toBe('');
  });

  it('Without .env the environment is unchanged', () => {
    // Arrange
    const path = join(temporaryDirectory(), '.env');
    const env: Record<string, string | undefined> = { DATABASE_URL: 'from-env' };
    const stderr = recorder();

    // Act
    loadEnvFile(path, env, stderr);

    // Assert
    expect(env).toEqual({ DATABASE_URL: 'from-env' });
    expect(stderr.text()).toBe('');
  });

  it('An unreadable .env is skipped with a warning', () => {
    // Arrange: a directory where the file should be
    const path = temporaryDirectory();
    const env: Record<string, string | undefined> = { DATABASE_URL: 'from-env' };
    const stderr = recorder();

    // Act
    loadEnvFile(path, env, stderr);

    // Assert
    expect(env).toEqual({ DATABASE_URL: 'from-env' });
    const lines = stderr.text().split('\n').filter((line) => line !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warning: \.env not read \(.+\)$/);
  });

  it("The loaded .env is the repository root's", () => {
    // Arrange: the repository root is the parent directory of scripts/
    const root = fileURLToPath(new URL('../../../', import.meta.url));

    // Act
    const path = DOTENV_PATH;

    // Assert
    expect(resolve(path)).toBe(resolve(root, '.env'));
    expect(existsSync(resolve(dirname(path), 'scripts', 'env.mjs'))).toBe(true);
  });

  it('The test suite never reads .env', () => {
    // Arrange
    const path = temporaryEnvFile(['DATABASE_URL=from-file']);
    const env: Record<string, string | undefined> = { CODEMIND_SKIP_DOTENV: '1' };
    const stderr = recorder();

    // Act
    loadEnvFile(path, env, stderr);

    // Assert
    expect(process.env.CODEMIND_SKIP_DOTENV).toBe('1');
    expect(env).toEqual({ CODEMIND_SKIP_DOTENV: '1' });
    expect(stderr.text()).toBe('');
  });
});
