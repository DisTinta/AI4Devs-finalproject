import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  ApiErrorBody,
  AskRequest,
  AskResponse as ClientAskResponse,
  HealthResponse,
} from '../../../packages/web/src/services/api-client';
import type { AskBody, AskResponse as ApiAskResponse } from '../../../packages/api/src/schemas/ask';
import type { ErrorBody, healthResponseSchema } from '../../../packages/api/src/schemas/common';

// DIS-58 design D10, D19: the web declares the API types by hand (frontend-standards §3) and never
// imports the API package; this type-level test, checked by `npm run typecheck` (tests/tsconfig.json),
// fails when a client type drifts from the type the API derives from its own schema.

describe('API types follow the API\'s schemas', () => {
  it('A drift between the client types and the API schemas fails the type check', () => {
    // Arrange / Act: the comparisons are evaluated by the type checker.
    type DriftedAskRequest = Omit<AskRequest, 'question'> & { prompt: string };

    // Assert
    expectTypeOf<HealthResponse>().toEqualTypeOf<z.infer<typeof healthResponseSchema>>();
    expectTypeOf<AskRequest>().toEqualTypeOf<AskBody>();
    expectTypeOf<ClientAskResponse>().toEqualTypeOf<ApiAskResponse>();
    expectTypeOf<ApiErrorBody>().toEqualTypeOf<ErrorBody>();
    // Negative control: a client ask body with `question` renamed must be rejected. If the comparison
    // ever accepted it, this marker would be unused and the type check would fail.
    // @ts-expect-error the drifted body is not the API's ask body
    expectTypeOf<DriftedAskRequest>().toEqualTypeOf<AskBody>();
  });
});
