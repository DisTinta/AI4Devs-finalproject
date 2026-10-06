import { describe, expect, it } from 'vitest';
import { detectFramework } from '@codemind/core';
import type { ProjectFramework, SourceFile } from '@codemind/core';

// Spec: openspec/changes/index-repository/specs/repository-indexing/spec.md → "Framework detection by
// manifest". Each `it` named after a scenario is that scenario.

/** A root `composer.json` with the given content. */
function composer(content: unknown): SourceFile {
  return { path: 'composer.json', content: typeof content === 'string' ? content : JSON.stringify(content) };
}

/** A `package.json` at `path` (the root by default) with the given content. */
function packageJson(content: unknown, path = 'package.json'): SourceFile {
  return { path, content: typeof content === 'string' ? content : JSON.stringify(content) };
}

const PHP_FILE: SourceFile = { path: 'app/A.php', content: '<?php\n' };

describe('framework detection', () => {
  it('The framework is detected from the root manifest', () => {
    // Arrange
    const cases: Array<[string, SourceFile[], ProjectFramework]> = [
      ['laravel in require', [composer({ require: { 'laravel/framework': '^11.0' } }), PHP_FILE], 'laravel'],
      ['laravel in require-dev', [composer({ 'require-dev': { 'laravel/framework': '^11.0' } })], 'laravel'],
      ['fastify in dependencies', [packageJson({ dependencies: { fastify: '^4.26.0' } })], 'fastify'],
      ['fastify in devDependencies', [packageJson({ devDependencies: { fastify: '^4.26.0' } })], 'fastify'],
      [
        'both manifests',
        [packageJson({ dependencies: { fastify: '^4.26.0' } }), composer({ require: { 'laravel/framework': '^11.0' } })],
        'laravel',
      ],
      ['no manifest', [PHP_FILE], 'none'],
      ['composer.json without Laravel', [composer({ require: { 'symfony/console': '^7.0' } })], 'none'],
      ['composer.json not valid JSON', [composer('{ "require": { "laravel/framework": ')], 'none'],
      ['composer.json with an array require', [composer({ require: ['laravel/framework'] })], 'none'],
      ['package.json outside the root', [packageJson({ dependencies: { fastify: '^4.26.0' } }, 'packages/x/package.json')], 'none'],
    ];

    for (const [name, files, expected] of cases) {
      // Act
      const detect = () => detectFramework(files);

      // Assert
      expect(detect, name).not.toThrow();
      expect(detect(), name).toBe(expected);
    }
  });

  describe('extra cases', () => {
    it('declares nothing when the field is null, the name is a value, the field is peerDependencies or the manifest is a string', () => {
      // Arrange
      const cases: Array<[string, SourceFile[]]> = [
        ['require null', [composer({ require: null })]],
        ['laravel/framework as a value', [composer({ require: { framework: 'laravel/framework' } })]],
        ['fastify only in peerDependencies', [packageJson({ peerDependencies: { fastify: '^4.26.0' } })]],
        ['composer.json is a JSON string', [composer(JSON.stringify('laravel/framework'))]],
        ['composer.json is a JSON array', [composer([{ require: { 'laravel/framework': '^11.0' } }])]],
        ['inherited key', [composer('{ "require": { "toString": "x" } }'), packageJson({ dependencies: { constructor: '1' } })]],
      ];

      for (const [name, files] of cases) {
        // Act / Assert
        expect(detectFramework(files), name).toBe('none');
      }
    });

    it('falls back to package.json when composer.json declares no Laravel', () => {
      // Arrange
      const files = [composer({ require: { 'symfony/console': '^7.0' } }), packageJson({ dependencies: { fastify: '^4.26.0' } })];

      // Act / Assert
      expect(detectFramework(files)).toBe('fastify');
    });
  });
});
