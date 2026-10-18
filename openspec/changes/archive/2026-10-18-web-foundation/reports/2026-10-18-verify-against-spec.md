# Verify Against Spec — web-foundation (DIS-58)

- Date: 2026-10-18
- Change: web-foundation (DIS-58), task 15.5
- Compared: `specs/web-foundation/spec.md` (as delivered at `1e86251`) and the DIS-58 DoD against the code
  of `feature/DIS-58-web-scaffolding` (`git diff origin/feature/entrega-2-CRN...HEAD`). Run in the
  agent's own context in the autonomous run (ADR `20261016-autonomous-workflow-run-entrega-2`).

## 1. Requirements implemented correctly

| Requirement | Code | Proof |
|---|---|---|
| Routes of the web client | `packages/web/src/router.tsx:17-21` (`/`, `/p/:projectId`, `*`); `components/AppHeader.tsx:11-14` (banner, «CODEMIND», tagline); `components/PageFrame.tsx:19-22` (banner + one `main`); `components/PendingScreen.tsx:22-24` (`h1`, «Esta pantalla está en construcción.», `projectId`); `pages/NotFoundPage.tsx:14-20` (`h1`, `Link` to `/`) | `packages/web/src/router.test.tsx:42-90`; live in `2026-10-18-show-spec-working.md` |
| Health check through the API client | `services/api-client.ts` `getHealth` (relative `/health`, `GET`, `status === 'ok'`, default `HEALTH_TIMEOUT_MS` 5 000, `RangeError` before any request) | `services/api-client.test.ts` "Health check …", "Health check time limit" blocks |
| Asking a question through the API client | `ask` (`encodeURIComponent`, `content-type: application/json`, `JSON.stringify(body)`, `() => true` for any `2xx` JSON object, no `Deadline`) | `api-client.test.ts:100-138`, "A question has no time limit of its own" |
| API errors | `isErrorBody` (`code`/`message` strings, `details` a non-null, non-array object) and `ApiError` (`status`, `code`, `message`, `details`) | `api-client.test.ts:151-182` |
| Unavailable API | `send`: `fetch` rejection → `cause` is the rejection; `JSON.parse` `SyntaxError`; `unexpected response <status>`; time limit → `TimeoutError`; `status` kept when a response arrived | `api-client.test.ts:184-241` (ten calls) |
| Cancellation by the caller | `send`: already-aborted signal throws its reason before `fetch`; any failure with the caller's signal aborted rethrows its reason; `Deadline` forwards the caller's abort | `api-client.test.ts` "Cancellation by the caller" (four tests) |
| API types follow the API's schemas | types written once in `api-client.ts`; `tests/unit/web/api-contract.spec.ts` with a `@ts-expect-error` negative control; `.dependency-cruiser.cjs` rule `web-no-backend` | `npm run typecheck` green; `npm run lint:architecture` 0 errors; probe RED in the step 9 report (4.8, 4.9) |
| Same-origin access in local development | `packages/web/vite.config.ts:10-24` (one `apiProxy` for `server` and `preview`); no `VITE_*` nor `import.meta.env` under `packages/web/src` | `tests/unit/web/vite-config.spec.ts`; live proxy up/down in the show-spec-working report |
| Theme colours and minimum contrast | `packages/web/src/index.css:16-41` (tokens of D4, font, radii); `theme-contrast.ts` (WCAG 2.2 formula) | `packages/web/src/theme.test.ts` (three tests) |
| Accessibility gate on the real routes | root script `test:a11y`; `tests/a11y/smoke.a11y.test.tsx` (real `routes`, three paths, `lang`/`title`, negative control); scaffold deleted | `npm run test:a11y` green (2 tests) |
| Component test environment | `vitest.config.ts:36-41` (`environmentMatchGlobs`, `setupFiles`); `tests/support/jsdom-setup.ts` (cleanup, D26 `Request`) | `router.test.tsx:93-114`; the link click of "An unknown path …" proves D26 |

DIS-58 DoD: `npm run test:a11y` and an RTL test (`router.test.tsx`) run in `frontend.yml` (the CI half is
task 15.3 on the PR run); the Tailwind and RTL + jsdom *target* notes are gone from
`docs/frontend-standards.md` §1 and the Playwright note stays (design D13).

## 2. Requirements missing or partial

