import { z } from 'zod';

/**
 * Environment parsing. Real deployments provide JWT_SECRET; when it is absent we
 * fall back to a development-only default.
 *
 * fixture-secret: the constant below is a PLANTED, obviously-fake secret. It
 * exists so the harness secret scanner (gitleaks / HU1) has exactly one thing to
 * detect and redact in this repository. It is not a real credential and must
 * never be used. See fixtures/README.md → "Planted secret".
 */
const DEV_FALLBACK_JWT_SECRET = 'AKIAJ7FAKEFIXTURE42Q'; // pragma: allowlist secret (fixture)

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().min(1).default(DEV_FALLBACK_JWT_SECRET),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
