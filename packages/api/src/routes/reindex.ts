import type { FastifyInstance } from 'fastify';
import { IndexingDisabled, reindexProject as coreReindexProject } from '@codemind/core';
import type { reindexProject } from '@codemind/core';
import type { DomainErrorMapping, DomainErrorTable } from '../plugins/error-handler.js';
import { errorSchema } from '../schemas/common.js';
import { reindexBodySchema, reindexParamsSchema, reindexResponseSchema } from '../schemas/reindex.js';
import type { ReindexParams, ReindexResponse } from '../schemas/reindex.js';

/** The `503` answer of a stored repository that can no longer be read. */
const SOURCE_UNREADABLE: DomainErrorMapping = { status: 503, message: "the project's source cannot be read", details: () => ({}) };

/**
 * The domain error table of `POST /api/projects/{projectId}/index` (index-endpoint design U5): fixed
 * messages and empty details, so no path, no received value and no text of the original error ever
 * reaches the answer. `INVALID_GRAPH` is deliberately absent: it, like any other failure, answers
 * `500` `INTERNAL` through the global handler, which logs it.
 */
export const REINDEX_DOMAIN_ERRORS: DomainErrorTable = new Map<string, DomainErrorMapping>([
  ['INDEXING_DISABLED', { status: 403, message: 'indexing disabled (fixtures-only mode)', details: () => ({}) }],
  ['PROJECT_NOT_FOUND', { status: 404, message: 'project not found', details: () => ({}) }],
  [
    'FORBIDDEN_PATH',
    { status: 403, message: "the project's repository is outside the allowed repositories directory", details: () => ({}) },
  ],
  ['NOT_A_GIT_REPOSITORY', SOURCE_UNREADABLE],
  ['EMPTY_REPOSITORY', SOURCE_UNREADABLE],
]);

/** How the reindex route is registered. */
export interface ReindexRouteOptions {
  /** The use case; core's `reindexProject` when absent. A test seam only. */
  reindex?: typeof reindexProject;
}

/**
 * Registers `POST /api/projects/{projectId}/index` (index-endpoint design U5, U6): validates the
 * request, re-indexes the stored project to completion with the app's indexing dependencies, writes
 * one completion line with counters only and answers `202`. Without indexing dependencies it answers
 * `INDEXING_DISABLED` before any call to the store. A request without a body is handled as `{}`.
 *
 * @param app The instance to register the route on.
 * @param options The use case seam.
 */
export function registerReindexRoute(app: FastifyInstance, options: ReindexRouteOptions = {}): void {
  const reindex = options.reindex ?? coreReindexProject;
  const schema = {
    params: reindexParamsSchema,
    body: reindexBodySchema,
    response: {
      202: reindexResponseSchema,
      400: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
      500: errorSchema,
      503: errorSchema,
    },
  };
  app.post(
    '/api/projects/:projectId/index',
    {
      schema,
      config: { domainErrors: REINDEX_DOMAIN_ERRORS },
      // A request with no `Content-Type` and no content leaves the body undefined: it is the body `{}`.
      preValidation: async (request) => {
        if (request.body === undefined) request.body = {};
      },
    },
    async (request, reply): Promise<ReindexResponse> => {
      const { projectId } = request.params as ReindexParams;
      const indexing = app.deps.indexing;
      if (indexing === undefined) throw new IndexingDisabled();
      const started = performance.now();
      const report = await reindex(
        {
          store: app.deps.store,
          sourceTree: app.deps.source,
          git: indexing.git,
          analyzerFor: indexing.analyzerFor,
          inTransaction: indexing.inTransaction,
        },
        { projectId, allowedRoot: indexing.allowedRoot, workspaceRoot: app.deps.workspaceRoot },
      );
      // Counters only: an event carries a file path, so events are counted, never logged.
      request.log.info(
        {
          projectId: report.projectId,
          mode: 'full',
          filesQueued: report.files,
          redactions: report.events.length + report.commitEvents.length,
          cacheEntriesInvalidated: report.cacheEntriesInvalidated,
          durationMs: Math.round(performance.now() - started),
        },
        'reindex completed',
      );
      void reply.code(202);
      return {
        projectId: report.projectId,
        mode: 'full',
        analyzer: indexing.analyzerName(report.language),
        indexedCommit: report.indexedCommit,
        filesQueued: report.files,
        filesSkipped: 0,
        cacheEntriesInvalidated: report.cacheEntriesInvalidated,
      };
    },
  );
}
