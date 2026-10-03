import type { SymbolRef } from '@codemind/core';
import type { CallForm } from '../calls.js';

/** Looks up the method `name` declared in the body of the call's target type itself (never inherited). */
export type DeclaredMethodLookup = (name: string) => SymbolRef | undefined;

/**
 * The `__call` / `__callStatic` fallback of a call whose target method is not declared in its target
 * type (spec "Laravel heuristic calls", rules 2 and 3; design D4): `$this->p->m()` and `$this->m()`
 * land on `__call`, `X::m()` on `__callStatic`, when the target type is a class that declares that
 * magic method in its own body. Any other form (`new`, `self::m()`), or an interface or trait target,
 * gives `undefined`. A facade class must be ruled out by the caller before asking for `__callStatic`.
 */
export function resolveMagicCall(form: CallForm, targetIsClass: boolean, declaredMethod: DeclaredMethodLookup): SymbolRef | undefined {
  if (!targetIsClass) return undefined;
  if (form === 'property' || form === 'this') return declaredMethod('__call');
  if (form === 'static') return declaredMethod('__callStatic');
  return undefined;
}
