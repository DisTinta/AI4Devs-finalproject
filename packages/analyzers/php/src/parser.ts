import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Language, Parser } from 'web-tree-sitter';
import type { Node, Tree } from 'web-tree-sitter';

/** Re-exported so the rest of the package never imports `web-tree-sitter` directly. */
export type { Node, Tree };

/** A loaded PHP grammar, ready to parse content. Only this module imports `web-tree-sitter`. */
export interface PhpParser {
  /** Parses `content` into a syntax tree. The caller owns the tree and must `delete()` it. */
  parse(content: string): Tree;
}

/**
 * Loads the PHP grammar (`tree-sitter-php.wasm`, the full grammar: PHP embedded in text) through
 * `web-tree-sitter`: `Parser.init()` then `Language.load()`. `createPhpAnalyzer` memoises the
 * returned promise per analyzer instance, so call this at most once per instance.
 */
export async function loadPhpParser(): Promise<PhpParser> {
  const require = createRequire(import.meta.url);
  const wasmPath = join(dirname(require.resolve('tree-sitter-php/package.json')), 'tree-sitter-php.wasm');
  await Parser.init();
  const language = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  return {
    parse(content: string): Tree {
      const tree = parser.parse(content);
      if (tree === null) throw new Error('web-tree-sitter: parse returned null (no language assigned)');
      return tree;
    },
  };
}
