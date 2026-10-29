import { z } from 'zod';
import { projectIdParamsSchema } from './common.js';

// The payload of `POST /api/projects/{projectId}/index` (index-endpoint design U5): the only
// description of it. The endpoint accepts no path, language or framework.

/** The path parameters of `POST /api/projects/{projectId}/index`: the project id. */
export const reindexParamsSchema = projectIdParamsSchema;

/** The path parameters of `POST /api/projects/{projectId}/index`. */
export type ReindexParams = z.infer<typeof reindexParamsSchema>;

/**
 * The body of `POST /api/projects/{projectId}/index`: an optional `incremental` flag, accepted and
 * without effect until the incremental plan exists. Any other key (`rootPath`, `language`…) is
 * rejected. It has no required key, so an absent body is the same as `{}`.
 */
export const reindexBodySchema = z.strictObject({
  incremental: z.boolean().optional(),
});

/** The body of `POST /api/projects/{projectId}/index`. */
export type ReindexBody = z.infer<typeof reindexBodySchema>;

/** The `202` body of `POST /api/projects/{projectId}/index`: the counters of the completed reindex. */
export const reindexResponseSchema = z.object({
  projectId: z.string(),
  mode: z.literal('full'),
  analyzer: z.string(),
  indexedCommit: z.string(),
  filesQueued: z.int(),
  filesSkipped: z.int(),
  cacheEntriesInvalidated: z.int(),
});

/** The `202` body of `POST /api/projects/{projectId}/index`. */
export type ReindexResponse = z.infer<typeof reindexResponseSchema>;
