# Test and State Verification Report

- Date: 2026-10-20
- Change: real-model-clean-clone (DIS-103)
- Step: 7 — Review and update existing tests / run tests and verify data state

## Commands executed

- Baseline (0.4) and final run: `DATABASE_URL=postgresql://codemind:codemind@localhost:55432/codemind_test npx vitest run`
  (the throwaway container `dis102-testdb`, port 55432, its own `codemind_test` database; never the
  author's `codemind` database)
- `npx vitest run tests/unit/llm tests/unit/scripts tests/unit/docs tests/unit/cli/long-fetch.spec.ts tests/unit/cli/cache-build.spec.ts`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate packages/adapters/llm/src/long-fetch.ts` (task 2.3b) and `npm run test:mutation`
- `npm run verify` on freshly seeded databases (clones `dis103-live`, `dis103-bash`, `dis103-pwsh`;
  steps 6.2 and 8.2)
- `/privacy-ethics-check` over `git diff feature/entrega-2-CRN...HEAD`
- `git hash-object seeds/graph-dump.sql seeds/cache/acme-shop.json fixtures/build-history.mjs`

## 7.1 Tests reviewed

`grep -rn "300001\|startSequence\|five\|Paso 0\|long-fetch" tests` → `tests/unit/llm/llm-config.spec.ts`,
`tests/unit/scripts/up.spec.ts`, `tests/unit/docs/guides.spec.ts`, `tests/unit/cli/long-fetch.spec.ts`,
`tests/unit/cli/cache-build.spec.ts`. Only the tests of design D10 changed:

| Test file | Change | Why |
|---|---|---|
| `tests/unit/llm/llm-config.spec.ts` | `300001` → `3600001` in "A malformed timeout or URL fails naming the variable"; new "A timeout above 300 s is accepted" | the requirement changes (author decision of 2026-10-20) |
| `tests/unit/scripts/up.spec.ts` | "Up runs the start sequence in order" and "Ctrl+C stops up without a failure line" expect six steps | the requirement changes |
| `tests/unit/docs/guides.spec.ts` | `Probar con un modelo real` in the ordered headings; new "The real-model section says how to try each model"; a stale comment ("the guide has no pair today") dropped | the requirement changes |
| `tests/unit/llm/default-transport.spec.ts` (new) | "Without an injected fetch the request does not use the global fetch", "Without an injected fetch timeouts, refusals and redirects keep their mapping", plus two plain tests (a cut mid-body is `network`; an https base URL is spoken over TLS) | new requirement |
| `tests/unit/scripts/defer-ctrl-c.spec.ts` (new) | "The history step finishes its work before ending on Ctrl+C" | new scenario |

`tests/unit/cli/long-fetch.spec.ts`, `tests/unit/cli/cache-build.spec.ts` and
`tests/integration/git/build-history.spec.ts` are untouched and green. `llm-config.spec.ts`'s existing
plain test "rejects a timeout far above the undici limit" (2147483648) still passes and was not edited.

Scenario ↔ test map: every `#### Scenario:` of both deltas has an `it` of the same name, except the
recorded checks: "A response after 300 s is accepted" (6.4), "Up with Docker unavailable fails naming
its first step" (8.1), "Up builds the fixture history the seed indexed" (6.2), "The guide was followed
on a clean clone in both shells" (8.2) and "The Ollama path was followed on a clean clone" (6.3a–6.3b).
"The web walkthrough names what each screen shows": the automated half is green; the review half was
not re-run because `Recorrido por la web` is unchanged.

## Test results

- Baseline (0.4, before any code, HEAD `027f82e`): 159 files, 1729 tests: 1726 passed, 3 failed,
  201.31 s. The failures are the known races of `docs/TESTING.md` → Carreras conocidas
  (`projects-command.spec.ts` "An empty database lists no projects" timeout; `seed-load.spec.ts`
  "Loading golden answers again does not duplicate them", deadlock `40P01`).
- Targeted tests (7.2): 16 files, 148 passed, 0 failed.
- Required suite (7.3, HEAD `1fff11a` + prompts): 161 files, 1736 tests: 1734 passed, 2 failed,
  151.44 s. Both failures are `projects-command.spec.ts` ("Sample and user projects are listed", "An
  empty database lists no projects"), the documented race; run alone together with `seed-load.spec.ts`:
  2 files, 10 passed.
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture` (0 errors; the 3 `no-orphans`
  warnings are the same as on the base branch: `packages/web/dist/…`, `packages/analyzers/typescript`),
  `npm run docs:coverage`: all exit 0.
- Mutation:
  - Targeted run (2.3b): `long-fetch.ts` 83.12 (77 mutants: 64 killed, 11 survived, 2 no coverage). The
    `https:` protocol mutants were then killed by the new test "speaks TLS to an https base URL"
    (checked by mutating the line by hand: the test fails). Remaining survivors, justified: the two
    error-message strings (lines 28 and 76: the client never surfaces runtime text); the `settled`
    guard (lines 40–41: a second settle of a settled Promise is a no-op); `removeEventListener('')` and
    `{ once: false }` / `{}` (lines 42 and 57: the abort listener can only fire after settling, which
    the guard absorbs); `method ?? ''` (line 47: `node:http` defaults an empty method to GET, an
    equivalent mutant); `value === undefined` (line 68: Node never gives an undefined header value).
    No coverage: lines 68 and 70 (an undefined header value, a missing `statusMessage`), unreachable
    with Node's `IncomingMessage`.
  - `npm run test:mutation` (incremental, 5824 of 5837 results reused): score **96.06** (break 80),
    `long-fetch.ts` **85.71**, done in 3 min 38 s. CI runs every mutant on this PR because the cache
    key hashes `stryker.config.json` and `vitest.stryker.config.ts` (design Risks, DR9); the last base
    run took 33 min 12 s (limit 40).
- `npm run verify`: `acme-shop: 3/3 golden answers match`, exit 0, on every clone's seeded database
  (6.2 twice, 8.2 in Bash and in PowerShell).

## Privacy and ethics check (7.4)

```
## Privacy / ethics check: diff feature/entrega-2-CRN...feature/DIS-103-real-model-clean-clone

### Verdict
PASS

### Findings
| Severity | Area | Finding | Evidence | Required action |
|---|---|---|---|---|
| — | — | none | — | — |

### Allowed to proceed?
Yes

### Not assessed
.env.example could not be read (permission rule), so its comment on LLM_TIMEOUT_MS is a PR line for the author.
```

Surfaces: AI context (the guide documents third-party model endpoints) and delivery (docs, reports,
screenshots). Evidence: a grep of the added lines for e-mail addresses, `sk-…`, `gh?_…` tokens,
`Bearer` with a long token, `PASSWORD=`, the OS user name and the host name finds nothing; the only
key-like values are the synthetic `clave-x` / `k3y` of the tests; the guide has no key, real or made
up (`guides.spec.ts` checks `sk-` shapes) and marks the hosted and Claude paths «no verificado»; the
reports write the OS user as `<user>` and the guide the host as `<host>`; no `.env` was read, written
or printed; no dependency was added (no npm package check needed; `package-lock.json` unchanged);
the error messages of the adapter still hide values (`LLM_CONFIG_INVALID` names the variable only,
seen live in 8.1).

## Data state verification

- Pre-test baseline (0.4):
  - Fingerprint inputs: `seeds/graph-dump.sql` `4ef1b30d20566a85c566ed2a0ee4d11eac1b61bd`,
    `seeds/cache/acme-shop.json` `e15463ccc516187f531f56e4332dbfca5f7306c5`,
    `fixtures/build-history.mjs` `69ba33edcdafba6230bc2a316e4f88724156c4bb`
  - Author's database (`codemind-postgres-1`): container stopped; not started and not queried (the
    run must not touch it), so the `project` / `query_log` / `cache_entry` counts were not taken
  - Ollama tray app: not running; ports 3000, 5173, 11434 free
  - `dis102-testdb`: `Exited`; started for the suite
- Post-test validation:
  - Fingerprint inputs: the same three hashes; `git diff --exit-code` on `fixtures/build-history.mjs`,
    `fixtures/acme-shop`, `fixtures/history` and `seeds` is empty
  - `codemind-postgres-1`: still `Exited`, untouched; the author's clone untouched
  - No `ollama` / `llama-server` process; ports 3000, 5173, 11434 and 11500 free
- State restored: Yes
- Restoration actions: the scratchpad clones `dis103-live`, `dis103-bash`, `dis103-pwsh` brought
  down with `docker compose -p <clone> down -v` and moved to the scratchpad's `trash/`; the stub and
  every dev server stopped; `dis102-testdb` stopped again at the end of the step.

## UI evidence

- `./2026-10-20-6-web-live-answer.png` — Screen 2 in Chromium after a live answer from Ollama on CPU
  (597.7 s)
- `./2026-10-20-6-web-past-300s.png` — Screen 2 in Chromium showing «Sin respuesta verificada» /
  «Motivo: invalid-model-output» after 310.8 s against the 310 s stub

## ADR

Not warranted (design D11): the transport and the timeout range are local to the LLM adapter,
reversible in one commit, and decided by the author in the ticket.

## Outcome

- Status: PASS
- Blocking issues: none. Pending for the author (PR line): whether `.env.example`'s comment on
  `LLM_TIMEOUT_MS` states a 300000 maximum.
