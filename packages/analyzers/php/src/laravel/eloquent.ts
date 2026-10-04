import type { SymbolRef } from '@codemind/core';
import type { DeclaredMethodLookup } from './magic-call.js';

/** FQN a model class must directly extend (spec "Laravel heuristic calls", rule 6). */
export const ELOQUENT_MODEL_FQN = 'Illuminate\\Database\\Eloquent\\Model';

/**
 * Laravel's `Str::studly` for an attribute name (design D2 of php-laravel-heuristics-2b): split at
 * every `_` and `-`, drop empty parts, upper-case each part's first character and join
 * (`coupon_code` → `CouponCode`, `subtotal` → `Subtotal`).
 */
export function studly(attribute: string): string {
  return attribute
    .split(/[_-]/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * The method an Eloquent read `$r->a` reaches (spec "Laravel heuristic calls", rule 6): on a model
 * class (`isModel`), its own accessor `get{Studly(a)}Attribute` when declared, otherwise its own method
 * `a` (a relation, or a Laravel 9+ `Attribute` accessor of the same name). `undefined` for a column
 * (neither declared) or when the receiver's type is no model class. Inherited methods never count:
 * `declaredMethod` only finds methods declared in the model's own body.
 */
export function resolveEloquentAttribute(attribute: string, isModel: boolean, declaredMethod: DeclaredMethodLookup): SymbolRef | undefined {
  if (!isModel) return undefined;
  return declaredMethod(`get${studly(attribute)}Attribute`) ?? declaredMethod(attribute);
}
