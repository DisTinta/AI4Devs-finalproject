import type { FileKind } from './graph-file.js';
import type { GraphFile } from './graph-file.js';

const TEST_SEGMENTS = new Set(['tests', 'test', '__tests__']);
const CONFIG_EXTENSIONS = new Set(['json', 'xml', 'yml', 'yaml', 'toml', 'ini']);

/** The file name, the last `/`-separated segment of `path`. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function isTest(directories: string[], name: string): boolean {
  if (directories.some((segment) => TEST_SEGMENTS.has(segment))) return true;
  return /\.test\.|\.spec\.|Test\.php$/.test(name);
}

function isDoc(directories: string[], name: string): boolean {
  if (directories.includes('docs')) return true;
  return name.endsWith('.md');
}

function isConfig(segments: string[], name: string): boolean {
  if (segments[0] === 'config') return true;
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (CONFIG_EXTENSIONS.has(extension)) return true;
  if (name.startsWith('.')) return true;
  return name.includes('.config.');
}

/**
 * Classifies `path` into exactly one `FileKind` by the canonical, language-independent rule: `test`,
 * then `doc`, then `config`, then `source`, first match wins. Separator is always `/`. Directory-segment
 * checks (`tests`, `docs`) exclude the file name; `config` looks at the first segment, which may be it.
 */
export function fileKindOf(path: string): FileKind {
  const segments = path.split('/');
  const directories = segments.slice(0, -1);
  const name = nameOf(path);
  if (isTest(directories, name)) return 'test';
  if (isDoc(directories, name)) return 'doc';
  if (isConfig(segments, name)) return 'config';
  return 'source';
}

/**
 * The number of lines of `content`: `0` for empty content, otherwise the number of
 * `\n`-separated lines, a final line terminator not counting as an extra line (`\r\n` counts as one
 * terminator).
 */
export function countLines(content: string): number {
  if (content === '') return 0;
  const withoutFinalTerminator = content.endsWith('\n') ? content.slice(0, -1) : content;
  return withoutFinalTerminator.split('\n').length;
}

/** Describes `path` and `content` as a `GraphFile`: its `path`, `kind` and `loc`, nothing else. */
export function describeFile(path: string, content: string): GraphFile {
  return { path, kind: fileKindOf(path), loc: countLines(content) };
}
