import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisResult, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createPhpAnalyzer } from '../../../../../packages/analyzers/php/src/index';
import { buildListenerMap, collectListeners, listenersFor } from '../../../../../packages/analyzers/php/src/laravel/events';
import type { PlacedListenFact } from '../../../../../packages/analyzers/php/src/laravel/events';
import { collectFacts, resolveClassName } from '../../../../../packages/analyzers/php/src/names';
import type { PhpFileFacts } from '../../../../../packages/analyzers/php/src/names';
import { loadPhpParser } from '../../../../../packages/analyzers/php/src/parser';
import type { PhpParser } from '../../../../../packages/analyzers/php/src/parser';

// Spec: openspec/changes/php-laravel-heuristics-2a/specs/code-analysis/spec.md → "Laravel heuristic
// calls", rules 4 (job dispatch) and 5 (event dispatch). Each `it` named after a scenario is that
// scenario; the others are extra cases of the same rules. The acme-shop sites are asserted in
// heuristic-calls.spec.ts. No test writes to `fixtures/` (PH-22).

const EXTRACTOR = 'php-treesitter-laravel';

/** One inline `SourceFile`, for edge cases the fixture does not exercise. */
function file(path: string, content: string): SourceFile {
  return { path, content };
}

/** The `SymbolRef` of the symbol `name` declared in `path` of `result`. */
function symbolOf(result: AnalysisResult, path: string, name: string): SymbolRef {
  const symbol = result.symbols.find((s) => s.file === path && s.name === name);
  if (!symbol) throw new Error(`symbol not found: ${path} ${name}`);
  return { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
}

/** The `calls` edges whose source is the symbol `name` of `path`. */
function callsFrom(result: AnalysisResult, path: string, name: string): GraphEdge[] {
  return result.edges.filter((e) => e.kind === 'calls' && 'symbol' in e.source && e.source.symbol?.file === path && e.source.symbol.name === name);
}

/** The `calls` edge, `heuristic`, from `source` to `target`. */
function heuristicCall(source: SymbolRef, target: SymbolRef): GraphEdge {
  return { source: { symbol: source }, target: { symbol: target }, kind: 'calls', resolution: 'heuristic', extractor: EXTRACTOR };
}

/** `[resolution, target name]` of each edge, for compact assertions. */
const targets = (edges: GraphEdge[]): [string, string | undefined][] =>
  edges.map((e) => [e.resolution, 'symbol' in e.target ? e.target.symbol?.name : undefined]);

const DISPATCHABLE = 'use Illuminate\\Foundation\\Bus\\Dispatchable;';
const PAID = file('app/Events/Paid.php', '<?php namespace App\\Events; class Paid {}');
const REFUNDED = file('app/Events/Refunded.php', '<?php namespace App\\Events; class Refunded {}');
const NOTIFY = file('app/Listeners/Notify.php', '<?php namespace App\\Listeners; class Notify { public function handle(): void {} }');
const EVENT_PROVIDER = file(
  'app/Providers/EventProvider.php',
  '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Notify; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; }',
);
const SYNC = file('app/Jobs/Sync.php', `<?php namespace App\\Jobs; ${DISPATCHABLE} class Sync { use Dispatchable; }`);
const WORK = file('app/Jobs/Work.php', `<?php namespace App\\Jobs; ${DISPATCHABLE} class Work { use Dispatchable; public function handle(): void {} }`);
const GHOST = file(
  'app/Facades/Ghost.php',
  "<?php namespace App\\Facades; use Illuminate\\Support\\Facades\\Facade; class Ghost extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } }",
);

describe('listener map (unit cases, not spec scenarios)', () => {
  let parser: PhpParser;

  beforeAll(async () => {
    parser = await loadPhpParser();
  });

  const EVENTS = '<?php namespace App\\Events; class E {}';
  const LISTENERS = '<?php namespace App\\Listeners; class L1 {} class L2 {} interface I {}';
  const HEAD = '<?php namespace App\\Providers; use App\\Events\\E; use App\\Listeners\\{L1, L2, I}; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider;';

  /**
   * The listener class names of `App\Events\E` in the listener map of `providers` (path → content),
   * next to the event and listener classes, built the way the analyzer builds it: files with a syntax
   * error contribute nothing, and classes must resolve to exactly one class of the input.
   */
  function listenersOfE(providers: Record<string, string>): string[] {
    const allFacts: PhpFileFacts[] = [];
    const listens: PlacedListenFact[] = [];
    for (const [path, content] of Object.entries({ 'app/Events/E.php': EVENTS, 'app/Listeners/L.php': LISTENERS, ...providers })) {
      const tree = parser.parse(content);
      try {
        if (tree.rootNode.hasError) continue;
        allFacts.push(collectFacts(path, tree.rootNode));
        listens.push(...collectListeners(tree.rootNode).map((fact) => ({ ...fact, path })));
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
    const map = buildListenerMap(listens, new Map(allFacts.map((facts) => [facts.path, facts])), classOf);
    const event = classes.get('App\\Events\\E')?.[0];
    return event ? listenersFor(map, event).map((l) => l.name) : [];
  }

  /** A provider `P extends <parent>` with class members `members`. */
  const provider = (members: string, parent = 'EventServiceProvider'): Record<string, string> => ({
    'app/Providers/P.php': `${HEAD} class P extends ${parent} { ${members} }`,
  });

  it('one provider maps an event to its listeners, in order', () => {
    expect(listenersOfE(provider('protected $listen = [E::class => [L1::class, L2::class]];'))).toEqual(['L1', 'L2']);
  });

  it('the same pair from two providers yields one listener', () => {
    expect(
      listenersOfE({
        ...provider('protected $listen = [E::class => [L1::class]];'),
        'app/Providers/Q.php': `${HEAD} class Q extends EventServiceProvider { protected $listen = [E::class => [L1::class, L1::class]]; }`,
      }),
    ).toEqual(['L1']);
  });

  it('a $listen of a class not directly extending EventServiceProvider adds nothing', () => {
    expect(
      listenersOfE({
        'app/Providers/P.php': `${HEAD} use Illuminate\\Support\\ServiceProvider; class P extends ServiceProvider { protected $listen = [E::class => [L1::class]]; }`,
        'app/Providers/Base.php': `${HEAD} class Base extends EventServiceProvider {}`,
        'app/Providers/Child.php': `${HEAD} class Child extends Base { protected $listen = [E::class => [L2::class]]; }`,
      }),
    ).toEqual([]);
  });

  it('a $listen element is read per entry: invalid entries add nothing, valid ones of the same element still count (12.1)', () => {
    expect(listenersOfE(provider("protected $listen = [E::class => [L1::class, 'App\\Listeners\\L2', [L2::class, 'handle'], L2::class . '@handle', ...self::MORE]];"))).toEqual(['L1']);
  });

  it('a static $listen, string keys or values, method pairs, an interface and a spread add nothing', () => {
    expect(listenersOfE(provider('protected static $listen = [E::class => [L1::class]];'))).toEqual([]);
    expect(listenersOfE(provider("protected $listen = ['App\\Events\\E' => [L1::class]];"))).toEqual([]);
    expect(listenersOfE(provider("protected $listen = [E::class => ['App\\Listeners\\L1']];"))).toEqual([]);
    expect(listenersOfE(provider("protected $listen = [E::class => [[L1::class, 'handle']]];"))).toEqual([]);
    expect(listenersOfE(provider('protected $listen = [E::class => [I::class]];'))).toEqual([]);
    expect(listenersOfE(provider('protected $listen = [...self::BASE, E::class => L1::class];'))).toEqual([]);
  });

  it('a provider declared in a method body, a provider dropped as a duplicate, and a broken provider add nothing beyond the first', () => {
    expect(
      listenersOfE({
        'app/Outer.php': `${HEAD} class Outer { public function f(): void { class P extends EventServiceProvider { protected $listen = [E::class => [L1::class]]; } } }`,
      }),
    ).toEqual([]);
    // Two `P` on one line: the second is dropped as a duplicate symbol, so only L1 counts.
    expect(
      listenersOfE({
        'app/Providers/P.php': `${HEAD} class P extends EventServiceProvider { protected $listen = [E::class => [L1::class]]; } class P extends EventServiceProvider { protected $listen = [E::class => [L2::class]]; }`,
      }),
    ).toEqual(['L1']);
    expect(listenersOfE(provider('protected $listen = [E::class => [L1::class]]; public function x( }'))).toEqual([]);
  });
});

describe('php analyzer job and event dispatch', () => {
  const analyzer = createPhpAnalyzer();

  it('Jobs and events reach their handlers', async () => {
    const emitter = file(
      'app/Emitter.php',
      '<?php namespace App; use App\\Events\\{Paid, Refunded}; use App\\Facades\\Ghost; use App\\Jobs\\{Sync, Work}; class Emitter { public function run(): void { event(new Paid()); event(new Refunded()); event(new \\App\\Events\\Missing()); Sync::dispatch(); Work::dispatchSync(); Ghost::quote(); } }',
    );
    const result = await analyzer.analyze({ files: [PAID, REFUNDED, NOTIFY, EVENT_PROVIDER, SYNC, WORK, GHOST, emitter] });
    const run = symbolOf(result, 'app/Emitter.php', 'Emitter::run');

    expect(callsFrom(result, 'app/Emitter.php', 'Emitter::run')).toEqual([
      heuristicCall(run, symbolOf(result, 'app/Jobs/Work.php', 'Work::handle')),
      heuristicCall(run, symbolOf(result, 'app/Listeners/Notify.php', 'Notify::handle')),
    ]);
  });

  it('Only Dispatchable jobs and EventServiceProvider listeners are followed', async () => {
    const result = await analyzer.analyze({
      files: [
        PAID,
        file('app/Listeners/Audit.php', '<?php namespace App\\Listeners; class Audit { public function handle(): void {} }'),
        file(
          'app/Providers/OtherProvider.php',
          '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Audit; use Illuminate\\Support\\ServiceProvider; class OtherProvider extends ServiceProvider { protected $listen = [Paid::class => [Audit::class]]; }',
        ),
        file('app/Jobs/Base.php', `<?php namespace App\\Jobs; ${DISPATCHABLE} class Base { use Dispatchable; }`),
        file('app/Jobs/Child.php', '<?php namespace App\\Jobs; class Child extends Base { public function handle(): void {} }'),
        file('app/Jobs/Bare.php', '<?php namespace App\\Jobs; class Bare { public function handle(): void {} }'),
        file(
          'app/Caller.php',
          "<?php namespace App; use App\\Events\\Paid; use App\\Jobs\\{Child, Bare}; class Caller { public function run($e): void { event(new Paid()); event($e); event('paid'); Child::dispatch(); Bare::dispatch(); $f = fn () => event(new Paid()); } }",
        ),
      ],
    });

    symbolOf(result, 'app/Caller.php', 'Caller::run'); // the caller parsed: an empty result is not a syntax error
    expect(callsFrom(result, 'app/Caller.php', 'Caller::run')).toEqual([]);
  });

  describe('extra cases of the event-dispatch rule', () => {
    const TWO_LISTENERS = file(
      'app/Providers/EventProvider.php',
      '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\{Notify, Mute}; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class, Mute::class]]; }',
    );
    const MUTE = file('app/Listeners/Mute.php', '<?php namespace App\\Listeners; class Mute { public function silence(): void {} }');

    /** `[resolution, target]` of the `calls` from `Caller::run`, whose body is `body`, next to `Paid`, `Notify`, `Mute` and `extra`. */
    async function eventCalls(body: string, extra: SourceFile[] = [TWO_LISTENERS]): Promise<[string, string | undefined][]> {
      const result = await analyzer.analyze({
        files: [PAID, NOTIFY, MUTE, ...extra, file('app/Caller.php', `<?php namespace App; use App\\Events\\Paid; class Caller { public function run(): void { ${body} } }`)],
      });
      symbolOf(result, 'app/Caller.php', 'Caller::run'); // the caller parsed: an empty result is not a syntax error
      return targets(callsFrom(result, 'app/Caller.php', 'Caller::run'));
    }

    it('an event with two listeners reaches each listener that declares handle', async () => {
      const second = file('app/Listeners/Ping.php', '<?php namespace App\\Listeners; class Ping { public function handle(): void {} }');
      const provider = file(
        'app/Providers/EventProvider.php',
        '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\{Notify, Mute, Ping}; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class, Mute::class, Ping::class]]; }',
      );
      // `Mute` declares no `handle`: no edge to it.
      expect(await eventCalls('event(new Paid());', [provider, second])).toEqual([
        ['heuristic', 'Notify::handle'],
        ['heuristic', 'Ping::handle'],
      ]);
    });

    it('event(new E) inside an arrow function or a closure gives no edge, even with a listener', async () => {
      expect(await eventCalls('$f = fn () => event(new Paid()); $g = function () { event(new Paid()); };')).toEqual([]);
    });

    it('the $listen of an event provider declared in a function body is never read (12.3)', async () => {
      const providerInFunction = file(
        'app/Providers/EventProvider.php',
        '<?php namespace App\\Providers; use App\\Events\\Paid; use App\\Listeners\\Notify; use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider; function boot(): void { class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; } }',
      );
      const result = await analyzer.analyze({
        files: [PAID, NOTIFY, providerInFunction, file('app/Caller.php', '<?php namespace App; use App\\Events\\Paid; class Caller { public function run(): void { event(new Paid()); } }')],
      });

      symbolOf(result, 'app/Providers/EventProvider.php', 'EventProvider');
      symbolOf(result, 'app/Caller.php', 'Caller::run');
      expect(callsFrom(result, 'app/Caller.php', 'Caller::run')).toEqual([]);
    });

    it('\\event(new E) counts like event(new E)', async () => {
      expect(await eventCalls('\\event(new Paid());')).toEqual([['heuristic', 'Notify::handle']]);
    });

    it('a named first argument, new self, new static, new $cls and Foo\\event give no edge', async () => {
      expect(await eventCalls('event(event: new Paid()); event(new self()); event(new static()); $c = Paid::class; event(new $c()); Foo\\event(new Paid());')).toEqual([]);
    });

    it('event() in a file with two namespace declarations gives no edge', async () => {
      const result = await analyzer.analyze({
        files: [
          PAID,
          NOTIFY,
          EVENT_PROVIDER,
          file('app/Caller.php', '<?php namespace A; namespace App; use App\\Events\\Paid; class Caller { public function run(): void { event(new Paid()); } }'),
        ],
      });
      symbolOf(result, 'app/Caller.php', 'Caller::run');
      expect(callsFrom(result, 'app/Caller.php', 'Caller::run')).toEqual([]);
    });
  });

  describe('extra cases of the job-dispatch rule', () => {
    it('X::dispatch*() of a Dispatchable class reaches its own handle only', async () => {
      const caller = file('app/Caller.php', '<?php namespace App; use App\\Jobs\\{Sync, Work}; class Caller { public function run(): void { Sync::dispatch(); Work::dispatchSync(); } }');
      const result = await analyzer.analyze({ files: [SYNC, WORK, caller] });

      expect(callsFrom(result, 'app/Caller.php', 'Caller::run')).toEqual([
        heuristicCall(symbolOf(result, 'app/Caller.php', 'Caller::run'), symbolOf(result, 'app/Jobs/Work.php', 'Work::handle')),
      ]);
    });

    /** `[resolution, target]` of the `calls` from `Caller::run`, whose body is `body`, with the job class source `job`. */
    async function jobCalls(job: string, body: string): Promise<[string, string | undefined][]> {
      const result = await analyzer.analyze({
        files: [
          file('app/Jobs/Job.php', job),
          file('app/Caller.php', `<?php namespace App; use App\\Jobs\\Job; class Caller { public function run(): void { ${body} } }`),
        ],
      });
      symbolOf(result, 'app/Caller.php', 'Caller::run'); // the caller parsed: an empty result is not a syntax error
      return targets(callsFrom(result, 'app/Caller.php', 'Caller::run'));
    }
    const MAGIC = 'public static function __callStatic(string $n, array $a): mixed { return null; }';
    const HANDLE = 'public function handle(): void {}';

    it('a Dispatchable class with __callStatic and no handle falls back to __callStatic', async () => {
      expect(await jobCalls(`<?php namespace App\\Jobs; ${DISPATCHABLE} class Job { use Dispatchable; ${MAGIC} }`, 'Job::dispatch();')).toEqual([
        ['heuristic', 'Job::__callStatic'],
      ]);
    });

    it('a Dispatchable class with both __callStatic and handle reaches handle only', async () => {
      expect(await jobCalls(`<?php namespace App\\Jobs; ${DISPATCHABLE} class Job { use Dispatchable; ${MAGIC} ${HANDLE} }`, 'Job::dispatchIf(true);')).toEqual([
        ['heuristic', 'Job::handle'],
      ]);
    });

    it('a trait list use Dispatchable, Queueable counts', async () => {
      const job = `<?php namespace App\\Jobs; ${DISPATCHABLE} use Illuminate\\Bus\\Queueable; class Job { use Dispatchable, Queueable; ${HANDLE} }`;
      expect(await jobCalls(job, 'Job::dispatchAfterResponse();')).toEqual([['heuristic', 'Job::handle']]);
    });

    it('a trait named Dispatchable from another namespace does not count', async () => {
      const job = `<?php namespace App\\Jobs; use App\\Support\\Dispatchable; class Job { use Dispatchable; ${HANDLE} }`;
      expect(await jobCalls(job, 'Job::dispatch();')).toEqual([]);
    });

    it('a class declaring dispatch itself gets the exact edge only', async () => {
      const job = `<?php namespace App\\Jobs; ${DISPATCHABLE} class Job { use Dispatchable; public static function dispatch(): void {} ${HANDLE} }`;
      expect(await jobCalls(job, 'Job::dispatch();')).toEqual([['exact', 'Job::dispatch']]);
    });

    it('a non-dispatch static method of a Dispatchable class gives no edge', async () => {
      expect(await jobCalls(`<?php namespace App\\Jobs; ${DISPATCHABLE} class Job { use Dispatchable; ${HANDLE} }`, 'Job::withChain([]);')).toEqual([]);
    });

    it('static::dispatch() and self::dispatch() give no edge', async () => {
      const job = `<?php namespace App\\Jobs; ${DISPATCHABLE} class Job { use Dispatchable; ${HANDLE} public function again(): void { static::dispatch(); self::dispatch(); } }`;
      const result = await analyzer.analyze({ files: [file('app/Jobs/Job.php', job)] });
      expect(callsFrom(result, 'app/Jobs/Job.php', 'Job::again')).toEqual([]);
    });
  });
});
