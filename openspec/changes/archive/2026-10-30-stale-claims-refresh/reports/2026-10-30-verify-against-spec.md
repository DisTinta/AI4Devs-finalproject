# Verify against spec: stale-claims-refresh (DIS-42)

- Date: 2026-10-30
- Change: stale-claims-refresh (task 15.4), inline mode (`docs/AUTONOMOUS-RUN.md` §6)
- Scope: `git diff origin/final-project-CRN...HEAD` (at `bedc953`) against the three delta specs `explain`, `graph-store` and `golden-answers`.

*Agent's text.* The audit ran in the agent's session, delegated to a fresh read-only subagent with no context of the implementation, following `ai-specs/skills/verify-against-spec/SKILL.md`. The agent checked its findings against the code and wrote this report. Unit run: `npx vitest run tests/unit/explain tests/unit/store tests/unit/seed`, 27 files and 286 tests passed. The integration specs were read for this audit and run green afterwards with `DATABASE_URL` (addendum).

**Verdict: conforms.** No Blocker, no Major; Minor findings only, each with its destination below.

## 1. Requirements implemented correctly

Explain, "Stale claim refresh":
- **Due claims, the cap of 3, newest first:** `packages/core/src/explain/stale-refresh.ts` (`isDue`, `MAX_STALE_REFRESHES`). Tests: `tests/unit/explain/stale-refresh.spec.ts` "At most three…", "Only stale L2 inference claims are refreshed", and the selection rules.
- **Only answered answers refresh, after the claim write and before the cache save and the row:** `explain.ts`. Tests: "Nothing is refreshed without a live answered answer"; the `d.order` of `tests/unit/explain/explain.spec.ts`.
- **Step 1, the overlapping sanitised spans** (`no-evidence` without a call when none overlaps). Tests: the selection rules.
- **Step 2, the refresh prompt:** `refresh-prompt.ts`. Tests: `tests/unit/explain/refresh-prompt.spec.ts` and "The refresh prompt holds the stored statement as untrusted data…".
- **Steps 3–4, quarantine, first statement, typing and verification** (`invalid-model-output`, `no-evidence`, `broken-evidence`). Tests: "A refresh without backing…", "A refresh whose verifier is unavailable…".
- **Step 5, the rewrite with the pack's commit** (`superseded`, `store-write-failed`). Tests: "A stale prior claim is refreshed…", "A refresh that is no longer due…".
- **Step 6, how a rewritten claim is shown, the cache entry included.**
- **`LlmUnavailable` / `BudgetExhausted` stop the rest; other errors propagate after the row** (`verifyLatencyMs` handled). Tests: "An unavailable model…", "A failure inside a refresh propagates after the row".
- **Events, declared once, in order.** Tests: the closed-set `it` and "Stale claim events follow the write event…".
- **Usage, `sumVerificationUsage`.** Tests: "The refresh calls count in the answer usage and its row" and the usage `it`s.

Graph-store, "Claim refresh":
- **Postgres:** the validation order in `postgres-store.ts`; the conditional write in `claims.ts` (`CHECK_CLAIM_FILES` holds the project `FOR SHARE`, `LOCK_CLAIM_FOR_REFRESH` holds the claim `FOR UPDATE`); `UPDATE_REFRESHED_CLAIM` keeps `created_at` and sets `updated_at = clock_timestamp()`; the evidence is deleted, then re-inserted. Tests: the four scenarios of `tests/integration/store/claims-refresh.spec.ts`.
- **The double:** `tests/support/in-memory-store.ts`. Tests: the four "(in-memory double)" scenarios of `tests/unit/store/in-memory-store.spec.ts`.
- **End to end:** `tests/integration/explain/stale-refresh.spec.ts`.

Golden-answers: the r3 paths and the nine scenario names match `tests/unit/seed/golden-reviews.spec.ts`. The scenario "The criterion precedes the input…" is checked with git, as designed: `c6983b7` is an ancestor of `134bfcd`, which is an ancestor of `f19d6de`; `git log 134bfcd..f19d6de -- seeds/cache` is empty.

## 2. Requirements missing or partial

No requirement is missing. Partial:

