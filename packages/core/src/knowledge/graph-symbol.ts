/** Kinds of code symbol (Postgres enum `symbol_kind`). */
export const SYMBOL_KINDS = ['class', 'interface', 'method', 'function', 'route'] as const;

/** Kind of a code symbol. */
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

/** Identity of a symbol within a graph: its file path, name and start line. */
export interface SymbolRef {
  /** Path of the file that declares the symbol. */
  file: string;
  /** Symbol name. */
  name: string;
  /** First line of the symbol, from 1. */
  startLine: number;
}

/** A string key equal for two refs exactly when they name the same symbol. */
export function symbolKey(ref: SymbolRef): string {
  return JSON.stringify([ref.file, ref.name, ref.startLine]);
}

/** A symbol declared in one file of the graph. */
export interface GraphSymbol extends SymbolRef {
  /** Kind of symbol. */
  kind: SymbolKind;
  /** Last line of the symbol; not before `startLine`. */
  endLine: number;
  /** Declared signature, when the analyzer extracts one. */
  signature?: string;
}
