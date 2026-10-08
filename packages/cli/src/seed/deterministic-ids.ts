import { createHash } from 'node:crypto';

/**
 * Namespace of every id in the seed (DIS-91 design D4). Generated once; changing it changes every id
 * of the seed, which needs `codemind-seed-format` bumped.
 */
export const SEED_ID_NAMESPACE = 'c604f694-731a-4acd-b7f3-9c090f2a1fb3';

/**
 * Separates the components of a natural key. NUL cannot occur in any component: Postgres rejects it
 * in `text`, and the other components are integers or enum labels. So two different component lists
 * never produce the same key.
 */
export const KEY_SEPARATOR = '\u0000';

/** One end of an edge: a file by its path, or a symbol by its file path, kind, start line and name. */
export type SeedEndpoint =
  | { type: 'file'; path: string }
  | { type: 'symbol'; path: string; kind: string; startLine: number; name: string };

/**
 * A name-based version 5 UUID (RFC 4122 §4.3): SHA-1 of the namespace bytes followed by the UTF-8
 * bytes of `name`, with the version and variant bits set.
 *
 * @param namespace Namespace UUID, hyphenated.
 * @param name The name to derive the id from.
 * @returns The UUID, lowercase and hyphenated.
 */
export function uuidV5(namespace: string, name: string): string {
  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name, 'utf8')
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The seed id of a natural key: {@link uuidV5} under {@link SEED_ID_NAMESPACE}. */
export function seedId(key: string): string {
  return uuidV5(SEED_ID_NAMESPACE, key);
}

function join(...components: (string | number)[]): string {
  return components.map(String).join(KEY_SEPARATOR);
}

/** Key of a project: its name. */
export function projectKey(project: string): string {
  return join(project);
}

/** Key of a file: project name, path. */
export function fileKey(project: string, path: string): string {
  return join(project, path);
}

/** Key of a symbol: project name, file path, kind, start line, symbol name. */
export function symbolKey(project: string, path: string, kind: string, startLine: number, name: string): string {
  return join(project, ...endpointComponents({ type: 'symbol', path, kind, startLine, name }).slice(1));
}

/** Key of a commit: project name, sha. */
export function commitKey(project: string, sha: string): string {
  return join(project, sha);
}

/**
 * Key of an edge: project name, kind, resolution, extractor, then the source and the target, each as
 * its endpoint type followed by its key without the project name. Edges sharing this key are told
 * apart by an occurrence index appended by the renderer.
 */
export function edgeKey(
  project: string,
  kind: string,
  resolution: string,
  extractor: string,
  source: SeedEndpoint,
  target: SeedEndpoint,
): string {
  return join(project, kind, resolution, extractor, ...endpointComponents(source), ...endpointComponents(target));
}

/** Appends the occurrence index `#n` of an edge among edges sharing `key`. */
export function withOccurrence(key: string, occurrence: number): string {
  return join(key, `#${occurrence}`);
}

function endpointComponents(endpoint: SeedEndpoint): (string | number)[] {
  return endpoint.type === 'file'
    ? ['file', endpoint.path]
    : ['symbol', endpoint.path, endpoint.kind, endpoint.startLine, endpoint.name];
}
