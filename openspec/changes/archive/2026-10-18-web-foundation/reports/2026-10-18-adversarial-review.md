## Adversarial review

- Date: 2026-10-18
- Change: web-foundation (DIS-58), task 15.6
- Scope: `git diff origin/feature/entrega-2-CRN...HEAD` (44 files) plus the change artifacts. Run in a
  session other than the one that implemented the change (the pre-merge step of the autonomous run, ADR
  `20261016-autonomous-workflow-run-entrega-2`), in the agent's own context.

### What was checked

1. **Spec and task alignment.** Every requirement has scenarios and every scenario a test with its exact
   name, or a command/manual check named in task 7.3 (table in `2026-10-18-verify-against-spec.md`).
   Tasks 0–12 marked `[x]` have their evidence in the step 9 and step 10 reports (RED runs of 2.5, 4.8,
   4.9, 6.2; characterisation of 5.5; mutation 9.4; privacy 9.5). History: `git log 9542a28^..HEAD --
   specs/` is empty, so the spec was not edited after implementation to match the code (the edits of this
   review are recorded below and in the spec-audit addendum).
2. **Hostile input**, read in `services/api-client.ts`, `router.tsx`, `vite.config.ts`:
   - `getHealth` limits: `0`, `-1`, `NaN`, `Infinity` → `RangeError`; `2_147_483_648` → **accepted, and
     the timer overflows** (finding 2). `undefined` → default 5 000.
   - `ask` project id: `''` → `/api/projects//ask`, the API's not-found handler answers in the error format
     (`packages/api/src/plugins/error-handler.ts:90`) → `ApiError`; `a/b?c` → one encoded segment (tested);
     a 200-character id → rendered, but clipped by the frame (finding 4).
   - Bodies: empty, HTML, `null`, `[]`, `{"status":"down"}`, Fastify's default, `details: []`, `204`
     (empty → `SyntaxError`), `3xx` after redirects (→ `unexpected response`) — all `ApiUnavailableError`,
     never a silent success.
   - Same request twice / two at once: each `getHealth` owns its `Deadline`; one caller signal shared by
     two calls adds and removes one listener per call (`finally`), so nothing leaks.
   - Caller abort with a custom reason (`abort('x')`) → rejects with `'x'`, as the spec says ("the reason
     of the caller's signal").
   - Routes: `/p/` and `/p/a/b` fall to `*` (not found); `/p/<script>` is text (React escapes it; no
     `dangerouslySetInnerHTML`).
   - Proxy: prefix matching forwards `/healthz` and `/health/x` too (finding 3).
3. **Blast radius.** `vitest.config.ts` now adds `environmentMatchGlobs` and a `setupFiles` entry for
   every test: the setup is guarded by `'document' in globalThis`, so Node tests only pay one `in` check;
   the step 9 report shows the same Node totals before and after. `vitest.stryker.config.ts` keeps the
   base excludes (`mergeConfig` concatenates) and adds the web ones. The root `typecheck` gains a fourth
   `tsc`. `frontend.yml` gains paths. No migration, no API change, no data written by the change. `App.tsx`
   had one importer (`main.tsx`), replaced.
4. **Evidence quality.** The tests assert behaviour at the network boundary (`fetch` double) and through
   accessible queries. Most important test: "Failures that are not the API's answer become unavailable-API
   errors" — it kills the mutant `isJsonObject(details)` → `details !== undefined` in `isErrorBody` (the
   `400` with `details: []` would become an `ApiError`), and the mutant that drops `status` from
   `new ApiUnavailableError(…, status)` (the `[500, 502, 500, 400]` assertion). Existing tests modified:
   `tests/a11y/smoke.example.tsx` replaced by `smoke.a11y.test.tsx` (the spec requires the scaffold gone;
   recorded in the step 9 report, 7.2). In this review, the `api-client.test.ts` case list of "An invalid
   limit is refused" (a test of this change, not of the base branch) gained `2_147_483_648` for the new
   spec case, observed RED before the fix.

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `.github/workflows/frontend.yml:65-72` | The accessibility step kept the kit's fallback: when `npm run` does not list `test:a11y` it prints a warning and passes | Deleting or renaming the script silently turns the gate back into a warning on a green job, against "SHALL run the script instead of printing that it is missing" and `docs/frontend-standards.md` ("a green run must mean the routes were scanned") |
| Minor | `packages/web/src/services/api-client.ts:318` | `timeoutMs` above 2 147 483 647 passed the check; `setTimeout` fires such a delay at once | `getHealth({ timeoutMs: 2_147_483_648 })` rejects as unavailable immediately instead of waiting: a valid-looking limit makes a healthy API look down (RED reproduced, with Node's `TimeoutOverflowWarning`) |
| Minor | `packages/web/vite.config.ts:12` | The `/health` proxy key is a prefix: `/healthz`, `/health-x`, `/health/x` are forwarded to the API | The spec said "is `/health`"; harmless today (no web route starts so), but the spec and the code disagreed |
| Minor | `packages/web/src/components/PendingScreen.tsx:24` | The `projectId` paragraph is monospace with no word break, inside a frame with `overflow-hidden` | A long id without spaces (e.g. 200 characters in the URL) is clipped and unreadable |
| Question | `packages/web/src/router.tsx:17-21` | No `errorElement` on the route table | A render or loader error would show React Router's default English error screen. The placeholders cannot throw and there is no loader, so nothing fails today; the first screen with data owns this decision |

### Fixes applied in this change

1. `frontend.yml`: the step is `run: npm run test:a11y` (design D32); the spec scenario "The gate runs in
   CI instead of warning" now says a missing script fails the job.
2. TDD: RED — `npx vitest run packages/web/src/services/api-client.test.ts -t "An invalid limit is
   refused"` failed with "expected the promise to reject" once `2_147_483_648` was added; GREEN —
   `MAX_TIMEOUT_MS = 2_147_483_647` and `timeoutMs > MAX_TIMEOUT_MS` → `RangeError` (14/14 passed). Spec
   requirement and scenario updated with `/opsx:update` (design D9).
3. Spec aligned to the proxy's prefix matching ("starts with `/api` or with `/health`"; design D8).
4. `break-all` on the id paragraph; checked in the browser at `/p/` + 200 × `x`: the paragraph's
   `scrollWidth` 702 = `clientWidth` 702 inside a 766 px frame (`./2026-10-18-ssw-long-id.png`).
5. Question → destination B (DIS-60), Spanish comment on DIS-60.

After the fixes: `npx vitest run packages/web tests/a11y tests/unit/web` 26/26, `npm run test:a11y` 2/2,
`npm run typecheck`, `npm run lint` and `npm run lint:architecture` (0 errors) green; `openspec validate
web-foundation` passes. No Blocker or Major was raised, so no re-run of this review is required; the
fixes are small and each was re-verified by the check it invalidated.

### Verdict

PASS — no Blockers and no Majors, evidence is sufficient. Every Minor is fixed in this change (A) and the
Question has a destination (B, DIS-60), recorded in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Open the PR and confirm task 15.3 on its CI run (the `Frontend` job now runs `npm run test:a11y`
   with no fallback; Tailwind's Linux binaries under `npm ci`).
2. Archive (`/opsx:archive`) once CI is green, then merge.
