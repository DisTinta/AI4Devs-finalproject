import { beforeAll, describe, expect, it } from 'vitest';
import type { SymbolRef } from '@codemind/core';
import { buildBindingTable, collectBindings, concreteFor } from '../../../../../packages/analyzers/php/src/laravel/container';
import type { BindingTable, PlacedBindingFact } from '../../../../../packages/analyzers/php/src/laravel/container';
import { collectFacts, resolveClassName } from '../../../../../packages/analyzers/php/src/names';
import type { PhpFileFacts } from '../../../../../packages/analyzers/php/src/names';
import { loadPhpParser } from '../../../../../packages/analyzers/php/src/parser';
import type { PhpParser } from '../../../../../packages/analyzers/php/src/parser';

// Unit cases of the binding table of "Laravel heuristic calls" (design D2–D4 of
// openspec/changes/archive/2026-10-03-php-laravel-heuristics-1): not spec scenarios. The table is a lookup for facades
// only; the scenarios that observe it through edges live in heuristic-calls.spec.ts.

const X = '<?php namespace App\\Services; class X {} class Y {} interface I {}';
const PROVIDER_HEAD = '<?php namespace App\\Providers; use App\\Services\\{X, Y, I}; use Illuminate\\Support\\ServiceProvider;';

let parser: PhpParser;

beforeAll(async () => {
  parser = await loadPhpParser();
});

/**
 * The binding table of `files` (path → content), built the way the analyzer builds it: files with a
 * syntax error contribute nothing, and a concrete must resolve to exactly one class of the input.
 */
function tableOf(files: Record<string, string>): BindingTable {
  const allFacts: PhpFileFacts[] = [];
  const bindings: PlacedBindingFact[] = [];
  for (const [path, content] of Object.entries(files)) {
    const tree = parser.parse(content);
    try {
      if (tree.rootNode.hasError) continue;
      allFacts.push(collectFacts(path, tree.rootNode));
      bindings.push(...collectBindings(tree.rootNode).map((fact) => ({ ...fact, path })));
    } finally {
      tree.delete();
    }
  }
  const classes = new Map<string, SymbolRef[]>();
  for (const facts of allFacts) {
    for (const type of facts.types) {
      if (type.kind !== 'class' || type.trait) continue;
      const fqn = facts.namespace ? `${facts.namespace}\\${type.name}` : type.name;
      classes.set(fqn, [...(classes.get(fqn) ?? []), { file: facts.path, name: type.name, startLine: type.startLine }]);
    }
  }
  const classOf = (raw: string, facts: PhpFileFacts): SymbolRef | undefined => {
    const found = classes.get(resolveClassName(raw, facts));
    return found && found.length === 1 ? found[0] : undefined;
  };
  return buildBindingTable(bindings, new Map(allFacts.map((facts) => [facts.path, facts])), classOf);
}

/** The table of a provider `P extends <parent>` whose `register()` (or `method`) has `body`, next to `X`, `Y` and `I`. */
function providerTable(body: string, parent = 'ServiceProvider', method = 'register', members = ''): BindingTable {
  return tableOf({
    'app/Services/X.php': X,
    'app/Providers/P.php': `${PROVIDER_HEAD} class P extends ${parent} { ${members} public function ${method}(): void { ${body} } }`,
  });
}

const X_REF: SymbolRef = { file: 'app/Services/X.php', name: 'X', startLine: 1 };
const Y_REF: SymbolRef = { file: 'app/Services/X.php', name: 'Y', startLine: 1 };

