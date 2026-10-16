import type { FastifyInstance, FastifySchema } from 'fastify';
import { z } from 'zod';
import type { core, ZodType } from 'zod';

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
  if (!isZod(schema)) throw new TypeError(`the schema of ${method} ${url} is not a Zod schema`);
  return schema;
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

/** The request parts whose schemas the OpenAPI document shows as the client sends them. */
const INPUT_PARTS = ['body', 'querystring', 'params', 'headers'] as const;

/** Whether `schema` is a Zod schema. */
function isZod(schema: unknown): schema is ZodType {
  return typeof (schema as { safeParse?: unknown } | null)?.safeParse === 'function';
}

/** `schema` as OpenAPI 3.0 JSON Schema when it is a Zod schema; unchanged otherwise. */
function toOpenApi(schema: unknown, io: 'input' | 'output'): unknown {
  return isZod(schema) ? z.toJSONSchema(schema, { target: 'openapi-3.0', io }) : schema;
}

/**
 * The `transform` given to `@fastify/swagger` (design U2): converts every Zod schema of a route's
 * request parts (as input: a key with a default is optional for the client) and of its responses
 * (as output) to OpenAPI 3.0 JSON Schema. A schema that is not a Zod schema passes through
 * unchanged; one Zod cannot represent (a `.transform()`) makes `z.toJSONSchema` throw.
 *
 * @param input The route's schema and URL, as `@fastify/swagger` passes them.
 * @returns The converted schema and the same URL.
 */
export function zodToOpenApi(input: { schema: FastifySchema; url: string }): { schema: FastifySchema; url: string } {
  const { schema, url } = input;
  if (schema === undefined || schema === null) return { schema, url };
  const converted: FastifySchema = { ...schema };
  for (const part of INPUT_PARTS) {
    if (schema[part] !== undefined) converted[part] = toOpenApi(schema[part], 'input');
  }
  if (schema.response !== undefined) {
    const response = schema.response as Record<string, unknown>;
    converted.response = Object.fromEntries(Object.entries(response).map(([status, part]) => [status, toOpenApi(part, 'output')]));
  }
  return { schema: converted, url };
}
