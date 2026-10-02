import { describe, expect, it } from 'vitest';
import { countLines, describeFile, fileKindOf } from '@codemind/core';

// Spec: openspec/changes/analyzer-port-and-php-structure/specs/code-analysis/spec.md → "File
// classification". Each test is one scenario, named after it.

describe('file classification', () => {
  it('Paths are classified by the canonical rule', () => {
    expect(fileKindOf('tests/Unit/TaxServiceTest.php')).toBe('test');
    expect(fileKindOf('tests/unit/task.service.test.ts')).toBe('test');
    expect(fileKindOf('docs/api.md')).toBe('doc');
    expect(fileKindOf('tsconfig.json')).toBe('config');
    expect(fileKindOf('src/config/env.ts')).toBe('source');
    expect(fileKindOf('app/Services/TaxService.php')).toBe('source');
  });

  it('Line count of a file', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\r\nb')).toBe(2);
  });

  it('A described file has no contentHash or redacted', () => {
    const described = describeFile('app/Services/TaxService.php', 'a\nb\n');

    expect(described).toEqual({ path: 'app/Services/TaxService.php', kind: 'source', loc: 2 });
    expect(described).not.toHaveProperty('contentHash');
    expect(described).not.toHaveProperty('redacted');
  });
});

describe('file classification boundary cases', () => {
  it('classifies a __tests__ segment and a .spec. name as test', () => {
    expect(fileKindOf('a/__tests__/x.ts')).toBe('test');
    expect(fileKindOf('src/x.spec.ts')).toBe('test');
  });

  it('classifies a plain source file that merely mentions docs in its name', () => {
    expect(fileKindOf('src/docs.ts')).toBe('source');
  });

  it('classifies a dotfile and a .config. name as config', () => {
    expect(fileKindOf('.github/ci.yml')).toBe('config');
    expect(fileKindOf('vite.config.ts')).toBe('config');
  });

  it('matches doc before config when both could apply: first match wins', () => {
    expect(fileKindOf('docs/x.json')).toBe('doc');
  });
});

// Mutation testing (3.3) found these rules under-covered by the scenarios above: each case below is
// a real path (several from fixtures/acme-shop) isolating one clause of the canonical rule.
describe('file classification rule coverage', () => {
  it('classifies by the .md extension alone, with no docs segment', () => {
    expect(fileKindOf('README.md')).toBe('doc');
  });

  it('classifies config by the first segment alone, independent of extension', () => {
    expect(fileKindOf('config/app.php')).toBe('config');
  });

  it('classifies a dotfile as config even when its extension is not in the config list', () => {
    expect(fileKindOf('.env.example')).toBe('config');
  });

  it('classifies every listed config extension', () => {
    expect(fileKindOf('a.xml')).toBe('config');
    expect(fileKindOf('a.yaml')).toBe('config');
    expect(fileKindOf('a.toml')).toBe('config');
    expect(fileKindOf('a.ini')).toBe('config');
  });

  it('classifies the singular "test" and "tests" segments on their own, without a matching file name', () => {
    expect(fileKindOf('test/helpers.ts')).toBe('test');
    expect(fileKindOf('tests/helpers.ts')).toBe('test');
  });

  it('requires *Test.php to be a suffix, not merely a substring', () => {
    expect(fileKindOf('app/OrderControllerTest.php.orig')).toBe('source');
  });

  it('never lets a directory name leak into the file-name rules', () => {
    expect(fileKindOf('a.config.ts/real.ts')).toBe('source');
  });
});
