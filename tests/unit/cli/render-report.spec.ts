import { describe, expect, it } from 'vitest';
import { INDEX_PHASES } from '@codemind/core';
import type { IndexReport } from '@codemind/core';
import { createLogger } from '../../../packages/cli/src/logger';
import { escapeLiteral, renderProgress, renderReport } from '../../../packages/cli/src/render-report';

// Spec: openspec/changes/cli-index-command/specs/cli-indexing/spec.md → "Untrusted strings are
// printed escaped". The `it` named after the scenario is that scenario; the rest are extra cases.

/** A report with every count set and no entries; tests override what they need. */
function report(overrides: Partial<IndexReport> = {}): IndexReport {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    indexedCommit: 'a'.repeat(40),
    framework: 'laravel',
    frameworkSource: 'detected',
    files: 3,
    filesDeleted: 0,
    symbols: 7,
    commits: 2,
    fileCommits: 4,
    edges: { total: 5, exact: 3, heuristic: 2 },
    events: [],
    commitEvents: [],
    diagnostics: [],
    skipped: [],
    ...overrides,
  };
}

describe('render-report', () => {
  it('Diagnostics and skipped paths are escaped', () => {
    // Arrange: an analyzer message with quotes and an ESC sequence; skipped paths with a newline and
    // a C1 control (U+009B, the one-byte CSI).
    const message = 'duplicate path "a\\"b\u001b[31m.php"; kept the first';
    const input = report({
      diagnostics: [{ path: 'a.php', message }],
      skipped: [
        { path: 'x\ny.php', reason: 'invalid-path' },
        { path: 'c\u009b2Jd.php', reason: 'invalid-path' },
      ],
    });

    // Act
    const text = renderReport(input);

    // Assert: no raw control character anywhere, and each untrusted string as an escaped literal.
    expect(text).not.toContain('\u001b');
    expect(text).not.toMatch(/[\u0080-\u009f]/);
    expect(text).toContain(JSON.stringify(message));
    expect(text).toContain('"x\\ny.php"');
    expect(text).toContain('"c\\u009b2Jd.php"');
    const controls = [...text].filter((c) => c !== '\n' && (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f));
    expect(controls).toEqual([]);
  });

  it('numbers the six phases from 1 to 6 in the order they run', () => {
    expect(INDEX_PHASES.map(renderProgress)).toEqual([
      '[1/6] confine',
      '[2/6] read',
      '[3/6] redact',
      '[4/6] analyze',
      '[5/6] history',
      '[6/6] save',
    ]);
  });

  it('shows every count of the report and whether the framework was detected or explicit', () => {
    const text = renderReport(
      report({
        framework: 'none',
        frameworkSource: 'explicit',
        events: [{ type: 'secret_redacted', file: 'a.php', line: 1, column: 1, rule: 'jwt' }],
        diagnostics: [{ path: 'b.php', message: 'parse error', line: 4 }, { path: 'c.php', message: 'dup' }],
      }),
    );

    expect(text).toBe(
      [
        'Indexed project 00000000-0000-4000-8000-000000000001',
        `  commit:      ${'a'.repeat(40)}`,
        '  framework:   none (explicit)',
        '  files:       3 (0 deleted)',
        '  symbols:     7',
        '  commits:     2',
        '  edges:       5 total / 3 exact / 2 heuristic',
        '  redactions:  1 in files, 0 in commit messages',
        '  skipped:     0',
        '  diagnostics: 2',
        '    "b.php":4 "parse error"',
        '    "c.php" "dup"',
        '',
      ].join('\n'),
    );
  });

  it('escapes DEL and leaves printable non-ASCII text as is', () => {
    expect(escapeLiteral('a\u007fb')).toBe('"a\\u007fb"');
    expect(escapeLiteral('cañón ')).toBe('"cañón "');
  });
});

describe('logger', () => {
  it('writes one JSON object per call, with its level, ending in a newline', () => {
    const chunks: string[] = [];
    const logger = createLogger({ write: (chunk: string) => chunks.push(chunk) });

    logger.info({ event: 'secret_redacted', file: 'a"b.php' });
    logger.error({ event: 'index_failed', code: 'INTERNAL', exit: 1 });

    expect(chunks).toEqual([
      '{"level":"info","event":"secret_redacted","file":"a\\"b.php"}\n',
      '{"level":"error","event":"index_failed","code":"INTERNAL","exit":1}\n',
    ]);
  });
});
