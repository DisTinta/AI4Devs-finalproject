import { describe, expect, it } from 'vitest';
import type { AnalysisResult, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';
import { studly } from '../../../../../packages/analyzers/php/src/laravel/eloquent';

// Spec: openspec/specs/code-analysis/spec.md → "Laravel heuristic calls", rule 6 (Eloquent
// attributes; change openspec/changes/archive/2026-10-04-php-laravel-heuristics-2b). The acme-shop scenario is in
// heuristic-calls.spec.ts. Each `it` named after a scenario is that scenario; the others are extra
// cases of the same rule. No test reads or writes `fixtures/acme-shop` here (PH-22).

const EXTRACTOR = 'php-treesitter-laravel';

/** One inline `SourceFile`. */
function file(path: string, content: string): SourceFile {
  return { path, content };
}

/** The `SymbolRef` of the symbol `name` declared in `path` of `result`; throws when it is missing. */
function symbolOf(result: AnalysisResult, path: string, name: string): SymbolRef {
  const symbol = result.symbols.find((s) => s.file === path && s.name === name);
  if (!symbol) throw new Error(`symbol not found: ${path} ${name}`);
  return { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
}

/** The `calls` edges whose source is the symbol `name` of `path`, which must exist (so a syntax error never passes as "no edge"). */
function callsFrom(result: AnalysisResult, path: string, name: string): GraphEdge[] {
  symbolOf(result, path, name);
  return result.edges.filter((e) => e.kind === 'calls' && 'symbol' in e.source && e.source.symbol?.file === path && e.source.symbol.name === name);
}

/** The `calls` edge, `heuristic`, from `source` to `target`. */
function heuristicCall(source: SymbolRef, target: SymbolRef): GraphEdge {
  return { source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'heuristic', extractor: EXTRACTOR };
}

const POST = file(
  'app/Models/Post.php',
  '<?php namespace App\\Models; use Illuminate\\Database\\Eloquent\\Model; class Post extends Model { public function author() {} public function getTitleUpperAttribute() {} }',
);
const PLAIN = file('app/Plain.php', '<?php namespace App; class Plain { public function author() {} }');

describe('php analyzer Eloquent attribute reads', () => {
  const analyzer = createPhpAnalyzer();

  it('Eloquent reads reach accessors and relations, never columns or writes', async () => {
    const reader = file(
      'app/Reader.php',
      '<?php namespace App; use App\\Models\\Post; class Reader { public function run(Post $p, Plain $q, ?Post $n): void { $p->title_upper; $p->author->name; $p->body; $p->author = 1; $q->author; $n->author; $p?->author; $p->author(); } }',
    );
    const result = await analyzer.analyze({ files: [POST, PLAIN, reader] });
    const run = symbolOf(result, 'app/Reader.php', 'Reader::run');

    expect(callsFrom(result, 'app/Reader.php', 'Reader::run')).toEqual([
      heuristicCall(run, symbolOf(result, 'app/Models/Post.php', 'Post::author')),
      heuristicCall(run, symbolOf(result, 'app/Models/Post.php', 'Post::getTitleUpperAttribute')),
    ]);
  });

  it('Writes never read an Eloquent attribute; isset and indirect modification do', async () => {
    const box = file(
      'app/Models/Box.php',
      '<?php namespace App\\Models; use Illuminate\\Database\\Eloquent\\Model; class Box extends Model { public function inc() {} public function dec() {} public function preinc() {} public function predec() {} public function gone() {} public function pair() {} public function listed() {} public function each() {} public function keyed() {} public function checked() {} public function pushed() {} }',
    );
    const packer = file(
      'app/Packer.php',
      '<?php namespace App; use App\\Models\\Box; class Packer { public function run(Box $b, array $xs): void { $b->inc++; $b->dec--; ++$b->preinc; --$b->predec; unset($b->gone); [$b->pair] = $xs; list($b->listed) = $xs; foreach ($xs as $b->each) {} foreach ($xs as $k => $b->keyed) {} isset($b->checked); $b->pushed[] = 1; } }',
    );
    const result = await analyzer.analyze({ files: [box, packer] });
    const run = symbolOf(result, 'app/Packer.php', 'Packer::run');

    expect(callsFrom(result, 'app/Packer.php', 'Packer::run')).toEqual([
      heuristicCall(run, symbolOf(result, 'app/Models/Box.php', 'Box::checked')),
      heuristicCall(run, symbolOf(result, 'app/Models/Box.php', 'Box::pushed')),
    ]);
  });

  it('a destructuring key and the iterated expression of a foreach are reads', async () => {
    const box = file(
      'app/Models/Box.php',
      '<?php namespace App\\Models; use Illuminate\\Database\\Eloquent\\Model; class Box extends Model { public function slot() {} public function items() {} }',
    );
    const packer = file(
      'app/Packer.php',
      '<?php namespace App; use App\\Models\\Box; class Packer { public function run(Box $b, array $xs): void { [$b->slot => $x] = $xs; foreach ($b->items as $item) {} } }',
    );
    const result = await analyzer.analyze({ files: [box, packer] });
    const run = symbolOf(result, 'app/Packer.php', 'Packer::run');

    expect(callsFrom(result, 'app/Packer.php', 'Packer::run')).toEqual([
      heuristicCall(run, symbolOf(result, 'app/Models/Box.php', 'Box::items')),
      heuristicCall(run, symbolOf(result, 'app/Models/Box.php', 'Box::slot')),
    ]);
  });

  it('a read whose target is the caller method itself yields no edge', async () => {
    const order = file(
      'app/Models/Order.php',
      '<?php namespace App\\Models; use Illuminate\\Database\\Eloquent\\Model; class Order extends Model { public function status() { return $this->status; } public function lines() {} public function count(): int { return $this->lines->count(); } }',
    );
    const result = await analyzer.analyze({ files: [order] });

    expect(callsFrom(result, 'app/Models/Order.php', 'Order::status')).toEqual([]);
    // A read of another method of the same model still counts.
    expect(callsFrom(result, 'app/Models/Order.php', 'Order::count')).toEqual([
      heuristicCall(symbolOf(result, 'app/Models/Order.php', 'Order::count'), symbolOf(result, 'app/Models/Order.php', 'Order::lines')),
    ]);
  });

  it('a typed property of a model type is a receiver ($this->p->a)', async () => {
    const holder = file(
      'app/Holder.php',
      '<?php namespace App; use App\\Models\\Post; class Holder { private Post $post; public function run(): void { $this->post->title_upper; } }',
    );
    const result = await analyzer.analyze({ files: [POST, holder] });

    expect(callsFrom(result, 'app/Holder.php', 'Holder::run')).toEqual([
      heuristicCall(symbolOf(result, 'app/Holder.php', 'Holder::run'), symbolOf(result, 'app/Models/Post.php', 'Post::getTitleUpperAttribute')),
    ]);
  });

  it('$this in a class that is no model reads nothing', async () => {
    const plain = file('app/Plain.php', '<?php namespace App; class Plain { public function author() {} public function run(): void { $this->author; } }');
    const result = await analyzer.analyze({ files: [plain] });

    expect(callsFrom(result, 'app/Plain.php', 'Plain::run')).toEqual([]);
  });

  it('a model that does not extend Model directly is no model', async () => {
    const files = [
      file('app/Models/Base.php', '<?php namespace App\\Models; use Illuminate\\Database\\Eloquent\\Model; class Base extends Model {}'),
      file('app/Models/Child.php', '<?php namespace App\\Models; class Child extends Base { public function author() {} }'),
      file('app/Reader.php', '<?php namespace App; use App\\Models\\Child; class Reader { public function run(Child $c): void { $c->author; } }'),
    ];
    const result = await analyzer.analyze({ files });

    expect(callsFrom(result, 'app/Reader.php', 'Reader::run')).toEqual([]);
  });

  it('the accessor wins over a method with the attribute name', async () => {
    const both = file(
      'app/Models/Both.php',
      '<?php namespace App\\Models; use Illuminate\\Database\\Eloquent\\Model; class Both extends Model { public function title() {} public function getTitleAttribute() {} public function run(): void { $this->title; } }',
    );
    const result = await analyzer.analyze({ files: [both] });

    expect(callsFrom(result, 'app/Models/Both.php', 'Both::run')).toEqual([
      heuristicCall(symbolOf(result, 'app/Models/Both.php', 'Both::run'), symbolOf(result, 'app/Models/Both.php', 'Both::getTitleAttribute')),
    ]);
  });

  it('compound and reference assignments, variable and computed names read nothing', async () => {
    const reader = file(
      'app/Reader.php',
      "<?php namespace App; use App\\Models\\Post; class Reader { public function run(Post $p, string $a, $v): void { $p->author += 1; $p->author ??= 1; $p->author =& $v; $p->$a; $p->{'author'}; } }",
    );
    const result = await analyzer.analyze({ files: [POST, reader] });

    expect(callsFrom(result, 'app/Reader.php', 'Reader::run')).toEqual([]);
  });

  it('a plain assignment target and a nullsafe access read nothing, each alone', async () => {
    // Alone, unlike the scenario, where both share their target with `$p->author->name` (review §13).
    const reader = file(
      'app/Reader.php',
      '<?php namespace App; use App\\Models\\Post; class Reader { public function write(Post $p): void { $p->author = 1; } public function nullsafe(Post $p): void { $p?->author; } }',
    );
    const result = await analyzer.analyze({ files: [POST, reader] });

    expect(callsFrom(result, 'app/Reader.php', 'Reader::write')).toEqual([]);
    expect(callsFrom(result, 'app/Reader.php', 'Reader::nullsafe')).toEqual([]);
  });

  it('a nullable, null-default or variadic parameter is no receiver', async () => {
    // Alone, unlike the scenario, where `$n->author` shares its target with `$p->author->name`.
    const reader = file(
      'app/Reader.php',
      '<?php namespace App; use App\\Models\\Post; class Reader { public function run(?Post $n, Post $p = null, Post ...$ps): void { $n->author; $p->author; $ps->author; } }',
    );
    const result = await analyzer.analyze({ files: [POST, reader] });

    expect(callsFrom(result, 'app/Reader.php', 'Reader::run')).toEqual([]);
  });

  it('reads inside an arrow function or a closure belong to no method', async () => {
    const reader = file(
      'app/Reader.php',
      '<?php namespace App; use App\\Models\\Post; class Reader { public function run(Post $p): void { $f = fn () => $p->author; $g = function () use ($p) { return $p->title_upper; }; } }',
    );
    const result = await analyzer.analyze({ files: [POST, reader] });

    expect(callsFrom(result, 'app/Reader.php', 'Reader::run')).toEqual([]);
  });

  it('a read and an exact call to the same target yield the exact edge only', async () => {
    const holder = file(
      'app/Holder.php',
      '<?php namespace App; use App\\Models\\Post; class Holder { private Post $post; public function run(): void { $this->post->author(); $this->post->author; } }',
    );
    const result = await analyzer.analyze({ files: [POST, holder] });

    expect(callsFrom(result, 'app/Holder.php', 'Holder::run')).toEqual([
      { ...heuristicCall(symbolOf(result, 'app/Holder.php', 'Holder::run'), symbolOf(result, 'app/Models/Post.php', 'Post::author')), resolution: 'exact' },
    ]);
  });

  it('a file with two namespace declarations reads nothing', async () => {
    const reader = file(
      'app/Reader.php',
      '<?php namespace Other; class X {} namespace App; use App\\Models\\Post; class Reader { public function run(Post $p): void { $p->author; } }',
    );
    const result = await analyzer.analyze({ files: [POST, reader] });

    expect(callsFrom(result, 'app/Reader.php', 'Reader::run')).toEqual([]);
  });

  it('Studly splits at _ and - and drops empty parts', () => {
    expect(studly('coupon_code')).toBe('CouponCode');
    expect(studly('subtotal')).toBe('Subtotal');
    expect(studly('a_b-c')).toBe('ABC');
    expect(studly('_x')).toBe('X');
  });
});
