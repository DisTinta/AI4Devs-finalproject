import type { GraphSymbol, SymbolKind } from '@codemind/core';
import type * as TS from 'typescript';
import type { TypeScriptModule } from './program.js';

/** Collapses every run of whitespace to one space and trims. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Whether the walk of {@link extractSymbols} does not enter `node`: a declaration with the `declare`
 * modifier, or a `declare module` / `declare global` / `namespace` / `module` block (design D4).
 */
export function isSkippedDeclaration(ts: TypeScriptModule, node: TS.Node): boolean {
  if (ts.isModuleDeclaration(node)) return true;
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
}

/**
 * The symbols of one TypeScript file parsed without a syntax error, in tree-walk order (DIS-30, design
 * D4): classes with a name, interfaces, function declarations with a body (at any depth), methods and
 * constructors of classes, method signatures of interfaces. Variables, types, enums, accessors,
 * properties, `declare` declarations and `declare module` / `declare global` / `namespace` blocks
 * yield none.
 *
 * Spans are 1-based lines from `getStart` (decorators and modifiers included, JSDoc excluded) to the
 * end of the declaration. A signature is the text from that start to the opening `{` of the body, or
 * to the end without its `;` / `,` when there is no body, whitespace collapsed.
 *
 * @param ts The compiler namespace.
 * @param path Repository-relative path of `sourceFile`.
 * @param sourceFile The parsed file, with parent pointers.
 */
export function extractSymbols(ts: TypeScriptModule, path: string, sourceFile: TS.SourceFile): GraphSymbol[] {
  const found: GraphSymbol[] = [];

  const hasModifier = (node: TS.Node, kind: TS.SyntaxKind): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

  const lineOf = (position: number): number => sourceFile.getLineAndCharacterOfPosition(position).line + 1;

  const add = (kind: SymbolKind, name: string, node: TS.Node, signatureEnd: number): void => {
    const start = node.getStart(sourceFile);
    found.push({
      file: path,
      kind,
      name,
      startLine: lineOf(start),
      endLine: lineOf(node.getEnd()),
      signature: collapse(sourceFile.text.slice(start, signatureEnd)),
    });
  };

  /** The start of the `{` that opens the member list of a class or an interface. */
  const membersBrace = (node: TS.Node): number => {
    const brace = node.getChildren(sourceFile).find((child) => child.kind === ts.SyntaxKind.OpenBraceToken);
    return brace ? brace.getStart(sourceFile) : node.getEnd();
  };

  /** The end of a declaration without a body: its text without a final `;` or `,`. */
  const withoutTerminator = (node: TS.Node): number => {
    const start = node.getStart(sourceFile);
    const text = sourceFile.text.slice(start, node.getEnd());
    return start + text.replace(/[;,]\s*$/, '').length;
  };

  /** A member name written as an identifier or a private identifier, else `undefined`. */
  const memberName = (name: TS.PropertyName | undefined): string | undefined =>
    name && (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) ? name.text : undefined;

  const walk = (node: TS.Node): void => {
    if (isSkippedDeclaration(ts, node)) return;

    if (ts.isClassDeclaration(node) && node.name) {
      add('class', node.name.text, node, membersBrace(node));
    } else if (ts.isInterfaceDeclaration(node)) {
      add('interface', node.name.text, node, membersBrace(node));
      for (const member of node.members) {
        const name = ts.isMethodSignature(member) ? memberName(member.name) : undefined;
        if (name !== undefined) add('method', `${node.name.text}::${name}`, member, withoutTerminator(member));
      }
    } else if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      add('function', node.name.text, node, node.body.getStart(sourceFile));
    } else if (ts.isMethodDeclaration(node) && ts.isClassLike(node.parent)) {
      const name = memberName(node.name);
      if (name !== undefined && (node.body || hasModifier(node, ts.SyntaxKind.AbstractKeyword))) {
        const owner = ts.isClassDeclaration(node.parent) && node.parent.name ? `${node.parent.name.text}::` : '';
        add('method', `${owner}${name}`, node, node.body ? node.body.getStart(sourceFile) : withoutTerminator(node));
      }
    } else if (ts.isConstructorDeclaration(node) && node.body && ts.isClassLike(node.parent)) {
      const owner = ts.isClassDeclaration(node.parent) && node.parent.name ? `${node.parent.name.text}::` : '';
      add('method', `${owner}constructor`, node, node.body.getStart(sourceFile));
    }

    ts.forEachChild(node, walk);
  };

  walk(sourceFile);
  return found;
}
