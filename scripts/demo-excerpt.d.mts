/** Types of `scripts/demo-excerpt.mjs` for the typed tests (DIS-102 design D16). */
import type { Writable } from './env.mjs';

/** What `runDemoExcerpt` needs; `fixturesRoot` defaults to the repository's `fixtures/`. */
export interface DemoExcerptOptions {
  fixturesRoot?: string;
  stdout: Writable;
  stderr: Writable;
}

/** Prints the cited lines of a fixture file and returns the exit code. */
export function runDemoExcerpt(args: string[], options: DemoExcerptOptions): number;
