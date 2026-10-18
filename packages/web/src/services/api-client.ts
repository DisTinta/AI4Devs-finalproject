/**
 * The typed client of the CODEMIND API (web-foundation; DIS-58 design D9, D10, D20).
 *
 * Every call uses a relative URL, so the page reaches the API from its own origin (the Vite proxy in
 * local development, design D8). The response types are declared once, here, and the contract test
 * `tests/unit/web/api-contract.spec.ts` makes `npm run typecheck` fail when they drift from the API's
 * schemas. This module never imports the API package.
 *
 * @module
 */

/** The body of `GET /health`. */
export interface HealthResponse {
  /** Always `'ok'`: any other value is treated as an unavailable API. */
  status: 'ok';
}

/** The body of `POST /api/projects/{projectId}/ask`. */
export interface AskRequest {
  /** The question, 5 to 500 code points. */
  question: string;
  /** The token budget of the context pack; absent, the API's default. */
  tokenBudget?: number;
  /** Whether to answer from the answer cache; absent, the API's default (`true`). */
  useCache?: boolean;
}

/** A typed statement of an answered question. */
export interface AskStatement {
  /** The statement text. */
  text: string;
  /** Observed (`FACT`) or inferred (`INFERENCE`). */
  type: 'FACT' | 'INFERENCE';
  /** How the semantic check verified it. */
  verification: 'entailed' | 'cited';
  /** The public ids (`ev-1`, `ev-2`…) of the evidence it cites. */
  evidenceIds: string[];
}

/** One piece of evidence cited by an answered question. */
export interface AskEvidence {
  /** Public id, `ev-1`, `ev-2`… in evidence order. */
  id: string;
  /** Repository-relative path of the cited file. */
  file: string;
  /** First cited line, 1-based. */
  startLine: number;
  /** Last cited line, inclusive. */
  endLine: number;
  /** The cited lines. */
  excerpt: string;
}

/** The usage of an answered question (`readme.md` §4). */
export interface AskUsage {
  /** Input tokens of the whole answer. */
  inputTokens: number;
  /** Output tokens of the whole answer. */
  outputTokens: number;
  /** Tokens of the naive baseline the savings are measured against. */
  baselineTokens: number;
  /** How the baseline was estimated. */
  baselineEstimator: 'chars-div-4';
  /** Percentage saved against the baseline. */
  savingsPct: number;
  /** Cost of the answer in US dollars. */
  costUsd: number;
  /** Latency of the answer in milliseconds. */
  latencyMs: number;
  /** Whether the answer came from the answer cache. */
  cacheHit: boolean;
  /** The generation call. */
  generation: { inputTokens: number; outputTokens: number; costUsd: number };
  /** The verification calls. */
  verification: {
    calls: number;
    cacheHits: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
  };
}

/** An answered question: the answer, its statements, the cited evidence, the confidence and the usage. */
export interface AskAnswered {
  /** The answer text. */
  answer: string;
  /** Its typed statements. */
  statements: AskStatement[];
  /** The cited evidence. */
  evidence: AskEvidence[];
  /** The confidence, from 0 to 1. */
  confidence: number;
  /** The usage. */
  usage: AskUsage;
}

/** Why the API answered `UNKNOWN`. */
export type UnknownReason =
  | 'no-anchor'
  | 'llm-required'
  | 'over-budget'
  | 'invalid-model-output'
  | 'no-evidence'
  | 'broken-evidence';

/** An honest `UNKNOWN`: no statement and no evidence. */
export interface AskUnknown {
  /** Discriminant. */
  answer: 'UNKNOWN';
  /** Why. */
  reason: UnknownReason;
  /** Only for `llm-required`. */
  message?: string;
  /** Always empty. */
  statements: never[];
  /** Always empty. */
  evidence: never[];
}

/** The `200` body of `POST /api/projects/{projectId}/ask`: an `UNKNOWN` or an answered question. */
export type AskResponse = AskUnknown | AskAnswered;

/** The single error format of the API (`api-foundation`, "Single error format"). */
export interface ApiErrorBody {
  /** The error. */
  error: {
    /** A stable code, such as `PROJECT_NOT_FOUND`. */
    code: string;
    /** The fixed message of that code. */
    message: string;
    /** Extra data of the code; `{}` when there is nothing to add. */
    details: Record<string, unknown>;
  };
}

/** The API answered with its single error format: a status of `400` or more and an {@link ApiErrorBody}. */
export class ApiError extends Error {
  /** The response status. */
  readonly status: number;
  /** The error code of the body. */
  readonly code: string;
  /** The details of the body, unchanged. */
  readonly details: Record<string, unknown>;

  /**
   * @param status - The response status.
   * @param body - The error of the response body.
   */
  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

/**
 * The API did not answer as the API: the request failed, the body is not the API's, or the health check
 * ran out of time. The original failure is kept as `cause`.
 */
export class ApiUnavailableError extends Error {
  /** The original failure. Declared here: the web compiles with `lib: ES2020`, which has no `ErrorOptions`. */
  readonly cause: unknown = undefined;
  /** The response status, when a response arrived. */
  readonly status: number | undefined = undefined;

  /**
   * @param cause - The original failure.
   * @param status - The response status, when a response arrived.
   */
  constructor(cause: unknown, status?: number) {
    super('the API is unavailable');
    this.name = 'ApiUnavailableError';
    this.cause = cause;
    this.status = status;
  }
}

/** Whether a value is a JSON object: not `null`, not an array. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a body is in the API's single error format (design D9). */
function isErrorBody(body: unknown): body is ApiErrorBody {
  if (!isJsonObject(body) || !isJsonObject(body.error)) {
    return false;
  }
  const { code, message, details } = body.error;
  return typeof code === 'string' && typeof message === 'string' && isJsonObject(details);
}

/**
 * Sends one request to the API and returns its `2xx` JSON body when `isExpected` accepts it.
 *
 * @throws ApiError when the API answered in its error format.
 * @throws ApiUnavailableError for anything else: the request failed, the body is not JSON, or it is not
 * the body the API answers (design D9).
 */
async function send(
  path: string,
  init: RequestInit,
  isExpected: (body: Record<string, unknown>) => boolean,
): Promise<unknown> {
  let status: number | undefined;
  let body: unknown;
  try {
    const response = await fetch(path, init);
    status = response.status;
    body = JSON.parse(await response.text());
  } catch (failure) {
    throw new ApiUnavailableError(failure, status);
  }
  if (status >= 200 && status < 300 && isJsonObject(body) && isExpected(body)) {
    return body;
  }
  if (status >= 400 && isErrorBody(body)) {
    throw new ApiError(status, body.error);
  }
  throw new ApiUnavailableError(new Error(`unexpected response ${status}`), status);
}

/**
 * Checks that the API is up: `GET /health`.
 *
 * @returns The body `{ status: 'ok' }`.
 */
export async function getHealth(): Promise<HealthResponse> {
  return (await send('/health', { method: 'GET' }, (body) => body.status === 'ok')) as HealthResponse;
}

/**
 * Asks a question about a project: `POST /api/projects/{projectId}/ask`.
 *
 * @param projectId - The project id, percent-encoded as one path segment.
 * @param body - The question and its optional settings.
 * @returns The response body unchanged: an answered question or an `UNKNOWN`.
 */
export async function ask(projectId: string, body: AskRequest): Promise<AskResponse> {
  return (await send(`/api/projects/${encodeURIComponent(projectId)}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, () => true)) as AskResponse;
}
