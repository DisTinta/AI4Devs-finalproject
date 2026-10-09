import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/seed-load-and-projects/specs/seed-build/spec.md → "Sample-project constant".
// The versioned constant passes the repository's lint and the web's type check with no exception for
// it (DIS-92 design D8). `npm run lint` and `npm run typecheck` check it again as gates.

/** ESLint with typescript-eslint and a TypeScript program are slow to start: well above 5 s. */
const CHECK_TIMEOUT_MS = 60_000;

const CONSTANT = resolve('packages/web/src/data/sample-projects.ts');
const WEB_TSCONFIG = resolve('packages/web/tsconfig.json');

/** The diagnostics of the web's compiler options for `file` alone. */
function typeDiagnostics(file: string): string[] {
  const config = ts.readConfigFile(WEB_TSCONFIG, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(WEB_TSCONFIG));
  const program = ts.createProgram([file], parsed.options);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

describe('sample-project constant', () => {
  it(
    'The generated constant passes lint and type checks',
    async () => {
      // Arrange
      const eslint = new ESLint({ cwd: resolve('.') });
      const text = readFileSync(CONSTANT, 'utf8');

      // Act
      const ignored = await eslint.isPathIgnored(CONSTANT);
      const [lint] = await eslint.lintFiles([CONSTANT]);
      const types = typeDiagnostics(CONSTANT);

      // Assert
      expect(ignored).toBe(false);
      expect(lint.messages).toEqual([]);
      expect(text).not.toMatch(/eslint-disable/);
      expect(types).toEqual([]);
    },
    CHECK_TIMEOUT_MS,
  );
});
