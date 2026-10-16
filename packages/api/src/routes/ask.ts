import type { FastifyInstance } from 'fastify';
import { createInMemoryVerificationCache, explain as coreExplain } from '@codemind/core';
import type { explain, ExplainAnswer } from '@codemind/core';
import { askBodySchema, askParamsSchema, askResponseSchema } from '../schemas/ask.js';
import type { AskBody, AskParams, AskResponse } from '../schemas/ask.js';
import { errorSchema } from '../schemas/common.js';

/** How the ask route is registered. */
export interface AskRouteOptions {
  /** The use case; core's `explain` when absent. A test seam only (DIS-78 design U3). */
  explain?: typeof explain;
}

/**
 * The public form of an answer of `explain` (DIS-78 design U3): an `UNKNOWN` keeps its reason and,
 * only for `llm-required`, its message; an answered question gets public evidence ids `ev-1`, `ev-2`…
 * in evidence order, `path` published as `file`, and only the fields of `readme.md` §4. A statement
 * citing an id absent from the evidence breaks the use case's contract: it throws, never drops nor
 * invents an id.
 *
 * @param answer The answer of `explain`.
 * @returns The `200` body.
 */
export function toPublicAnswer(answer: ExplainAnswer): AskResponse {
  if (answer.kind === 'unknown') {
    const { reason, message } = answer;
    return { answer: 'UNKNOWN', reason, ...(message !== undefined && { message }), statements: [], evidence: [] };
  }
  const publicIds = new Map(answer.evidence.map((entry, i) => [entry.id, `ev-${i + 1}`]));
  const publicId = (id: string): string => {
    const found = publicIds.get(id);
    if (found === undefined) throw new Error('a statement cites an evidence id absent from the answer');
    return found;
  };
  const { usage } = answer;
  return {
    answer: answer.answer,
    statements: answer.statements.map(({ text, type, verification, evidenceIds }) => ({
      text,
      type,
      verification,
      evidenceIds: evidenceIds.map(publicId),
    })),
    evidence: answer.evidence.map(({ id, path, startLine, endLine, excerpt }) => ({
      id: publicId(id),
      file: path,
      startLine,
      endLine,
      excerpt: excerpt as string,
    })),
    confidence: answer.confidence,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      baselineTokens: usage.baselineTokens,
      baselineEstimator: usage.baselineEstimator,
      savingsPct: usage.savingsPct,
      costUsd: usage.costUsd,
      latencyMs: usage.latencyMs,
      cacheHit: usage.cacheHit,
      generation: { ...usage.generation },
      verification: { ...usage.verification },
    },
  };
}

/**
 * Registers `POST /api/projects/{projectId}/ask` (DIS-78 design U3): validates the request, resolves
 * the project in the store (whatever the question), answers with `explain` and returns the public
 * form of the answer. One verification cache is created here and shared by every request of this
 * app (D9).
 *
 * @param app The instance to register the route on.
 * @param options The use case seam.
 */
export function registerAskRoute(app: FastifyInstance, options: AskRouteOptions = {}): void {
  const answer = options.explain ?? coreExplain;
  const verificationCache = createInMemoryVerificationCache();
  const schema = {
    params: askParamsSchema,
    body: askBodySchema,
    response: { 200: askResponseSchema, 400: errorSchema, 404: errorSchema, 429: errorSchema, 500: errorSchema, 503: errorSchema },
  };
  app.post('/api/projects/:projectId/ask', { schema }, async (request) => {
    const { projectId } = request.params as AskParams;
    const body = request.body as AskBody;
    const project = await app.deps.store.getProject(projectId);
    const result = await answer(
      { ...app.deps, verificationCache },
      { projectId: project.id, question: body.question, ...(body.tokenBudget !== undefined && { tokenBudget: body.tokenBudget }) },
    );
    return toPublicAnswer(result);
  });
}
