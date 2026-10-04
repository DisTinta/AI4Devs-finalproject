/**
 * dependency-cruiser — dependency rule for the hexagonal monorepo.
 *
 * Single source of truth for the architecture rule. It is the CI counterpart
 * to the GUARD_HTTP_IN_BUSINESS guard in the post-edit-quality hook: the hook
 * warns when saving a file, this fails the build. One is fast and local, the
 * other is the authority and cannot be skipped.
 *
 * Adjust the package names if your monorepo does not use packages/<name>.
 */
module.exports = {
  forbidden: [
    {
      name: 'core-no-infra',
      comment:
        'packages/core is the domain: it defines ports and does not know who implements them. ' +
        'If you need something from an adapter, what is missing is a port.',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { path: '^packages/(adapters|analyzers|api|cli|web)' },
    },
    {
      name: 'core-no-infra-packages',
      comment:
        '@codemind/core must not depend on @codemind infra packages as npm dependencies.',
      severity: 'error',
      from: { path: '^packages/core' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'],
        path: '^@codemind/(adapter|analyzer|api|cli|web)',
      },
    },
    {
      name: 'core-no-transport',
      comment:
        'packages/core does not know the transport: not fastify, not HTTP, not status codes. ' +
        'Throw domain errors and let the HTTP layer translate them.',
      severity: 'error',
      from: { path: '^packages/core' },
      to: { dependencyTypes: ['npm', 'npm-dev'], path: '^(fastify|@fastify/|node:http)' },
    },
    {
      name: 'analyzers-are-siblings',
      comment:
        'An analyzer implements AnalyzerPort and knows nothing about the others. That the TypeScript ' +
        'analyzer cannot import from the PHP one is what makes language independence ' +
        'testable.',
      severity: 'error',
      from: { path: '^packages/analyzers/([^/]+)/' },
      to: { path: '^packages/analyzers/(?!$1)([^/]+)/' },
    },
    {
      name: 'analyzers-no-io',
      comment:
        'An analyzer reads only the content it receives (code-analysis, "Analysis contract"): no ' +
        'file system, network, process spawning or code execution. Loading its own parser goes through ' +
        'node:module and node:path, which stay allowed. The only gaps: global fetch and createRequire(...) ' +
        'are not imports, so only code review guards them.',
      severity: 'error',
      from: { path: '^packages/analyzers/' },
      to: {
        dependencyTypes: ['core'],
        path:
          '^(node:)?(fs|net|tls|dgram|dns|http|https|http2|child_process|worker_threads|cluster|vm|wasi|inspector|sqlite)(/|$)',
      },
    },
    {
      name: 'api-no-sql',
      comment:
        'The HTTP layer validates, delegates and serializes. Data access lives in store-postgres.',
      severity: 'error',
      from: { path: '^packages/api' },
      to: { dependencyTypes: ['npm'], path: '^(pg|postgres|drizzle-orm|knex)$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(tests?|fixtures|seeds)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
