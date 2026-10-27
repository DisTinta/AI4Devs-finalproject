import type { GraphEdge, SymbolRef } from '@codemind/core';
import type * as TS from 'typescript';
import { TS_COMPILER_EXTRACTOR, type ParsedFile, type SymbolOf } from './edges.js';
import type { InMemoryProgram, TypeScriptModule } from './program.js';
import { isSkippedDeclaration } from './symbols.js';

/**
 * The `calls` edges of the TypeScript files of one call (DIS-31, design D1): from a `function` or
 * `method` symbol to a `function` or `method` symbol, always `exact`, resolved by the compiler's
 * `TypeChecker` and never guessed. One walk per parsed file carries the source of the call site
 * (design D3); call and `new` expressions are resolved with `getResolvedSignature` (design D4), and an
 * identifier or property access passed directly as an argument is a reference to its declaration.
 * Targets count only when `symbolOf` has them, which excludes anything outside the input, in a file
 * with a syntax error, dropped as a duplicate, or that is not a function or method symbol.
 *
 * @param ts The compiler namespace.
 * @param built The program of the call and the host that serves it.
 * @param parsed The TypeScript files without a syntax error, in path order.
 * @param symbolOf Declaration node → emitted symbol (design D2).
 * @returns The edges, possibly with duplicates (the caller deduplicates and sorts them).
 */