describe('php analyzer binding table', () => {
  it('bind with a string key and X::class gives one entry', () => {
    expect([...providerTable("$this->app->bind('k', X::class);")]).toEqual([['k', [X_REF]]]);
  });

  it('singleton with an arrow function returning new X gives one entry', () => {
    expect([...providerTable('$this->app->singleton("k", fn ($app) => new X($app));')]).toEqual([['k', [X_REF]]]);
  });

  it('scoped with an X::class key and an anonymous function returning new X gives one entry under the FQN', () => {
    expect([...providerTable('$this->app->scoped(X::class, function () { return new X(); });')]).toEqual([['App\\Services\\X', [X_REF]]]);
  });

  it('the same concrete bound twice under one key stays one entry', () => {
    const table = providerTable("$this->app->bind('k', X::class); $this->app->singleton('k', fn () => new X());");
    expect(concreteFor(table, 'k')).toEqual(X_REF);
  });

  it('two providers binding a key to different classes leave it ambiguous', () => {
    const table = tableOf({
      'app/Services/X.php': X,
      'app/Providers/P.php': `${PROVIDER_HEAD} class P extends ServiceProvider { public function register(): void { $this->app->bind('k', X::class); } }`,
      'app/Providers/Q.php': `${PROVIDER_HEAD} class Q extends ServiceProvider { public function register(): void { $this->app->bind('k', Y::class); } }`,
    });
    expect(table.get('k')).toEqual([X_REF, Y_REF]);
    expect(concreteFor(table, 'k')).toBeUndefined();
    expect(concreteFor(table, 'missing')).toBeUndefined();
  });

  it('a class whose parent is not ServiceProvider adds nothing', () => {
    expect(providerTable("$this->app->bind('k', X::class);", 'Base').size).toBe(0);
  });

  it('a binding in boot() adds nothing', () => {
    expect(providerTable("$this->app->bind('k', X::class);", 'ServiceProvider', 'boot').size).toBe(0);
  });

  it('app()->bind, App::bind, a $bindings property and $this->app[...] add nothing', () => {
    const table = providerTable(
      "app()->bind('a', X::class); App::bind('b', X::class); $this->app['c'] = new X(); $this->container->bind('d', X::class);",
      'ServiceProvider',
      'register',
      "public $bindings = ['e' => X::class]; public $singletons = ['f' => X::class];",
    );
    expect(table.size).toBe(0);
  });

  it('a concrete that resolves to an interface, a vendor class or new self adds nothing', () => {
    expect(providerTable("$this->app->bind('a', I::class); $this->app->bind('b', \\Vendor\\Z::class); $this->app->bind('c', fn () => new self());").size).toBe(0);
  });

  it('an interpolated, escaped or empty string key adds nothing', () => {
    expect(providerTable('$this->app->bind("k{$x}", X::class); $this->app->bind(\'a\\\\b\', X::class); $this->app->bind(\'\', X::class);').size).toBe(0);
  });

  it('a closure with more than a single return, or a binding with named or extra arguments, adds nothing', () => {
    const table = providerTable(
      "$this->app->bind('a', function () { $x = 1; return new X(); }); $this->app->bind(abstract: 'b', concrete: X::class); $this->app->bind('c', X::class, true);",
    );
    expect(table.size).toBe(0);
  });

  it('bindings inside if and foreach of register() count', () => {
    const table = providerTable("if ($this->app->isLocal()) { $this->app->bind('a', X::class); } foreach ([1] as $i) { $this->app->singleton('b', Y::class); }");
    expect([...table]).toEqual([
      ['a', [X_REF]],
      ['b', [Y_REF]],
    ]);
  });

  it('the bindings of a provider class declared in a method body are never read', () => {
    const table = tableOf({
      'app/Services/X.php': X,
      'app/Providers/Outer.php': `${PROVIDER_HEAD} class Outer { public function make(): void { class P extends ServiceProvider { public function register(): void { $this->app->bind('k', X::class); } } } }`,
    });
    expect(table.size).toBe(0);
  });

  it('a binding nested in a closure of register() adds nothing', () => {
    expect(providerTable("$f = function () { $this->app->bind('k', X::class); };").size).toBe(0);
  });

  it('a provider file with a syntax error adds nothing', () => {
    const table = tableOf({
      'app/Services/X.php': X,
      'app/Providers/P.php': `${PROVIDER_HEAD} class P extends ServiceProvider { public function register(): void { $this->app->bind('k', X::class); } public function x( }`,
    });
    expect(table.size).toBe(0);
  });

  it('a file with two namespace declarations adds nothing', () => {
    const table = tableOf({
      'app/Services/X.php': X,
      'app/Providers/P.php': `${PROVIDER_HEAD} class P extends ServiceProvider { public function register(): void { $this->app->bind('k', X::class); } } namespace Other; class Q {}`,
    });
    expect(table.size).toBe(0);
  });
});
