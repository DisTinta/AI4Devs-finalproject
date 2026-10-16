import type { FastifyInstance } from 'fastify';
import { createInMemoryVerificationCache, explain as coreExplain } from '@codemind/core';
import type { explain } from '@codemind/core';
import { askBodySchema, askParamsSchema } from '../schemas/ask.js';
import type { AskBody, AskParams } from '../schemas/ask.js';

/** How the ask route is registered. */
export interface AskRouteOptions {
  /** The use case; core's `explain` when absent. A test seam only (DIS-78 design U3). */
  explain?: typeof explain;
}

/**
 * Registers `POST /api/projects/{projectId}/ask` (DIS-78 design U3): validates the request, resolves
 * the project in the store (whatever the question), answers with `explain` and returns the answer.
 * One verification cache is created here and shared by every request of this app (D9).
 *
 * @param app The instance to register the route on.
 * @param options The use case seam.
 */
export function registerAskRoute(app: FastifyInstance, options: AskRouteOptions = {}): void {
  const answer = options.explain ?? coreExplain;
  const verificationCache = createInMemoryVerificationCache();
  app.post('/api/projects/:projectId/ask', { schema: { params: askParamsSchema, body: askBodySchema } }, async (request) => {
    const { projectId } = request.params as AskParams;
    const body = request.body as AskBody;
    const project = await app.deps.store.getProject(projectId);
    return answer(
      { ...app.deps, verificationCache },
      { projectId: project.id, question: body.question, ...(body.tokenBudget !== undefined && { tokenBudget: body.tokenBudget }) },
    );
  });
}
