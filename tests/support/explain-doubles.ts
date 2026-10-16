import { expect } from 'vitest';
import { buildContextPack, createInMemoryVerificationCache } from '@codemind/core';
import type { CostTable, FilledContextPack, KnowledgeGraph, NewProject, StorePort, VerificationCache } from '@codemind/core';
import { ACME_SHOP_PROJECT, acmeShopGraph } from './acme-shop-graph';
import { createInMemoryStore } from './in-memory-store';
import type { CacheCallFailures, ClaimWriteFailure } from './in-memory-store';
import { createInMemorySourceTree } from './in-memory-source-tree';
import type { SourceContents } from './in-memory-source-tree';
import { createScriptedLlm, modelOutput } from './scripted-llm';
import type { Script, ScriptedLlmOptions } from './scripted-llm';
import { file, symbol } from './sample-graph';

// The doubles of the explain use-case tests (DIS-39), shared by tests/unit/explain/explain.spec.ts and
// explain-sanitization.spec.ts (DIS-41 design D8). The store and the source tree are the in-memory
// doubles over the acme-shop subset, whose files get a synthetic content of their stored length; the
// model is scripted from the ids of the prompt. Since DIS-68 (design V9) `verificationContents` and
// `verificationFailures` answer the source reads made after the model call (the verification read),
// so a test can change a file between the pack's read and the verification at the same commit. Since
// DIS-70 (design S10) `deps` holds a fresh verification cache unless one is given, and the verifier and
// the usage options go to the scripted model, whose default verifier entails every pair. Since DIS-74
// (design U12) `now` scripts the clock (instants read in turn, the last one repeated; `[NOW]` by
// default, so `clock.reads()` counts the reads), `failQueryLogWrite` injects a failure of the
// `query_log` write, `costTable` reaches explain, and `saveQueryLog` joins the shared call order. Since
// DIS-21 (design C5) `failCacheCall` injects failures of the answer cache calls, and `findCacheEntry`,
// `touchCacheEntry` and `saveCacheEntry` join the shared call order under their own names.

export const Q1 = '¿Cómo se calcula el precio final de un pedido?';
export const COMMIT = 'c'.repeat(40);
export const WORKSPACE = '/workspace';
export const NOW = new Date('2026-10-13T10:00:00.000Z');

/** A synthetic content of `lines` lines for `path`, ending with a line feed. */
export function linesOf(path: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `// ${path} line ${i + 1}`).join('\n') + '\n';
}

export interface DoubleOptions extends ScriptedLlmOptions {
  mode?: 'live' | 'evaluation';
  /** The verification cache of `deps`; a fresh in-memory one when absent. */
  verificationCache?: VerificationCache;
  script?: Script;
  graph?: KnowledgeGraph;
  project?: NewProject;
  contents?: Record<string, string>;
  /** The files as the reads after the model call see them; `contents` when absent. */
  verificationContents?: Record<string, string>;
  /** Path to the error the reads after the model call reject with. */
  verificationFailures?: Record<string, unknown>;
  failClaimWrite?: ClaimWriteFailure;
  /** Called on each valid `saveQueryLog`; a value other than `undefined` is thrown instead of writing. */
  failQueryLogWrite?: () => unknown;
  /** Failures of the answer cache calls, each thrown when its function returns a value. */
  failCacheCall?: CacheCallFailures;
  /** The instants `deps.now` reads in turn, the last one repeated once the list is exhausted; `[NOW]` when absent. */
  now?: readonly Date[];
  /** The cost table of `deps`; absent (explain's default) when not given. */
  costTable?: CostTable;
  store?: (store: StorePort) => StorePort;
}

/** A clock that reads `instants` in turn, the last one repeated, counting its reads. */
export function scriptedClock(instants: readonly Date[] = [NOW]): { now: () => Date; reads: () => number } {
  let reads = 0;
  return {
    now: () => new Date(instants[Math.min(reads++, instants.length - 1)]!.getTime()),
    reads: () => reads,
  };
}

