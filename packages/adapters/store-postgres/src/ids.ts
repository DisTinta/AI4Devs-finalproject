/**
 * A project, symbol or file id as the store returns it: the hyphenated 8-4-4-4-12 form, any case.
 * Postgres also accepts braces and the unhyphenated form, but the store treats those as naming no
 * row: no project (`ProjectNotFound`) or no seed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `id` is in the form the store returns ids in. */
export function isWellFormedId(id: string): boolean {
  return UUID.test(id);
}
