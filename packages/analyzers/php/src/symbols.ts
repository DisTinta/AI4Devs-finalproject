import type { GraphSymbol } from '@codemind/core';
import type { Node } from './parser.js';

/** 1-based start/end lines of `node`'s span (design D5: node rows + 1). */
function spanOf(node: Node): { startLine: number; endLine: number } {
  return { startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
}

/**
 * The node's declared signature: its source from the start to the start of its `body` field (or its
 * end minus a trailing `;` when it has none), every run of whitespace collapsed to one space and
 * trimmed.
 */
function signatureOf(node: Node): string {
  const body = node.childForFieldName('body');
  const text = node.text;
  const cut = body ? body.startIndex - node.startIndex : text.endsWith(';') ? text.length - 1 : text.length;
  return text.slice(0, cut).replace(/\s+/g, ' ').trim();
}

/**
 * Walks the syntax tree rooted at `root` (a parsed file's `rootNode`) and returns every symbol it
 * declares. Implemented incrementally in section 5: classes and methods so far; interfaces,
 * functions, traits (as `class`) and anonymous classes follow.
 */
export function extractSymbols(path: string, root: Node): GraphSymbol[] {
  const symbols: GraphSymbol[] = [];

  const walk = (node: Node, enclosing: string | undefined): void => {
    if (node.type === 'enum_declaration') return; // skipped with its subtree (spec: no kind to encode it)

    let nextEnclosing = enclosing;
    if (node.type === 'class_declaration' || node.type === 'interface_declaration' || node.type === 'trait_declaration') {
      const name = node.childForFieldName('name')?.text;
      // A trait is encoded as a `class` symbol (design D2): no `trait` kind in the schema, and its
      // `signature` already starts with `trait` (the node's own header), so the encoding is lossless.
      const kind = node.type === 'interface_declaration' ? 'interface' : 'class';
      if (name) {
        symbols.push({ file: path, name, kind, signature: signatureOf(node), ...spanOf(node) });
        nextEnclosing = name;
      }
    } else if (node.type === 'method_declaration') {
      const shortName = node.childForFieldName('name')?.text;
      if (shortName) {
        const name = enclosing ? `${enclosing}::${shortName}` : shortName;
        symbols.push({ file: path, name, kind: 'method', signature: signatureOf(node), ...spanOf(node) });
      }
    } else if (node.type === 'function_definition') {
      const shortName = node.childForFieldName('name')?.text;
      if (shortName) {
        symbols.push({ file: path, name: shortName, kind: 'function', signature: signatureOf(node), ...spanOf(node) });
      }
    }
    for (const child of node.children) walk(child, nextEnclosing);
  };

  walk(root, undefined);
  return symbols;
}
