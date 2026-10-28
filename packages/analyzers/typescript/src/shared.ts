// `byPath` stays a private copy of the one in the PHP analyzer: the rule `analyzers-are-siblings`
// forbids importing the PHP package, and the author's exception of 2026-10-28 moved only
// `bySymbolOrder`, `keepFirst` and `uniqueInputs` to core (DIS-32, design D2, Follow-ups E2).

/** Orders anything with a `path` by UTF-16 code unit, never by locale. */
export const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
