/** Types of `scripts/dev-processes.mjs` for the typed tests. */
import type { Writable } from './env.mjs';

/** One running process; `start` is its start time in epoch milliseconds. */
export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  start: number;
}

/** What `selectTargets` needs: the roots that mark a process, this script's pid and an optional date filter. */
export interface SelectOptions {
  roots: string[];
  self: number;
  since?: number;
}

/** The dev processes of the repository in `table`, in table order. */
export function selectTargets(table: ProcessInfo[], options: SelectOptions): ProcessInfo[];

/** What `runDevProcesses` needs. */
export interface DevProcessesOptions {
  args: string[];
  roots: string[];
  self: number;
  list: () => Promise<ProcessInfo[]>;
  kill: (pid: number) => Promise<void>;
  stdout: Writable;
  stderr: Writable;
}

/** Runs `list` or `stop` and resolves with the exit code: `0`, or `2` for a usage error. */
export function runDevProcesses(options: DevProcessesOptions): Promise<number>;