1. **"The gate runs in CI instead of warning"** — partial. Quote: "the frontend CI workflow SHALL run the
   script instead of printing that it is missing". `.github/workflows/frontend.yml:65-72` still had the
   `if … npm run | grep -q ' test:a11y' … else echo "WARNING: …"` branch: today it runs the script, but
   a removed or renamed script turns the gate back into a warning on a green job. → Fixed in this change
   (design D32, Follow-ups #1): the step is `run: npm run test:a11y`; the scenario now states that a
   missing script fails the job.
2. **"Health check through the API client"** — a limit is accepted when it is "a positive finite
   number", but `setTimeout` fires at once above 2 147 483 647 ms, so `getHealth({ timeoutMs:
   2_147_483_648 })` did not honour its limit (it timed out immediately; observed as RED, with Node's
   `TimeoutOverflowWarning`). → Fixed by TDD (Follow-ups #2): `RangeError` above `MAX_TIMEOUT_MS`; the
   scenario "An invalid limit is refused" adds `2147483648`.

No other requirement is missing. The scenarios validated by command or by hand ("The development server
serves the three paths", "The health check reaches the API through the development server", "The web does
not import the API or the backend") have evidence in the step 9, step 10 and show-spec-working reports.

## 3. Unspecified behaviour

| Code | Behaviour not in the spec | Decision |
|---|---|---|
| `packages/web/vite.config.ts:11-12` | Vite matches a proxy key as a prefix: `/healthz`, `/health/x` are forwarded too; the spec said the path "is `/health`" | Added to the spec: "starts with `/api` or with `/health`" (design D8, Follow-ups #3). No route of the web starts with either |
| `services/api-client.ts` `HEALTH_TIMEOUT_MS`, `MAX_TIMEOUT_MS` (exports) | constants made public | Keep: they are the spec's default and bound, exported so DIS-60 does not repeat the numbers (Follow-ups #6, D) |
| `components/PageFrame.tsx:19` | white container with border and radius around banner and main | Keep: the wireframe container (spec "Theme … from the wireframes", D30) |
| `pages/NotFoundPage.tsx:17` | `focus-visible` outline on the link | Keep: frontend-standards §3 (visible focus), checked in the browser |
| `index.css:13-14` | `@source not` for the test files | Keep: build configuration (D29), no runtime behaviour |
| `api-client.ts` `ApiError` on `GET /health` | a health answer `≥ 400` in the error format is an `ApiError` | Specified: the "API errors" requirement is not limited to `ask` |

Specific checks:

- Dependencies: every import resolves to the manifests (`react-router` in `packages/web/package.json`;
  `@testing-library/*`, `jsdom`, `axe-core` in the root `devDependencies`; `@tailwindcss/vite` and
  `tailwindcss` in the web `devDependencies`). No undeclared dependency.
- Authorisation: the spec requires none (no API change, no auth in the product).
- Response fields: the client returns the API body unchanged and adds none; the error classes carry
  exactly `status`/`code`/`message`/`details` and `cause`/`status`.
- Weaker tests than their scenario: none found. "A caller-chosen limit is honoured" asserts
  "rejects as unavailable", as its THEN says (the `TimeoutError` cause is asserted by the default-limit
  scenario).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The root path shows the Screen 1 placeholder | `packages/web/src/router.test.tsx` | green |
| A project path shows the Screen 2 placeholder with its id | `packages/web/src/router.test.tsx` | green |
| An unknown path shows the not-found screen and leads back | `packages/web/src/router.test.tsx` | green |
| The development server serves the three paths | manual: step 10 and show-spec-working (browser) | green (by hand) |
| A healthy API resolves the health check | `packages/web/src/services/api-client.test.ts` | green |
| A hanging API makes the health check time out | `api-client.test.ts` | green |
| A caller-chosen limit is honoured | `api-client.test.ts` | green |
| An invalid limit is refused | `api-client.test.ts` (now with `2147483648`) | green |
| An answered question is resolved as received | `api-client.test.ts` | green |
| An UNKNOWN is resolved as received | `api-client.test.ts` | green |
| A question has no time limit of its own | `api-client.test.ts` | green |
| The project id is encoded as one path segment | `api-client.test.ts` | green |
| The error format becomes an API error | `api-client.test.ts` | green |
| Failures that are not the API's answer become unavailable-API errors | `api-client.test.ts` | green |
| Aborting a pending question cancels the request | `api-client.test.ts` | green |
| Aborting a pending health check cancels the request | `api-client.test.ts` | green |
| Aborting while the body is read rejects with the caller's reason | `api-client.test.ts` | green |
| An already-aborted signal sends no request | `api-client.test.ts` | green |
| A drift between the client types and the API schemas fails the type check | `tests/unit/web/api-contract.spec.ts` (`npm run typecheck`) | green |
| The web does not import the API or the backend | `npm run lint:architecture` + probe (step 9 report) | green (by command) |
| Both servers forward the API paths | `tests/unit/web/vite-config.spec.ts` | green |
| The health check reaches the API through the development server | manual: step 10 and show-spec-working | green (by hand) |
| Every declared text pair meets 4.5:1 | `packages/web/src/theme.test.ts` | green |
| Wireframe accent colours are never text | `packages/web/src/theme.test.ts` | green |
| A token changed to a low-contrast value fails the theme test | `packages/web/src/theme.test.ts` | green |
| The three routes have no axe violations | `tests/a11y/smoke.a11y.test.tsx` | green |
| The negative control proves axe runs | `tests/a11y/smoke.a11y.test.tsx` | green |
| The gate runs in CI instead of warning | `npm run test:a11y` locally; CI half in task 15.3 | green locally; CI pending the PR run |
| Rendered output does not leak between tests | `packages/web/src/router.test.tsx` | green |

Runs after the fixes (2026-10-18): `npx vitest run packages/web tests/a11y tests/unit/web` 6 files, 26
tests passed; `npm run test:a11y` 2 passed; `npm run typecheck`, `npm run lint` green; `npm run
lint:architecture` 0 errors (4 `no-orphans` warnings: `sample-projects.ts`, imported only from
`tests/a11y`, the local `packages/web/dist` build and the TypeScript analyzer, none an error).

## Verdict

After the two fixes above and the spec precision of block 3, the implementation does what the spec
says, no less and no more.