export function buildTypeScriptCalls(
  ts: TypeScriptModule,
  built: InMemoryProgram,
  parsed: ParsedFile[],
  symbolOf: SymbolOf,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  let checker: TS.TypeChecker | undefined;
  const getChecker = (): TS.TypeChecker => (checker ??= built.program.getTypeChecker());

  /** The symbol of a name, import aliases followed. */
  const resolveSymbol = (node: TS.Node): TS.Symbol | undefined => {
    const typeChecker = getChecker();
    let found = typeChecker.getSymbolAtLocation(node);
    while (found && found.flags & ts.SymbolFlags.Alias) {
      const next = typeChecker.getAliasedSymbol(found);
      if (next === found) break;
      found = next;
    }
    return found;
  };

  /** Whether a declaration can be a `function` or `method` symbol (functions, methods, constructors, signatures). */
  const isCallable = (node: TS.Node): boolean =>
    ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isMethodSignature(node);

  const isAbstract = (node: TS.Node): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword);

  /**
   * An overload signature (a function, method or constructor declaration without a body whose symbol
   * has one with a body) maps to the declaration with a body; anything else is its own target (design D4).
   */
  const implementationOf = (declaration: TS.Declaration): TS.Declaration => {
    if (ts.isConstructorDeclaration(declaration)) {
      if (declaration.body) return declaration;
      const withBody = declaration.parent.members.find((member) => ts.isConstructorDeclaration(member) && member.body);
      return withBody ?? declaration;
    }
    if ((ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) && !declaration.body && !isAbstract(declaration)) {
      const name = declaration.name;
      const siblings = name ? getChecker().getSymbolAtLocation(name)?.declarations : undefined;
      const withBody = siblings?.find((other) => other.kind === declaration.kind && (other as TS.FunctionDeclaration | TS.MethodDeclaration).body);
      return withBody ?? declaration;
    }
    return declaration;
  };

  const targetOfDeclaration = (declaration: TS.Node | undefined): SymbolRef | undefined =>
    declaration && isCallable(declaration) ? symbolOf.get(declaration) : undefined;

  /** The class declaration a `new` or `extends` expression names (an identifier or a property access), else `undefined`. */
  const classDeclarationOf = (expression: TS.Node): TS.ClassDeclaration | undefined => {
    if (!ts.isIdentifier(expression) && !ts.isPropertyAccessExpression(expression)) return undefined;
    const declaration = resolveSymbol(ts.isPropertyAccessExpression(expression) ? expression.name : expression)?.declarations?.find(ts.isClassDeclaration);
    return declaration;
  };

  /** The owner of a member declaration, grouped by class or interface symbol so merged interfaces count once. */
  const ownerKey = (declaration: TS.Declaration): TS.Node | TS.Symbol => {
    const parent = declaration.parent;
    if ((ts.isClassLike(parent) || ts.isInterfaceDeclaration(parent)) && parent.name) {
      return getChecker().getSymbolAtLocation(parent.name) ?? parent;
    }
    return parent;
  };

  /** The target of a `new X(...)` or `super(...)`: a constructor declared in `owner` itself (design D4, E3, P2). */
  const constructorTarget = (node: TS.CallExpression | TS.NewExpression, owner: TS.ClassDeclaration | undefined): SymbolRef | undefined => {
    if (!owner) return undefined;
    const declaration = getChecker().getResolvedSignature(node)?.declaration;
    if (!declaration || !ts.isConstructorDeclaration(declaration)) return undefined;
    const implementation = implementationOf(declaration);
    return implementation.parent === owner ? targetOfDeclaration(implementation) : undefined;
  };

  /** The target of a call expression through its resolved signature (design D4, SA3, SA11). */
  const callTarget = (node: TS.CallExpression): SymbolRef | undefined => {
    const declaration = getChecker().getResolvedSignature(node)?.declaration;
    if (!declaration) return undefined;
    const callee = node.expression;
    if (!ts.isIdentifier(callee) && !ts.isPropertyAccessExpression(callee)) return undefined;
    const declared = resolveSymbol(ts.isPropertyAccessExpression(callee) ? callee.name : callee)?.declarations;
    if (!declared?.includes(declaration)) return undefined;
    if (ts.isPropertyAccessExpression(callee) && new Set(declared.map(ownerKey)).size > 1) return undefined;
    return targetOfDeclaration(implementationOf(declaration));
  };

  /** The target of an identifier or property access passed as an argument (design D4, E5, P4). */
  const referenceTarget = (argument: TS.Expression): SymbolRef | undefined => {
    if (!ts.isIdentifier(argument) && !ts.isPropertyAccessExpression(argument)) return undefined;
    const declared = resolveSymbol(ts.isPropertyAccessExpression(argument) ? argument.name : argument)?.declarations ?? [];
    const candidates = declared.filter((declaration) => targetOfDeclaration(declaration) !== undefined);
    return candidates.length === 1 ? targetOfDeclaration(candidates[0]) : undefined;
  };

  for (const { sourceFile } of parsed) {
    const walk = (node: TS.Node, source: SymbolRef | undefined): void => {
      if (isSkippedDeclaration(ts, node) || ts.isDecorator(node)) return;

      // Boundaries (design D3): the source is the symbol of the declaration, or none when it is not one.
      const boundary =
        ts.isFunctionDeclaration(node) ||
        ((ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && ts.isClassLike(node.parent)) ||
        ts.isConstructorDeclaration(node) ||
        (ts.isPropertyDeclaration(node) && ts.isClassLike(node.parent)) ||
        ts.isClassStaticBlockDeclaration(node);
      const current = boundary ? symbolOf.get(node) : source;

      if (current && (ts.isCallExpression(node) || ts.isNewExpression(node))) {
        let target: SymbolRef | undefined;
        if (ts.isNewExpression(node)) {
          target = constructorTarget(node, classDeclarationOf(node.expression));
        } else if (node.expression.kind === ts.SyntaxKind.SuperKeyword) {
          const owner = ts.findAncestor(node, ts.isClassLike);
          const base = owner?.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
          target = constructorTarget(node, base ? classDeclarationOf(base) : undefined);
        } else {
          target = callTarget(node);
        }
        if (target) edges.push(edge(current, target));
        for (const argument of node.arguments ?? []) {
          const reference = referenceTarget(argument);
          if (reference) edges.push(edge(current, reference));
        }
      }

      ts.forEachChild(node, (child) => walk(child, current));
    };
    walk(sourceFile, undefined);
  }

  return edges;
}

function edge(source: SymbolRef, target: SymbolRef): GraphEdge {
  return { source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'exact', extractor: TS_COMPILER_EXTRACTOR };
}
