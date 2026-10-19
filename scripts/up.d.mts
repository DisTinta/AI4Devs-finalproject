/** Types of `scripts/up.mjs` for the typed tests (DIS-102 design D16). */
import type { Writable } from './env.mjs';

/** How `up` starts a step. */
export interface StepOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  stdio: 'inherit';
  shell: false;
}

/** How a step ended: its exit code or signal, or the error that kept it from starting. */
export type StepResult = { code: number | null; signal: string | null } | { error: { code?: string } };

/** Starts a step and resolves with how it ended. */
export type StepRunner = (command: string, args: string[], options: StepOptions) => Promise<StepResult>;

/** What `runUp` needs; every field but `env`, `stdout` and `stderr` has a default. */
export interface UpOptions {
  env: Record<string, string | undefined>;
  dotenvPath?: string;
  run?: StepRunner;
  stdout: Writable;
  stderr: Writable;
  cwd?: string;
  onInterrupt?: (listener: () => void) => () => void;
}

/** Runs the start sequence and resolves with the exit code of `up`. */
export function runUp(options: UpOptions): Promise<number>;
