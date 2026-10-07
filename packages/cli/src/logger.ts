import { toTerminalSafeJson } from './safe-json.js';

/** Where the CLI writes text: `process.stdout`, `process.stderr`, or an in-memory sink in tests. */
export interface TextSink {
  /** Writes one chunk of text. */
  write(chunk: string): unknown;
}

/** The fields of one log line, besides its `level`. Values must be JSON-serialisable. */
export type LogFields = Record<string, unknown>;

/** A structured logger: every call writes one JSON object on its own line. */
export interface Logger {
  /** Writes `{"level":"info",…fields}`. */
  info(fields: LogFields): void;
  /** Writes `{"level":"error",…fields}`. */
  error(fields: LogFields): void;
}

/**
 * Creates a logger that writes JSON lines to `sink`. It never formats free text, and every line goes
 * through {@link toTerminalSafeJson}, so a field holding an untrusted string reaches the terminal
 * with no raw control character.
 *
 * @param sink Where the lines go; the CLI passes stderr.
 * @returns The logger.
 */
export function createLogger(sink: TextSink): Logger {
  const write = (level: 'info' | 'error', fields: LogFields): void => {
    sink.write(`${toTerminalSafeJson({ level, ...fields })}\n`);
  };
  return {
    info: (fields) => write('info', fields),
    error: (fields) => write('error', fields),
  };
}
