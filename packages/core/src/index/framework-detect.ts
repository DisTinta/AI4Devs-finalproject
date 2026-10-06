import type { ProjectFramework } from '../knowledge/project.js';
import type { SourceFile } from '../ports/AnalyzerPort.js';

/** A framework, the root manifest that declares it, and the dependency fields and key to look for. */
interface ManifestRule {
  framework: ProjectFramework;
  manifest: string;
  fields: readonly string[];
  dependency: string;
}

/** Checked in this order: the first rule that matches wins, so Laravel wins over Fastify. */
const MANIFEST_RULES: readonly ManifestRule[] = [
  { framework: 'laravel', manifest: 'composer.json', fields: ['require', 'require-dev'], dependency: 'laravel/framework' },
  { framework: 'fastify', manifest: 'package.json', fields: ['dependencies', 'devDependencies'], dependency: 'fastify' },
];

/**
 * Detects a repository's framework from its root manifests (PH-24): `laravel/framework` as a key of
 * `require` or `require-dev` in `composer.json` → `laravel`; otherwise `fastify` as a key of
 * `dependencies` or `devDependencies` in `package.json` → `fastify`; otherwise `none`. Manifests
 * outside the root are ignored. A manifest that is not valid JSON, not an object, or whose dependency
 * field is not an object declares nothing. Never throws.
 *
 * @param files The repository's files, with repository-relative paths.
 * @returns The detected framework.
 */
export function detectFramework(files: readonly SourceFile[]): ProjectFramework {
  for (const rule of MANIFEST_RULES) {
    const manifest = files.find((file) => file.path === rule.manifest);
    if (manifest !== undefined && declares(parseObject(manifest.content), rule)) return rule.framework;
  }
  return 'none';
}

function declares(manifest: Record<string, unknown> | undefined, rule: ManifestRule): boolean {
  return rule.fields.some((field) => {
    const dependencies = manifest === undefined ? undefined : asObject(manifest[field]);
    return dependencies !== undefined && Object.hasOwn(dependencies, rule.dependency);
  });
}

function parseObject(content: string): Record<string, unknown> | undefined {
  try {
    return asObject(JSON.parse(content));
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
