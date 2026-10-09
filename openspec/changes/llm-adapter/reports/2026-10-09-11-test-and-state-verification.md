# Test and State Verification Report

- Date: 2026-10-09
- Change: llm-adapter
- Step: 11 — Backend: Run Tests and Verify Data State

## Commands executed

- `npm ci` (after stopping an orphaned `npx vitest run` from 10:17 and its 15 `tinypool` workers, which held
  `node_modules/@rollup/rollup-win32-x64-msvc/rollup.win32-x64-msvc.node` open: `EPERM` on unlink)
- Baseline (step 0.5): `npx vitest run`; `git status --porcelain seeds packages/web fixtures`;
  `sha1sum seeds/graph-dump.sql`
- `npx vitest run tests/unit/llm` (twice)
- `npx vitest run` (twice)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/core/src/llm/**/*.ts"` (twice)
- Scenario mapping (step 8.2): every `#### Scenario:` title of `specs/llm-adapter/spec.md` grepped as
  `it('<title>'` in `tests/`
- Type-level RED of "An evaluation configuration does not type-check against the client" (task 4.6): parameter
  temporarily widened to `LiveLlmConfig | EvaluationLlmConfig`; `npx tsc -p tests/tsconfig.json` reported
  `tests/unit/llm/openai-compatible-llm.spec.ts(137,5): error TS2578: Unused '@ts-expect-error' directive.`;
  signature restored

## Test results

- Targeted tests: `tests/unit/llm` 32 passed (2.2 s, then 2.0 s); 33 passed after the mutation extra case
  (`llm-unavailable.spec.ts` 7, `llm-config.spec.ts` 10, `openai-compatible-llm.spec.ts` 16). The timeout
  scenario (`LLM_TIMEOUT_MS=50`, real timers) did not flake.
- Scenario mapping: 22/22 scenarios have exactly one test with the same name.
- Required suite: first full run 52 files passed, 1 failed (`tests/integration/git/git-source-tree.spec.ts` ›
  "Reading executes nothing from the repository", timeout under load); that file alone: 24/24 passed; second full
  run: 53 files / 661 tests passed, 11 files / 124 tests skipped (66.3 s). The same load-dependent Git flake
  (another test of the same file) hit the baseline's first run before any change, and DIS-92 already classified
  this flake family (its step 11 report and design → Follow-ups). Neither the file nor the code it covers is in
  this diff.
- The 124 skipped tests are the database integration specs (`DATABASE_URL` unset locally, as at baseline). This
  change has no SQL and no database state; CI runs them with Postgres (step 13.2).
- Baseline (before any change): 50 files / 629 tests passed, 124 skipped (second run; the first had one Git
  timeout).
- Gates: `lint` clean; `typecheck` green (includes `tests/`, so the `@ts-expect-error` is enforced);
  `docs:coverage` green; `lint:architecture` 0 errors, 3 warnings (pre-existing `no-orphans`:
  `packages/web/src/data/sample-projects.ts`, `packages/analyzers/typescript` src and dist). `adapters/llm` is no
  longer an orphan.
- Mutation (`packages/core/src/llm/**`): first run 85.71 % (18 killed, 3 survived, all in
  `errors.ts:61`, the `expected && received` pair test of the message). Extra case "prints the dimensions only as
  a complete pair" added; second run **100 %** (21 killed, 0 survived). Threshold `MIN_MUTATION_SCORE=70`.
  The adapter (`packages/adapters/llm`) is outside Stryker's `mutate` (design D8); its behaviour is covered by the
  22 scenario tests.
- TDD notes: "A URL without a key selects live mode" and "Without an embedding model, embeddings fail and
  completions work" passed on their first run, already covered by the minimal GREEN of 3.2 and the `embed()`
  stub of 4.2; every other scenario was seen failing before its implementation.
