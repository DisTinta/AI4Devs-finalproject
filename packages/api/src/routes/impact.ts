import type { FastifyInstance } from 'fastify';
import { impact as coreImpact } from '@codemind/core';
import type { impact, ImpactReport, InvalidImpactRequest } from '@codemind/core';
import type { DomainErrorMapping, DomainErrorTable } from '../plugins/error-handler.js';
import { errorSchema } from '../schemas/common.js';
import { impactBodySchema, impactParamsSchema, impactResponseSchema } from '../schemas/impact.js';
import type { ImpactBody, ImpactParams, ImpactResponse } from '../schemas/impact.js';

/**
 * The domain error table of `POST /api/projects/{projectId}/impact` (DIS-95 design D4): fixed messages
 * (those of the CLI `impact`, except `invalid request`, the message of every HTTP `400` validation
 * answer) and details built only from the error's fields. The use case reads neither the model nor the
 * source tree, so there is no `BUDGET_EXHAUSTED`, `LLM_UNAVAILABLE` nor `SOURCE_UNAVAILABLE` entry.
 */
export const IMPACT_DOMAIN_ERRORS: DomainErrorTable = new Map<string, DomainErrorMapping>([
  ['PROJECT_NOT_FOUND', { status: 404, message: 'project not found', details: () => ({}) }],
  [
    'INVALID_IMPACT_REQUEST',
    { status: 400, message: 'invalid request', details: (error) => ({ field: (error as InvalidImpactRequest).field }) },
  ],
]);

/** How the impact route is registered. */
export interface ImpactRouteOptions {
  /** The use case; core's `impact` when absent. A test seam only (DIS-95 design D7). */
  impact?: typeof impact;
}

/**
 * The public form of a report of `impact` (DIS-95 design D1): the report without `events`, built field
 * by field (never a spread of the report nor of an entry), so a field core adds later is not published
 * without touching the schema. `staleSince` is sent only on a stale document.
 *
 * @param report The report of `impact`.
 * @returns The `200` body.
 */
export function toPublicReport(report: ImpactReport): ImpactResponse {
  if (report.status === 'unknown') return { status: 'unknown', reason: report.reason };
  const entry = ({ symbol, file, origin, resolution, hops }: (typeof report.direct)[number]) => ({ symbol, file, origin, resolution, hops });
  return {
    status: 'answered',
    direct: report.direct.map(entry),
    indirect: report.indirect.map(entry),
    tests: report.tests.map(({ symbol, file, origin }) => ({ symbol, file, origin })),
    docs: report.docs.map((doc) => (doc.stale ? { path: doc.path, stale: true as const, staleSince: doc.staleSince } : { path: doc.path, stale: false as const })),
    history: report.history.map(({ file, coChangeRate, prs, origin }) => ({ file, coChangeRate, prs: [...prs], origin })),
    risk: { level: report.risk.level, rationale: report.risk.rationale },
  };
}

/**
 * Registers `POST /api/projects/{projectId}/impact` (DIS-95 design D3, D5): validates the request,
 * resolves the project in the store (whatever the change), answers with `impact`, writes the report's
 * events to the request log at `info` and returns the public form of the report.
 *
 * @param app The instance to register the route on.
 * @param options The use case seam.
 */
export function registerImpactRoute(app: FastifyInstance, options: ImpactRouteOptions = {}): void {
  const analyse = options.impact ?? coreImpact;
  const schema = {
    params: impactParamsSchema,
    body: impactBodySchema,
    response: { 200: impactResponseSchema, 400: errorSchema, 404: errorSchema, 429: errorSchema, 500: errorSchema },
  };
  app.post('/api/projects/:projectId/impact', { schema, config: { domainErrors: IMPACT_DOMAIN_ERRORS } }, async (request) => {
    const { projectId } = request.params as ImpactParams;
    const body = request.body as ImpactBody;
    const project = await app.deps.store.getProject(projectId);
    const report = await analyse(
      app.deps.store,
      {
        projectId: project.id,
        change: body.change,
        // Forwarded only when sent: absent, the use case's default applies and stays the single source.
        ...(body.maxHops !== undefined && { maxHops: body.maxHops }),
      },
      { now: app.deps.now },
    );
    // The only event is `query_not_logged`: information, not a system failure. Events hold a code only.
    for (const event of report.events ?? []) request.log.info({ ...event }, 'impact event');
    return toPublicReport(report);
  });
}
