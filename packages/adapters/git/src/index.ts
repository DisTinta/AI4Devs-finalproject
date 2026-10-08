// @codemind/adapter-git — GitPort and SourceTreePort over git (simple-git for the repository checks,
// streamed processes for the reads), with pseudonymised authors.
export { authorHashSaltFromEnv } from './config.js';
export { createSimpleGitHistory } from './simple-git-history.js';
export type { SimpleGitHistoryOptions } from './simple-git-history.js';
export { createGitSourceTree } from './git-source-tree.js';
