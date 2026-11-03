/** Types of `scripts/demo-ask.mjs` for the typed tests (DIS-102 design D16). */
import type { Writable } from './env.mjs';

/** How `demo:ask` sends its request (by default `node:http`, without a time limit). */
export type Send = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text(): Promise<string> }>;

/** What `runDemoAsk` needs; `dotenvPath` and `send` have defaults. */
export interface DemoAskOptions {
  env: Record<string, string | undefined>;
  dotenvPath?: string;
  send?: Send;
  stdout: Writable;
  stderr: Writable;
}

/** Sends the question and prints the result; resolves with the exit code. */
export function runDemoAsk(args: string[], options: DemoAskOptions): Promise<number>;

/** Sends one request with `node:http`, without a time limit (DIS-81 design D9). */
export const sendWithHttp: Send;

/** The API's port read as the API reads `PORT`: blank = 3000, or `undefined` when it is not a port number. */
export function apiPort(value: string | undefined): number | undefined;
