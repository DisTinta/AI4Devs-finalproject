import { randomUUID } from 'node:crypto';

/**
 * Thin wrapper over the platform UUID generator. Isolated so tests can stub a
 * deterministic id source without reaching into node:crypto everywhere.
 */
export function newId(): string {
  return randomUUID();
}
