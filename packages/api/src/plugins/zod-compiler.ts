import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import type { core } from 'zod';

/** One issue of a failed validation: where, which rule and its text; never the received value. */
export interface ValidationIssue {
  /** Keys and indexes to the offending field, relative to the validated part. */
  path: Array<string | number>;
  /** The schema language's issue code, such as `too_small`. */
  code: string;
  /** The issue's text. */
  message: string;
}

/** A request part failed its route's schema. Answered `400` `VALIDATION_ERROR` with its issues. */
export class SchemaValidationFailed extends Error {
  /** The issues, in the schema's order. */
  readonly issues: ValidationIssue[];

  /**
   * @param issues The schema issues; only their path, code and message are kept.
   */
  constructor(issues: readonly core.$ZodIssue[]) {
    super('invalid request');
    this.name = 'SchemaValidationFailed';
    this.issues = issues.map((issue) => ({
      path: issue.path.filter((key): key is string | number => typeof key !== 'symbol'),
      code: issue.code,
      message: issue.message,
    }));
  }
}

/** The schema of a route, checked to be a Zod schema; a `TypeError` naming the route otherwise. */
function zodSchema(schema: unknown, method: string, url: string): ZodType {
  if (typeof (schema as { safeParse?: unknown } | null)?.safeParse !== 'function') {
    throw new TypeError(`the schema of ${method} ${url} is not a Zod schema`);
  }
  return schema as ZodType;
}

/**
 * Makes Zod the schema language of the API (design U2): request parts are validated with
 * `safeParse` and replaced by the parsed value; responses are serialised through `parse`, so
 * undeclared fields are dropped and a result that breaks its schema throws. A schema that is not a
 * Zod schema throws a `TypeError` naming its route, so the app fails at `ready()`.
 *
 * @param app The root instance, before any route is registered.
 */
export function installZodCompilers(app: FastifyInstance): void {
  app.setValidatorCompiler(({ schema, method, url }) => {
    const zod = zodSchema(schema, method, url);
    return (data: unknown) => {
      const result = zod.safeParse(data);
      return result.success ? { value: result.data } : { error: new SchemaValidationFailed(result.error.issues) };
    };
  });
  app.setSerializerCompiler(({ schema, method, url }) => {
    const zod = zodSchema(schema, method, url);
    return (data: unknown) => JSON.stringify(zod.parse(data));
  });
}