/** The doubles: acme-shop indexed at `COMMIT` by default, a scripted model, a shared call order. */
export function doubles(options: DoubleOptions = {}) {
  const graph = options.graph ?? { ...acmeShopGraph(), indexedCommit: COMMIT };
  const project = options.project ?? { ...ACME_SHOP_PROJECT, rootPath: '/repos/acme-shop' };
  const loaded = createInMemoryStore({
    projects: [{ project, graph }],
    failClaimWrite: options.failClaimWrite,
    failQueryLogWrite: options.failQueryLogWrite,
    failCacheCall: options.failCacheCall,
  });
  const contents = options.contents ?? Object.fromEntries(graph.files.map((f) => [f.path, linesOf(f.path, f.loc ?? 1)]));
  const tree: SourceContents = { [project.rootPath]: { [COMMIT]: contents } };
  const order: string[] = [];
  const later = options.verificationContents !== undefined || options.verificationFailures !== undefined;
  const source = createInMemorySourceTree(
    tree,
    {},
    later
      ? {
          after: {
            // `scripted-llm.ts` pushes `complete` into the shared order: only reads after the model see these.
            when: () => order.includes('complete'),
            contents: { [project.rootPath]: { [COMMIT]: options.verificationContents ?? contents } },
            failures: options.verificationFailures,
          },
        }
      : {},
  );
  const { verify, answerUsage, verifyUsage, verifyModel, answerModel } = options;
  const model = createScriptedLlm(options.mode ?? 'live', options.script, order, {
    verify,
    answerUsage,
    verifyUsage,
    verifyModel,
    answerModel,
  });
  const clock = scriptedClock(options.now);
  const base = options.store?.(loaded.store) ?? loaded.store;
  const store: StorePort = {
    ...base,
    findClaimsOverlapping: (...args) => {
      order.push('findClaimsOverlapping');
      return base.findClaimsOverlapping(...args);
    },
    saveClaims: (...args) => {
      order.push('saveClaims');
      return base.saveClaims(...args);
    },
    saveQueryLog: (...args) => {
      order.push('saveQueryLog');
      return base.saveQueryLog(...args);
    },
    findCacheEntry: (...args) => {
      order.push('findCacheEntry');
      return base.findCacheEntry(...args);
    },
    touchCacheEntry: (...args) => {
      order.push('touchCacheEntry');
      return base.touchCacheEntry(...args);
    },
    saveCacheEntry: (...args) => {
      order.push('saveCacheEntry');
      return base.saveCacheEntry(...args);
    },
  };
  return {
    loaded,
    projectId: loaded.projectIds[0]!,
    order,
    model,
    clock,
    sourceCalls: source.calls,
    batchReads: source.batchReads,
    reads: source.reads,
    deps: {
      store,
      source: source.source,
      llm: model.llm,
      workspaceRoot: WORKSPACE,
      now: clock.now,
      verificationCache: options.verificationCache ?? createInMemoryVerificationCache(),
      ...(options.costTable !== undefined && { costTable: options.costTable }),
    },
  };
}

/** The context pack explain builds for `question` over the same doubles. */
export async function packOf(d: ReturnType<typeof doubles>, question = Q1): Promise<FilledContextPack> {
  const pack = await buildContextPack({ store: d.loaded.store, source: d.deps.source, workspaceRoot: WORKSPACE }, {
    projectId: d.projectId,
    question,
  });
  expect(pack.status).toBe('ok');
  return pack as FilledContextPack;
}

/** The rejection of `promise`, or a failure when it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

/** A script citing fixed prompt ids. */
export function citingIds(answer: string, statements: string[][]): Script {
  return () => modelOutput(answer, statements.map((evidenceIds, i) => ({ text: `statement ${i + 1}`, evidenceIds })));
}

/** A tiny project of its own with the given symbols and file contents, indexed at `COMMIT`. */
export function ownGraph(files: KnowledgeGraph['files'], symbols: KnowledgeGraph['symbols']): KnowledgeGraph {
  return { files, symbols, edges: [], commits: [], fileCommits: [], indexedCommit: COMMIT };
}

/** A project whose question `price` anchors three symbols in two files (three spans, in rank order). */
export function threeSpans(options: DoubleOptions = {}, firstFile = linesOf('app/F1.php', 40)) {
  return doubles({
    ...options,
    project: { name: 'own', rootPath: '/repos/own', language: 'php' },
    graph: ownGraph(
      [file('app/F1.php', { loc: 40 }), file('app/F2.php', { loc: 20 })],
      [symbol('app/F1.php', 'PriceA', 1), symbol('app/F1.php', 'PriceB', 10), symbol('app/F2.php', 'PriceC', 1)],
    ),
    contents: { 'app/F1.php': firstFile, 'app/F2.php': linesOf('app/F2.php', 20) },
  });
}
