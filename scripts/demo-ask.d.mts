/** Types of `scripts/demo-ask.mjs` for the typed tests (DIS-102 design D16). */
import type { Writable } from './env.mjs';

/** The part of `fetch` that `demo:ask` uses. */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text(): Promise<string> }>;

/** What `runDemoAsk` needs; `dotenvPath` and `fetch` have defaults. */
export interface DemoAskOptions {
  env: Record<string, string | undefined>;
  dotenvPath?: string;
  fetch?: Fetch;
  stdout: Writable;
  stderr: Writable;
}

/** Sends the question and prints the result; resolves with the exit code. */
export function runDemoAsk(args: string[], options: DemoAskOptions): Promise<number>;
