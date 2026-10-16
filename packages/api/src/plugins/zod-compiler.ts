import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';

/**
 * Makes Zod the schema language of the API (design U2): request parts are validated with
 * `safeParse`, responses serialised through `parse`.
 *
 * @param app The root instance, before any route is registered.
 */
export function installZodCompilers(app: FastifyInstance): void {
  app.setValidatorCompiler(({ schema }) => {
    const zod = schema as ZodType;
    return (data: unknown) => {
      const result = zod.safeParse(data);
      return result.success ? { value: result.data } : { error: new Error('invalid request') };
    };
  });
  app.setSerializerCompiler(({ schema }) => {
    const zod = schema as ZodType;
    return (data: unknown) => JSON.stringify(zod.parse(data));
  });
}
