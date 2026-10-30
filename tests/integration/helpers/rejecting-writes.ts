import type { ClientBase } from 'pg';

/** Which insert {@link rejectingWrites} rejects, and the text its error quotes. */
export interface WriteRejection {
  /** The table whose inserts are rejected. */
  table: string;
  /** Whether an insert's values are rejected; every insert into `table` when absent. */
  when?: (values: readonly unknown[]) => boolean;
  /** The text the error's message, `detail` and `hint` quote, from the rejected insert's values. */
  quote: (values: readonly unknown[]) => string;
}

/** The dollar-quote tags of the raised statement; a quote must contain neither. */
const QUOTE_TAG = '$rejected$';
const BODY_TAG = '$do$';

/**
 * A `when` that matches when any string value, or any string element of an array value, includes
 * `text` (the store passes some columns, such as evidence excerpts, as arrays).
 */
export function valuesInclude(text: string): (values: readonly unknown[]) => boolean {
  const holds = (value: unknown): boolean =>
    typeof value === 'string' ? value.includes(text) : Array.isArray(value) && value.some(holds);
  return (values) => values.some(holds);
}

/** `text` as a dollar-quoted SQL literal. */
function literal(text: string): string {
  if (text.includes(QUOTE_TAG) || text.includes(BODY_TAG)) {
    throw new Error(`rejectingWrites: the quote contains a quoting tag (${QUOTE_TAG} or ${BODY_TAG})`);
  }
  return `${QUOTE_TAG}${text}${QUOTE_TAG}`;
}

/**
 * Wraps `client` so that a write the test wants to fail fails inside the database, without DDL
 * (DIS-110, integration-test-races design D7). Every `query(sql, values)` is forwarded unchanged,
 * except one whose SQL inserts into `rejection.table` and whose values match `rejection.when`: in its
 * place a `DO` block is sent on the same client, which makes PostgreSQL raise `P0001` with a message,
 * `detail` and `hint` quoting `rejection.quote(values)`. The caller's transaction or savepoint is
 * aborted exactly as by a failing insert, and no table is locked nor any object created, unlike a
 * trigger, whose creation waited for and then blocked every other writer of the table.
 *
 * @throws Error synchronously when the quote contains `$rejected$` or `$do$`.
 */
export function rejectingWrites(client: ClientBase, rejection: WriteRejection): ClientBase {
  const insert = new RegExp(`^\\s*INSERT\\s+INTO\\s+${rejection.table}\\b`, 'i');
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  const wrapper = {
    query: (...args: unknown[]): unknown => {
      const [sql, values] = args;
      const parameters = Array.isArray(values) ? (values as unknown[]) : [];
      if (typeof sql !== 'string' || !insert.test(sql) || !(rejection.when?.(parameters) ?? true)) return query(...args);
      const quoted = literal(rejection.quote(parameters));
      const message = literal(`${rejection.table} rejected: ${rejection.quote(parameters)}`);
      return query(
        `DO ${BODY_TAG} BEGIN RAISE EXCEPTION USING MESSAGE = ${message}, DETAIL = ${quoted}, HINT = ${quoted}; END ${BODY_TAG}`,
      );
    },
  };
  return wrapper as unknown as ClientBase;
}