| Severity | Finding | Destination |
|---|---|---|
| Minor | Graph-store: "a refreshed claim SHALL then be read … at the position its unchanged instant of creation gives it" is not asserted on Postgres (the test reads back only `c1`) | A, fixed (design X4, task 3.4) |
| Minor | The double threw an injected `failClaimRefresh` value before the due check, not "once the write has started" | A, fixed (X4) |

## 3. Unspecified behaviour

| Severity | Finding | Destination |
|---|---|---|
| Minor | `REFRESH_SYSTEM_PROMPT` asks to cite only the given ids and to return an empty statement list when the evidence does not support the statement. The spec did not say so | A: added to the explain delta, step 2 (X5) |
| Minor | The core barrel exports `refreshStaleClaims`, `buildRefreshPrompt`, `REFRESH_SYSTEM_PROMPT`, `sumVerificationUsage` and the `StaleRefresh*` types | D, accepted (X6) |
| Question | `refreshClaim` inherits the bounded transient-conflict retry of `atomically` | D, accepted: every attempt re-checks under its locks (X7) |
| Minor | `failClaimRefresh` may throw any value | D, accepted: the propagation scenario needs it (X8) |

## Specific checks

- **Dependency not in the manifest:** none (`node:crypto` and existing packages; no `package.json` change).
- **Authorisation:** the claim's ownership is checked by `WHERE id = $1 AND project_id = $2` and the files' by `CHECK_CLAIM_FILES`, the same in the double.
- **Response field not in the spec:** none. `ClaimRefresh` is exactly `{refreshed:true, evidenceIds}` or `{refreshed:false}`; the event carries `type`, `claimId` and `code`; the `/ask` body is unchanged.
- **Tests weaker than their scenario** (all Minor):
  - (a) Postgres "refreshed in place" never asserted the provenance, and `confidence` was `null` before and after: A, fixed (X4).
  - (b) The double's "no longer due" scenario did not prove the fourth call left `c1` unchanged: A, fixed (X4).
  - (c) The double's "refreshed in place" checked only the object and status: A, fixed (X4).
  - (d) "A refresh without backing" did not search for the no-statements output: A, fixed (X4).
  - (e) The re-index integration test compares `inputSpans` with the raw spans; they equal the sanitised ones because no span is cut: D (X9).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| explain: the 12 scenarios of "Stale claim refresh" | 11 in `tests/unit/explain/stale-refresh.spec.ts`; "A stale claim is refreshed after a re-index" in `tests/integration/explain/stale-refresh.spec.ts` | green |
| explain: "Stale claim events follow the write event and precede the row event" | `tests/unit/explain/stale-refresh.spec.ts` | green |
| explain: the modified "Prior claims show their displayed type and stale warning" | `tests/unit/explain/explain.spec.ts` | green |
| explain: the unchanged scenarios of the modified requirements (Precedence and UNKNOWN answers, Prior claims, Explain events and logging, Answer usage, Query log) | their existing tests in `explain*.spec.ts`, `usage.spec.ts`, `tests/integration/explain/explain.spec.ts` | green |
| graph-store: 4 Postgres scenarios of "Claim refresh" | `tests/integration/store/claims-refresh.spec.ts` | green |
| graph-store: 4 "(in-memory double)" scenarios | `tests/unit/store/in-memory-store.spec.ts` | green |
| golden-answers: 7 scenarios with a test | `tests/unit/seed/golden-reviews.spec.ts` | green |
| golden-answers: "The criterion precedes the input and nothing in the record is rewritten" | none (checked with git, tasks 10d.6, 20.6, 25.6) | absent by design, verified with git |

## Addendum: after the fixes (commit `737e8b8`)

- The fixes of design X2–X5 are in. The explain delta changed first (step 2, step 5, the propagation clause and the fourth variant of "A refresh that is no longer due is superseded and a failed refresh write is reported"), then the tests (RED observed for tasks 5.8 and 5.9), then `stale-refresh.ts`.
- `openspec validate stale-claims-refresh --strict` is valid. `DATABASE_URL=… npx vitest run --project dom --project seed-build --project node`: 185 files, 1975 tests passed, 0 failed. `npm run lint`, `npm run typecheck` and `npm run docs:coverage` are clean. `npm run lint:architecture` has 0 errors; its one warning is an orphan untracked web build file, `packages/web/dist/…`.
- No seed fingerprint input and no answer fingerprint input changed (`stale-refresh.ts`, `tests/**` and the change's artifacts only), so the r3 golden round stays valid.