- Line endings: the new files were created with CRLF by the editing tool; all were normalised to LF (the
  repository's `.gitattributes` is `* text=auto eol=lf`).

## Data state verification

- Pre-test baseline:
  - `git status --porcelain seeds packages/web fixtures`: empty
  - `sha1sum seeds/graph-dump.sql`: `f79d94e26d65cd79b39612408dc10b3db0b476b5`
  - Database: not used by this change
- Post-test validation:
  - `git status --porcelain seeds packages/web fixtures`: empty
  - `sha1sum seeds/graph-dump.sql`: `f79d94e26d65cd79b39612408dc10b3db0b476b5`
  - `.stryker-tmp/`: absent
  - Seed fingerprint inputs (`packages/core/src/knowledge`, `packages/core/src/index`,
    `packages/core/src/ports/AnalyzerPort.ts`): no diff against `origin/feature/entrega-2-CRN` (step 9.2)
- State restored: Yes (nothing changed)
- Restoration actions: none

## UI evidence (if applicable)

- none (no browser UI)

## End-to-end (step 13.1)

- Not applicable: no user interface uses the adapter yet (DIS-29 / CM-HU-12). The adapter is exercised against a
  real Ollama in step 12.

## Privacy check (step 7.1)

`/privacy-ethics-check` over the diff against `origin/feature/entrega-2-CRN` (run after the author's go-ahead).

- Surfaces: secrets/auth (the LLM API key), AI context (future prompts), dependencies (`zod`), delivery. No
  personal data is collected, stored or logged by this change.
- Secrets: the key is read only by `llmConfigFromEnv` and used only to build `Authorization`; no error carries a
  `cause`, a response body or runtime text (design D4; scenario "Errors never contain the key" with the key planted
  in bodies and rejection messages). `grep` of the changed files for e-mail shapes, `sk-…` and long bearer tokens:
  no hit (only JSDoc tags and the package scope). Test keys are synthetic (`centinela-secreta-123`, `clave-x`).
- Logging: the adapter and core logs nothing (`grep` for `console.*` in `packages/adapters/llm/src` and
  `packages/core/src/llm`: none); only `config.ts` mentions `process.env`, in a comment.
- Model output: parsed with Zod `safeParse` and never interpreted as an instruction; completion text is typed as
  untrusted in its JSDoc.
- Dependency: `zod` 4.6.5 verified on npmjs (`repository` `github.com/colinhacks/zod`, maintainer `colinhacks`),
  the canonical package named by `docs/backend-standards.md` §1; not a model-invented name. Lockfile diff adds only
  `node_modules/zod`.
- Delivery: no `.env`, dump or real data in the diff.

| Severity | Area | Finding | Evidence | Required action |
|---|---|---|---|---|
| Low | Secrets in transit | `LLM_BASE_URL` accepts `http:` for any host, so a key set together with a remote `http://` URL travels in clear. Intended for Ollama on `localhost` (no key). | `packages/adapters/llm/src/config.ts` `isHttpUrl` | Accepted (D): documented in `design.md` → Risks; a remote paid provider is configured with `https://` |
| Low | AI context (future) | This change sends nothing, but DIS-29 will send repository content to the configured endpoint; with a cloud provider that is a transfer to a third party. | proposal → Privacy | Owned by DIS-29 / DIS-41 (B) |

Verdict: **PASS WITH GAPS** (two Low findings, both with a destination). Allowed to proceed: yes.
Not assessed: the session's tooling plan (an API/CLI session on the author's own TFM repository, no third-party
personal data in context).

## Addendum — verify-against-spec round 1 (2026-10-09)

- Spec: 26 scenarios (4 new: "A null usage reports zero tokens", "A partial usage counts the missing field
  as zero", "A usage field of the wrong type is an invalid response", "A connection cut while reading the
  body is a network failure"); each maps 1:1 to a test of the same name.
- RED before code: 7 failing tests (the two usage scenarios, the body-cut scenario, the network scenario now
  asserting an absent `systemCode`, the absent-details assertion of `LlmUnavailable`, first-choice-only and the
  invalid hand-built timeout). The wrong-type, key-only-in-`Authorization`, embeddings-header and
  `embed([])`-without-model tests pinned behaviour that already held.
- `npx vitest run tests/unit/llm`: 42 passed. Full suite (after the timeout commit): 53 files / 671 tests passed,
  124 skipped, twice in a row (73.8 s, 72.1 s).
- Gates: lint, typecheck, docs:coverage green; lint:architecture 0 errors, 3 pre-existing warnings.
- Mutation `packages/core/src/llm/**`: 96.30 % (1 survivor: details made non-enumerable would vanish from JSON)
  → assertion added → **100 %** (27/27).
- gitleaks 8.30.1: `gitleaks dir . --config .gitleaks.toml --redact` and `gitleaks git` over
  `origin/feature/entrega-2-CRN..HEAD`: «no leaks found» after the exact-value allowlist entry.

## Addendum — verify-against-spec round 2 and adversarial review rounds 1–2 (2026-10-09)

- Spec: 29 scenarios, each mapped 1:1 to a test of the same name.
- verify round 2 (`b0b2e23`): RED before code for "A malformed timeout or URL fails naming the variable" (user
  info, query, fragment), "A redirect is not followed" and the extra "cancels the body of a non-2xx response";
  the invalid hand-built `timeoutMs` already gave `network` (now pinned).
- adversarial round 1 (`1a99bd6`): RED before code for "A malformed timeout or URL fails naming the variable"
  (`300001`), "A runtime socket failure carries its code" and "A runtime header or body timeout is a timeout"
  (the fake rejections use Node's exact shape, `TypeError('fetch failed')` with `cause.code`). The extra
  negative/fractional index test passed at once (the schema rejected it then).
- adversarial round 2: the schema now only asks `index` to be a number; removing the adapter's own index check
  makes "rejects a negative or fractional index" fail (checked, then restored). New extra test: the runtime code
  read from the error itself (`UND_ERR_SOCKET`, `UND_ERR_BODY_TIMEOUT`), which pinned behaviour that already held.
- `npx vitest run tests/unit/llm`: 48 passed. Full suite: 53 files / 677 tests passed, 124 skipped (database
  specs, no `DATABASE_URL`).
- Gates: `typecheck` 0 errors; `lint` clean; `lint:architecture` 0 errors (3 pre-existing warnings);
  `docs:coverage` green; `gitleaks dir` «no leaks found».
- Mutation: `packages/core/src/llm` unchanged since the round-1 run (100 %, 27/27); not re-run. The adapter is
  outside Stryker's `mutate` (design D8).

## Outcome

- Status: PASS (tests, gates, mutation; privacy check PASS WITH GAPS, two Low findings with destination)
- Blocking issues: none for step 11
