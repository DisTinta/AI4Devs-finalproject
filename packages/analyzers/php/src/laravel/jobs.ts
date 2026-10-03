import type { SymbolRef } from '@codemind/core';
import type { PhpFileFacts, PhpTypeFact } from '../names.js';
import { resolveClassName } from '../names.js';
import type { DeclaredMethodLookup } from './magic-call.js';

/** FQN of the trait a job class must use in its own body (spec "Laravel heuristic calls", rule 4). */
export const DISPATCHABLE_FQN = 'Illuminate\\Foundation\\Bus\\Dispatchable';

/** The static methods `Dispatchable` adds that queue the job (rule 4). */
const DISPATCH_METHODS = new Set(['dispatch', 'dispatchSync', 'dispatchIf', 'dispatchUnless', 'dispatchAfterResponse']);

/**
 * The `handle` method a `X::m(...)` job dispatch reaches (spec "Laravel heuristic calls", rule 4; design
 * D4 of php-laravel-heuristics-2a): `m` is one of {@link DISPATCH_METHODS}, `X` (`type`, declared in the
 * file of `facts`) uses in its own body a trait resolving to {@link DISPATCHABLE_FQN}, and declares
 * `handle`. A trait used only by a parent class does not count. The caller has already checked that
 * `X` is a class, not a facade class, and does not declare `m`. `undefined` when the rule does not apply.
 */
export function resolveJobDispatch(
  method: string,
  type: PhpTypeFact,
  facts: PhpFileFacts,
  declaredMethod: DeclaredMethodLookup,
): SymbolRef | undefined {
  if (!DISPATCH_METHODS.has(method)) return undefined;
  if (!type.uses.some((raw) => resolveClassName(raw, facts) === DISPATCHABLE_FQN)) return undefined;
  return declaredMethod('handle');
}
