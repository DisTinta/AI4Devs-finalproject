/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-no-infra',
      comment:
        'packages/core must not import from adapters, analyzers, api, cli, or web. ' +
        'These are infrastructure concerns; core only defines ports that they implement.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: {
        path: '^packages/(adapters|analyzers|api|cli|web)',
      },
    },
    {
      name: 'core-no-infra-packages',
      comment:
        '@codemind/core must not depend on @codemind infra packages as npm dependencies.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'],
        path: '^@codemind/(adapter|analyzer|api|cli|web)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
