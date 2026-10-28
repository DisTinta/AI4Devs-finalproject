# Show spec working — ts-await-using-golden-regen (DIS-107)

- Date: 2026-10-28
- Branch: `feature/dis-107-ts-await-using-golden-regen`, PR #81 (CI green before this step: frontend, mutation, quality, scope, secrets, verify)
- Environment: Git Bash, local Docker Postgres (`codemind-postgres-1`, healthy, seeded in step 10), evaluation mode (no `LLM_*` in the shell)
- Task 15.3. Executed in this step, not copied from step 11 (step 11 evidence is consistent with it).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| code-analysis "Other variable forms are not function symbols" (real interface) | `npm run cli -- index <scratch>/ssw-dis107 --name dis-107-ssw --language typescript --framework none --json` over a committed `src/v.ts` with the scenario content plus a positive control `export const keep = () => 2;` on line 14 | `symbols: 3`, `diagnostics: []`; stored symbols `method run 9-9`, `function outer 10-10`, `function keep 14-14` | Yes: no symbol for `await using f` (line 12) nor `using g` (line 13); a plain `const` function is still a symbol (no over-exclusion) | E1, E2 |
| code-analysis, the 12 scenarios of "TypeScript symbol extraction" and the 10 of golden-answers (test level) | `npx vitest run tests/unit/analyzers/typescript tests/unit/seed tests/unit/cache` | 17 files, 104 tests passed | Yes | E3 |
| golden-answers "The versioned golden file is coherent" / `verify` | `npm run verify` | `acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match`, exit 0 | Yes | E4 |
| Regenerated golden answer served from the cache | `npm run cli -- ask acme-shop "¿Cómo se validan los cupones?"` and `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` | exit 0; answer text equal to `seeds/cache/acme-shop.json` Q3 (first 90 characters compared) and Q1 | Yes | E5 |
| Behaviour item task-api Q4 | `npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"` | `UNKNOWN (no-anchor)`, exit 0 | Yes | E5 |
| "Signatures of the reviewed golden answers" | read `reviews` and `seed.analyzerFingerprint` of both golden files and the seed header | every entry `reviews.length = 2` (`agent:claude-opus-5-5`, `agent:claude-sonnet-5-5`, 2026-10-28); fingerprint `sha256:46a57023…` in the seed header and both files | Yes | E6 |
| Error case: unknown golden project | `npm run cache:build -- --project nope` | `{"error":{"code":"USAGE","message":"unknown golden project",...}}`, exit 1; `git status --short seeds` empty | Yes | E7 |
| Error case: invalid panel outputs rejected | `npx vitest run tests/unit/seed/golden-reviews.spec.ts -t "Invalid panel outputs are rejected"` | 1 passed (includes the new `linear:DIS-107/description` and DIS-33 panelist copies) | Yes | E7 |

## Evidence

E1 — index through the CLI:

```
[3/6] redact
[4/6] analyze
[5/6] history
[6/6] save
{"projectId":"a306e73e-…","indexedCommit":"aa428f7…","framework":"none","frameworkSource":"explicit","files":1,"filesDeleted":0,"symbols":3,"commits":1,"fileCommits":1,"edges":{"total":0,"exact":0,"heuristic":0},"events":[],"commitEvents":[],"diagnostics":[],"skipped":[]}
exit=0
```

E2 — read-only query of the stored symbols (`docker compose exec postgres psql`, joined on `file.project_id`):

```
method|run|9|9|run()
function|outer|10|10|export function outer(): void
function|keep|14|14|export const keep = () =>
```

E3 — `Test Files  17 passed (17)`, `Tests  104 passed (104)`.

E4 — `verify`:

```
✓ task-api Q2 ¿Qué hace buildPage con los resultados paginados?
✓ task-api Q3 ¿Qué transiciones de estado son válidas?
acme-shop: 3/3 golden answers match
task-api: 3/3 golden answers match
exit=0
```

E5 — `ask` (first lines):

```
UNKNOWN (no-anchor)
exit=0
Los cupones se validan en el método `isRedeemable` de la clase `CouponValidator`. Este método comprueba que el código del cupón no esté vacío, ...
statements:
1. [INFERENCE] El método `isRedeemable` en la clase `CouponValidator` comprueba la validez del cupón.
exit=0
```

The acme-shop Q1 output was captured in full and pasted into `docs/DEMO.md` Paso 1 (finding of this review, see the adversarial review).

E6 — golden files:

```
task-api sha256:46a57023… Q1:2 Q2:2 Q3:2
acme-shop sha256:46a57023… Q1:2 Q3:2 Q4:2
-- analyzer-fingerprint: sha256:46a57023…
[{"by":"agent:claude-opus-5-5","date":"2026-10-28"},{"by":"agent:claude-sonnet-5-5","date":"2026-10-28"}]
```

E7 — error cases:

```
{"error":{"code":"USAGE","message":"unknown golden project","details":{"allowed":["acme-shop","task-api"]}}}
exit=1
 Test Files  1 passed (1)
      Tests  1 passed | 8 skipped (9)
```

No screenshot was taken: the change has no user interface (task 12.1).

## State

- Before: `project` 2, `symbol` 185, `claim` 0, `cache_entry` 6.
- After the index: one extra project `dis-107-ssw` with 1 file and 3 symbols.
- Restore: `DELETE FROM project WHERE id = 'a306e73e-…'` (1 row); then `project` 2, `symbol` 185, files of the deleted project 0, `claim` 0, `cache_entry` 6 (also 0 / 6 after `verify` and the `ask` calls).
- Restored: yes. `git status --short` shows only `.claude/sdd-harness.env` (the author's, untouched) before the review fixes.
- Residue outside the repository: the scratch repository `ssw-dis107` in the session scratchpad (shell policy blocks recursive deletion; safe to delete).

## Not demonstrated

- The web screens and the `demo:ask` figures (API) were not exercised: no UI change, and the figures are declared as DIS-104 captures in `docs/DEMO.md` (design Follow-ups E9, destination C).

## Handoff

The change is demonstrably working: through the real CLI, `await using` and `using` module-level statements produce no symbol while a `const` function still does; the regenerated and signed golden answers are served from the cache and `verify` passes for both projects. No screenshot was left at the repository root.
