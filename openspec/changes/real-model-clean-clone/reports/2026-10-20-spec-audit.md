# Spec audit — real-model-clean-clone (DIS-103)

- Date: 2026-10-20
- Auditor: spec-auditor subagent (headless `claude -p --agent spec-auditor`, read-only tools: Read, Grep, Glob, Linear read)
- Final verdict: see the last run below; every finding of each run is resolved under its run

## Run 1

Verdict line as returned:

CHANGES REQUIRED

**Ticket:** DIS-103 was loaded from Linear (description and comments; there are no comments). It has no parent issue, so point 2 is checked against DIS-103's own acceptance criteria. This is an autonomous run under ADR `20261016-autonomous-workflow-run-entrega-2`, so there are no questions for the author. Each point that needs a decision is listed as a **decision to record** by the lead engineer, in `design.md` and in the Enhanced part of DIS-103.

**Decisions to record**
- **DR1:** Remove "exits `130`" from the history step, or specify a mechanism that actually achieves it (see 5.1).
- **DR2:** Choose between bringing `long-fetch.ts` into Stryker's `mutate` list and accepting that it loses mutation coverage (see 8.1).
- **DR3:** Decide how much of the guide is re-run in both shells, given that `Paso 0` output changes (see 11).
- **DR4:** Decide how a real Ctrl+C during the history step is verified on Windows (see 5.2).
- **DR5:** Decide what the guide says when Ollama already runs as a service (Linux systemd, macOS app) (see 5.5).

---

## Judgment on design D3 (it replaces Enhanced D3)

**The reason for it holds, and the decision is correct.**
- `fixtures/build-history.mjs` is listed in `ANALYZER_FILES` (`packages/cli/src/seed/fingerprint.ts:39`) and in `docs/project-context.md` l.1060. l.1068 says "Changing anything under the fingerprint inputs means rerunning `seed:build` and committing the seed".
- ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md` → Consequences: a changed input turns `verify` red until `seed:build` and then `cache:build` are run locally with a live model. The regenerated golden entries come back with empty `reviews`, and `seed:build` needs the salt, which is not versioned (PH-11).
- Editing the builder to get a SIGINT handler and a relative summary path would therefore cost a seed regeneration, a live golden rebuild of about 30 minutes on CPU, and a new review. Rejecting that is right.
- Putting the protection in a preload inside `scripts/` keeps it outside every fingerprint input. `answer-fingerprint.ts` only covers `packages/core/...`, and the scenario "startup scripts need no installed dependency" still holds.
- The core guarantee is sound on both platforms. While a SIGINT listener exists, Node does not end on Ctrl+C. The `git` children die, `execFileSync` throws, and the `finally` restores the tracked files.

**Inaccuracy (improvable):** D3 says a byte change makes `npm run verify` fail with `GOLDEN_STALE`. `verify` actually fails with `FINGERPRINT_MISMATCH`, reason `seed` (`packages/cli/src/verify.ts:109`, `:216`). `GOLDEN_STALE` belongs to `cache:build`. D3 should be corrected and should cite the ADR.

**Weak part (blocking, see 5.1):** the promise that the preload makes the step exit `130`.

---

## 1. Scope against the ticket — clean

Everything follows from DIS-103:
- the history step: Enhanced D1/D2, AC1;
- the transport and the timeout range: author decision, D4/D5, AC2;
- the live proof: AC3, D14;
- the DEMO section: AC4, D6–D9, D13;
- the readme: AC5, D10/D11;
- `.env.example`: D12.

`scripts/defer-ctrl-c.mjs` is not in the ticket, but it puts into effect the risk that Enhanced D3 itself scopes in ("el riesgo lo introduce este cambio"). It replaces, rather than adds to, the work that was in scope. Nothing is invented.

## 2. Inherited acceptance criteria — clean (no parent; checked against DIS-103's own criteria)

| AC | Requirement / scenario |
|---|---|
| AC1 history in `up` | "One command starts the system" → "Up runs the start sequence in order", "Up builds the fixture history the seed indexed" |
| AC2 no 300 s cap | "LLM configuration…" → "A malformed timeout…" (`3600001`), "A timeout above 300 s is accepted"; "The client waits…" → two automated scenarios |
| AC3 live > 300 s | "The Ollama path was followed on a clean clone" plus "A response after 300 s is accepted" (a deterministic replacement for "se busca una que pase de 300 s") |
| AC4 DEMO section | "The demo guide…" → "The real-model section says how to try each model", "…ordered for a first-time reader" |
| AC5 readme | No spec (the readme is not specified); covered by task 5.1 and, for the `3600001` error, by 8.1. Acceptable. |

## 3. Missing scenarios — improvable

- **3.1:** Several items of the `Probar con un modelo real` paragraph (`local-startup` delta, l.160–166) are MUST content that no scenario checks: the Claude model id, the links to the official pages, the Claude limits, and the hosted-API rule "without `?` or `#`".
  - **Fix:** extend "The real-model section says how to try each model" with `platform.claude.com/docs/en/api/openai-sdk`, `anthropic-workspace-id`, `max_tokens` and «sin `?` ni `#`» (or another literal the guide will contain).
- **3.2:** The sentence "Building the fixture history SHALL change neither the seed's fingerprints nor the answers of evaluation mode" is only covered indirectly, through `npm run verify` exiting `0` in a recorded check. That is acceptable. Add "and `git hash-object` of the three fingerprint inputs unchanged" to the THEN of "Up builds the fixture history the seed indexed", so task 0.4's hashes become a stated check.

## 4. Ambiguity — improvable

- **4.1:** `local-startup` delta l.164–165, "the limits Anthropic's documentation states for that endpoint that matter to this client". Replace with the enumerated list from Enhanced D8:
  - Anthropic presents the layer for testing and comparing, not for production;
  - a multi-workspace key needs `anthropic-workspace-id`, which the client does not send;
  - `max_tokens` is not sent, and how the layer treats that is not checked;
  - there are no embeddings.
- **4.2:** proposal l.57, task 6.3 and task 9.1 say "time allowing". Replace with a measurable rule, for example: «the web check runs if the CLI answer of 6.3 took ≤ 15 min; otherwise the report and the guide say it was not run».
- **4.3:** proposal l.35, "a small preload". Replace with «a preload with no imports, `scripts/defer-ctrl-c.mjs`».

No occurrences of fast, easy, secure, efficient, many, appropriate or robust were found.

## 5. Open decisions

- **5.1 — BLOCKING: the step's exit code `130` is very likely unreachable with the designed preload.**
  - The delta (l.17–18: "that process then exits `130` if it received SIGINT"), design D3 and the scenario "The history step finishes its work before ending on Ctrl+C" (THEN: exit code `130`) all rely on the JS `SIGINT` listener running before `exit`.
  - Node's signal handle is `unref`'d, and the JS listener only runs when libuv polls I/O.
  - In the real flow, Ctrl+C lands during the synchronous `execFileSync` loop. The rejection then reaches `main`'s `catch` → `process.exit(1)` through microtasks, with no poll in between. The listener has not run, so the step exits `1`.
  - In the planned POSIX test (`process.kill(self)` → synchronous loop → marker → return), the loop has no ref'd handle when the module ends, so `uv_run` does not poll. The listener never fires and the exit is `0`, not `130`. This would fail on Linux CI.
  - On Windows, `process.emit('SIGINT')` calls the listener synchronously, so the same test passes. The two platforms would give different results.
  - The visible behaviour is unaffected: `up` already prints `[up] stopped (Ctrl+C)` and exits `130` from its own flag (`scripts/up.mjs:109-116`).
  - **Fix (DR1):** remove the `130` clause from the requirement and the scenario. Keep "does not end on SIGINT before the builder has finished". The scenario THEN becomes: the marker file exists and the process was not ended by a signal (`signal === null`; exit code is the script's own, `0` or `1`); without SIGINT, exit `0`. Drop the `exit` listener from the preload. Update design D3 bullet 1, the D3 risk "Setting `process.exitCode`…", and task 3.1.
- **5.2 — improvable (DR4):** nothing verifies a real Ctrl+C during the history step on Windows, the author's platform. On Windows the unit test only simulates it, and the recorded check "Up builds the fixture history…" presses Ctrl+C once the API listens, not during the step. Record either a recorded check, such as `GenerateConsoleCtrlEvent` from a helper during the `[up] node fixtures/build-history.mjs acme-shop` window followed by `git status --porcelain` empty, or the explicit statement «verified on POSIX in CI only» in design D3 and the PR.
- **5.3 — improvable:** the `up` scenario says "the arguments that run `fixtures/build-history.mjs acme-shop` in a process that defers SIGINT", but the test will pin an exact array. Write it into the scenario: `['--import', './scripts/defer-ctrl-c.mjs', 'fixtures/build-history.mjs', 'acme-shop']`.
- **5.4 — improvable:** the absolute path in `Paso 0`. The requirement asks for pasted output "literally" and allows only "fields the guide lists as changing on every run", but the clone folder changes per clone, not per run. The separator also differs: `\` on Windows in both shells, `/` on Linux and macOS.
  - **Fix:** in the delta (output paragraph) and in the scenario "The guide was followed…", add «or per clone folder»; in design D3, say that `Cómo se capturó` names `<carpeta del clon>` and the OS separator.
- **5.5 — improvable (DR5):** design D6 says to quit the desktop app before `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`. On Linux the installer runs Ollama as a systemd service, and on macOS as an app; there `ollama serve` cannot take port 11434, and the variable has to go into the service environment. The guide must say what to do there, or state that the pair was verified only on Windows (D13 rule: claim only what is verified).
- **5.6 — improvable:** design D4 moves `longFetch` "byte for byte", while task 2.3 adds a test for a connection cut mid-body. If that test shows the promise waits for the timeout (a response `close` with no `error`), the "byte for byte" rule forbids the fix. Record that a fix found by that test is allowed (TDD) and then documented.

## 6. Contradictions inside the change

- **6.1 — BLOCKING: task order.**
  - Task 6.5 stops the dev servers, runs `docker compose -p dis103-live down -v` and moves the clone out of the working area.
  - Task 8.1 then says "In the 6.1 clone, in PowerShell and in Bash: `npm run up`…".
  - Task 8.2 refers to "the restoration of 6.5", which shows the restoration was meant to come last.
  - **Fix:** move the restoration to the end of section 8 (new 8.2 «Restore…», old 8.2 → 8.3), and leave in 6.5 only «stop `ollama` / `llama-server`».
- **6.2 — improvable:** the `GOLDEN_STALE` wording in design D3 (see the D3 judgment). Elsewhere, the proposal, design and deltas agree.

## 7. Contradictions with the project — clean, with one note

- The delta updates the old cap rationale in `openspec/specs/llm-adapter/spec.md` l.24–27 and l.77–83.
- `docs/project-context.md` l.649, l.914 and l.1139–1141 are scheduled for update in task 5.3.
- "Endpoint failures map to one error" keeps the `UND_ERR_*` classification for an injected `fetch`, so it does not conflict.
- ADR `20261017-stale-fingerprint-fails-verify` supports D3.
- The new range (1–3600000) matches `MAX_CACHE_BUILD_TIMEOUT_MS` (`packages/cli/src/cache-build.ts:50`).
- **Note:** design D11 ("No ADR") is reasonable.

## 8. Contrast with the real code

- **8.1 — BLOCKING (DR2): mutation scope.**
  - `stryker.config.json:20-28` mutates `packages/core`, `packages/cli` and `packages/api`, but **not** `packages/adapters`.
  - Moving `longFetch` out of `packages/cli/src/cache/` takes it out of mutation testing. The CLI file left behind is a re-export with nothing to mutate.
  - Task 7.3, "`npm run test:mutation` (score ≥ 80 on the touched adapter files)", cannot be checked: those files are never mutated.
  - **Fix:** either add `"packages/adapters/llm/src/long-fetch.ts"` to `mutate`, plus any `disableTypeChecks` adjustment, and drop "CI not changed" from the proposal's Impact; or record that the coverage is lost and rewrite 7.3 as «mutation score of the touched `packages/cli` files; `long-fetch.ts` leaves mutation scope (DR2)».
- **8.2 — clean:**
  - `@codemind/adapter-llm` is already a dependency of the CLI (`packages/cli/package.json:16`).
  - Function identity is kept for `tests/unit/cli/cache-build.spec.ts:266`.
  - `tests/unit/cli/long-fetch.spec.ts:89-141` already drives `createOpenAiCompatibleLlm` through `longFetch`, as the design says.
  - `createLlm` is used without a `fetch` in `composition.ts` and `ask.ts`, so they inherit the new transport.
  - The API reports `INVALID_CONFIG` (`packages/api/src/composition.ts:41`), as task 8.1 expects.
  - No abstraction is duplicated.

## 9. Task size — improvable

- **9.1:** task 6.3 bundles too much for one turn: stopping the tray app, starting Ollama in CPU-only mode, pulling the model, editing `.env`, restarting `up`, two timed CPU questions of 3.5–9 min each, Chromium, and pasting the output. Split it:
  - 6.3a: Ollama, model and `.env`;
  - 6.3b: CLI and `demo:ask`, timed;
  - 6.3c: web (rule from 4.2);
  - 6.3d: paste the output into the guide.
- **9.2:** task 12.6 is open-ended by nature. Acceptable.

## 10. Mandatory steps — mostly clean

- Section 0 comes first and is labelled; the branch already exists (0.2).
- 0.1 sets Linear to In Progress, as the project requires.
- Verification steps 7, 8, 9, 10 and 12 are present and labelled (`AGENT MUST EXECUTE` where required), report paths are named, and Pre-merge comes last with archive before merge.
- Restoration: see the ordering defect in 6.1.
- **Improvable:** tasks 6.1 and 12.1 switch `gh` to DisTinta but never switch back to Cristina-JumpMath. Add «then `gh auth switch -u Cristina-JumpMath`».

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| llm-adapter: LLM configuration… (MOD) | No URL and no key selects evaluation mode | 7.1/7.2 (existing test) |
| | A URL without a key selects live mode | 7.1/7.2 |
| | A key without a URL fails without showing the key | 7.1/7.2 |
| | A URL without a model fails | 7.1/7.2 |
| | A malformed timeout or URL fails naming the variable | 1.1, 1.2 |
| | A valid timeout overrides the default | 7.1/7.2 |
| | A timeout above 300 s is accepted | 1.1, 1.2 |
| | The daily budget is read in live mode only | 7.1/7.2 |
| | A malformed daily budget fails naming the variable | 7.1/7.2 |
| | With a ceiling every configured model needs a price | 7.1/7.2 |
| | Without a ceiling a model needs no price | 7.1/7.2 |
| llm-adapter: The client waits… (ADDED) | Without an injected fetch the request does not use the global fetch | 2.1, 2.2 |
| | Without an injected fetch timeouts, refusals and redirects keep their mapping | 2.3 |
| | A response after 300 s is accepted | 6.4 |
| local-startup: One command starts the system (MOD) | Up runs the start sequence in order | 3.3, 3.4 |
| | Up ignores an npm_execpath of .env | 7.1/7.2 |
| | Up stops at the first failing step | 7.1/7.2 |
| | Ctrl+C stops up without a failure line | 3.3, 3.4 |
| | The history step finishes its work before ending on Ctrl+C | 3.1, 3.2 (see 5.1) |
| | A step that cannot start stops up | 7.1/7.2 |
| | Up needs npm to start it | 7.1/7.2 |
| | The startup scripts need no installed dependency | 3.4 |
| | **Up with Docker unavailable fails naming its first step** | **— HOLE (recorded check; no task re-runs it) — BLOCKING** |
| | Up builds the fixture history the seed indexed | 6.2 |
| local-startup: The demo guide… (MOD) | The demo guide has no Bash-only command | 4.3, 5.5 |
| | The demo guide is ordered for a first-time reader | 4.1 |
| | The web walkthrough names what each screen shows | 7.2 (automated half); review half not re-run, section untouched; say so in 7.1 (improvable) |
| | **The guide was followed on a clean clone in both shells** | **— HOLE (`Paso 0` output changes; 8.1 runs only `up`, no task re-runs the guide or records it in the PR body) — BLOCKING (DR3)** |
| | The real-model section says how to try each model | 4.1, 4.3 |
| | The Ollama path was followed on a clean clone | 6.3 |

---

## Corrections to apply

### `openspec/changes/real-model-clean-clone/specs/local-startup/spec.md`
1. **Requirement "One command starts the system", l.16–18.** Replace "…and in a process that does not end on SIGINT before the builder has finished, so a Ctrl+C during the step never leaves the fixture's tracked files modified; that process then exits `130` if it received SIGINT." with "…and in a process that does not end on SIGINT before the builder has finished, so a Ctrl+C during the step never leaves the fixture's tracked files modified; `up` then reports the stop as for any step."
2. **Scenario "Up runs the start sequence in order", l.38–39.** Replace "the arguments that run `fixtures/build-history.mjs acme-shop` in a process that defers SIGINT" with "the arguments `--import`, `./scripts/defer-ctrl-c.mjs`, `fixtures/build-history.mjs`, `acme-shop`".
3. **Scenario "The history step finishes its work before ending on Ctrl+C", THEN.** Replace it with "the marker file exists (the work finished after SIGINT) and the process was not ended by a signal; **AND** the same process without SIGINT exits `0`".
4. **Scenario "Up builds the fixture history the seed indexed", THEN.** Append "and `git hash-object` of `seeds/graph-dump.sql`, `seeds/cache/acme-shop.json` and `fixtures/build-history.mjs` is unchanged".
5. **`Probar con un modelo real` paragraph, l.163–166.** Replace "the limits Anthropic's documentation states for that endpoint that matter to this client" with "that Anthropic presents the layer for testing and comparing, not for production; that a key of several workspaces needs the `anthropic-workspace-id` header, which the client does not send; that `max_tokens` is not sent and how the layer treats that is not checked; and that it has no embeddings, which `ask` does not need". Also add, for Ollama: "what to do when Ollama already runs as a service (or that the pair was verified on Windows only)" (DR5).
6. **Scenario "The real-model section says how to try each model", third AND.** Add `https://platform.claude.com/docs/en/api/openai-sdk` and `anthropic-workspace-id`.
7. **Output paragraph (l.176) and scenario "The guide was followed…", THEN.** Change "apart from the fields the guide lists as changing on every run" to "apart from the fields the guide lists as changing on every run or with the clone's folder".

### `openspec/changes/real-model-clean-clone/design.md`
1. **D3, first paragraph.** Replace "`npm run verify` fail (`GOLDEN_STALE`)" with "`npm run verify` fail (`FINGERPRINT_MISMATCH`, reason `seed`, `packages/cli/src/verify.ts`; ADR `20261017-stale-fingerprint-fails-verify`)".
2. **D3, bullet 1.** Remove the `exit` listener and `process.exitCode = 130`. Add: «The JS listener runs only when the event loop polls (Node's signal handle is unref'd), so the step's exit code after a Ctrl+C is not specified; `up` reports `[up] stopped (Ctrl+C)` / `130` from its own flag». In bullet 2, delete "the preload turns that into `130`" and "exits `130`".
3. **D3, test paragraph.** Record DR4: either the Windows recorded check (`GenerateConsoleCtrlEvent` during the step, then `git status --porcelain` empty) or «real Ctrl+C verified on POSIX CI only; on Windows `process.emit` checks only that the listener exists».
4. **D3, bullet 3.** Add: «the separator is the OS's (`\` on Windows in both shells); `Cómo se capturó` says so».
5. **D4.** Add: «If the mid-body cut test of task 2.3 shows `longFetch` waiting for the timeout, the fix goes into the moved file under TDD and is noted here».
6. **D6, Ollama bullet.** Add DR5 (service on Linux/macOS).
7. **New D12, mutation scope.** Record DR2.
8. **Risks.** Delete "[Setting `process.exitCode` in an `exit` listener after `process.exit(1)`] …".
9. **D8.** Replace "if time allows" with the rule from 4.2.

### `openspec/changes/real-model-clean-clone/proposal.md`
1. **l.35–36.** Replace "a small preload of `scripts/` that keeps the process alive on Ctrl+C until the builder has restored the fixture's tracked files, then exits `130`" with "a preload with no imports, `scripts/defer-ctrl-c.mjs`, that keeps the process alive on Ctrl+C until the builder has restored the fixture's tracked files".
2. **l.57.** Replace "time allowing" with the rule from 4.2.
3. **Impact.** If DR2 brings `long-fetch.ts` into mutation, add `stryker.config.json` to "Changed (tooling and docs)" and remove "CI" from "Not changed" only if the workflow changes.

### `openspec/changes/real-model-clean-clone/tasks.md`
1. **3.1.** Rewrite the assertions: marker exists and no termination by signal; the `process.exit(1)` case exits `1` with the marker; no SIGINT → `0`.
2. **6.3.** Split into 6.3a–6.3d (see 9.1), with the web rule from 4.2.
3. **6.5.** Keep only «stop `ollama` and any orphan `llama-server`». Move the dev-server stop, `docker compose -p dis103-live down -v` and moving the clone to a new **8.2 «Restore the 6.1 clone…»**; the old 8.2 becomes 8.3.
4. **8.1.** Add:
   - «with `DOCKER_HOST=tcp://127.0.0.1:<closed port>` set in each shell for one command, `npm run up` prints `[up] docker compose up -d --wait` and the failure line and runs no `npm install` (scenario "Up with Docker unavailable fails naming its first step")»;
   - for DR3: «run every command of `docs/DEMO.md` outside `Probar con un modelo real` in PowerShell and in Bash and compare with the pasted output (scenario "The guide was followed on a clean clone in both shells")», or the narrower scope DR3 records.
5. **7.1.** Add: «"The web walkthrough…": automated half green; review half not re-run because the section is unchanged (stated in the report)».
6. **7.3.** Replace "(score ≥ 80 on the touched adapter files)" with the wording from DR2.
7. **6.1 and 12.1.** Append «then `gh auth switch -u Cristina-JumpMath`».
8. **11.1.** Add «the run of the guide in both shells (scenario "The guide was followed…")».

### Linear DIS-103
Do not edit the `[original]` block. Add the following to the `[enhanced]` part, in Spanish:
- Under **D3**: «**Sustituida por la decisión D3 del change `real-model-clean-clone`.** `fixtures/build-history.mjs` es entrada de la huella del analizador (`packages/cli/src/seed/fingerprint.ts`); cualquier cambio de un byte hace fallar `npm run verify` con `FINGERPRINT_MISMATCH` (ADR `20261017-stale-fingerprint-fails-verify`) y obligaría a regenerar la semilla y las respuestas *golden* con un modelo en vivo, que vuelven sin revisión. La protección contra Ctrl+C va en un precargado sin imports, `scripts/defer-ctrl-c.mjs`, que `up` pasa con `--import`; la línea de resumen conserva la ruta absoluta y `docs/DEMO.md` la muestra con `<carpeta del clon>`. El código de salida del paso tras Ctrl+C no se especifica: `up` imprime `[up] stopped (Ctrl+C)` y sale con `130` por su propia marca.»
- Under **Contexto técnico → 1. Tests primero**: replace the `tests/integration/git/build-history.spec.ts` (resumen relativo) item with «`tests/unit/scripts/defer-ctrl-c.spec.ts` (nuevo); `tests/integration/git/build-history.spec.ts` no cambia».
- Add a new item **«Decisiones registradas en la auditoría de la spec (20-10-2026)»** with DR1–DR5 as they are settled: «sin `130` del paso», «alcance de mutación de `long-fetch.ts`», «alcance de la repetición de la guía en las dos shells», «verificación de Ctrl+C real en Windows», «Ollama como servicio en Linux/macOS».

### Resolution of run 1 (lead-engineer decisions, autonomous run; ADR `20261016-autonomous-workflow-run-entrega-2`)

Applied with `/opsx:update` to `proposal.md`, `design.md`, `tasks.md` and the `local-startup` delta;
recorded in the DIS-103 Enhanced description (Spanish), section «Decisiones registradas en la
auditoría de la spec».

| Finding | Decision | Where |
|---|---|---|
| 5.1 / DR1 (blocking) — exit `130` of the step unreachable | Accepted. The `130` clause is removed: the preload is a no-op `SIGINT` listener only (no `exit` listener); the step's exit code after Ctrl+C is not specified; `up` reports the stop from its own flag. Scenario THEN: marker present, not ended by a signal, script's own code (`0` / `1`); without SIGINT `0` | delta "One command starts the system" + scenario; design D3 bullets 1–2, Risks; task 3.1, 3.2 |
| 8.1 / DR2 (blocking) — `long-fetch.ts` leaves mutation scope | Bring it into `mutate` (and `disableTypeChecks`); the rest of `packages/adapters` stays out | design D12; proposal Impact; tasks 2.3b, 7.3 |
| Traceability hole — "The guide was followed on a clean clone in both shells" / DR3 (blocking) | The whole guide outside the new section is re-run literally in both shells on fresh clones and recorded in the PR body | design D13; tasks 8.2, 9.1, 11.1 |
| Traceability hole — "Up with Docker unavailable…" (blocking) | Re-run in both shells with `DOCKER_HOST=tcp://127.0.0.1:1` | task 8.1; design D13 |
| 6.1 (blocking) — restoration before step 8 | Restoration moved to new 8.3; 6.5 only stops Ollama / `llama-server` | tasks 6.5, 8.3, 8.4 |
| 5.2 / DR4 — real Ctrl+C on Windows | Verified on POSIX CI only; Windows rests on Node's documented behaviour; stated in design and PR. A `GenerateConsoleCtrlEvent` helper is not built for one check | design D3, Risks; task 11.1 |
| 5.5 / DR5 — Ollama already running as app or service | The guide says to quit the app / stop the service, or give the variable to it per Ollama's docs, and that the pair was verified on Windows only | delta (section paragraph); design D6 |
| 5.3 — exact `up` arguments | Pinned in the scenario | delta "Up runs the start sequence in order" |
| 5.4 — clone folder in pasted paths | `<carpeta del clon>`, system separator, stated in `Cómo se capturó`; clone-folder fields ignored in the comparison | delta (output paragraph, clean-clone scenario); design D3 |
| 5.6 — "byte for byte" vs. a needed fix | A fix found by the mid-body test goes into the moved file under TDD | design D4 |
| 3.1 — unchecked MUST content | Scenario checks `https://platform.claude.com/docs/en/api/openai-sdk`, `anthropic-workspace-id`, `max_tokens` | delta "The real-model section…" |
| 3.2 — fingerprint inputs unchanged | `git hash-object` of the three inputs in the recorded check | delta "Up builds the fixture history…"; task 6.2 |
| 4.1 — vague "limits that matter" | Enumerated (testing layer, workspace header, `max_tokens`, no embeddings) | delta (section paragraph) |
| 4.2 — "time allowing" | Web check runs when the CLI answer took ≤ 15 min; otherwise stated as not run | proposal; design D8; task 6.3c |
| 4.3 — "a small preload" | «a preload with no imports, `scripts/defer-ctrl-c.mjs`» | proposal |
| 9.1 — task 6.3 too big | Split into 6.3a–6.3d | tasks |
| D3 wording `GOLDEN_STALE` | `FINGERPRINT_MISMATCH`, reason `seed`, with the ADR cited | design D3 |
| 7.1 note on "The web walkthrough…" | Automated half green; review half not re-run (section unchanged), stated in the report | task 7.1 |
| 10 — switch `gh` back to Cristina-JumpMath | Not applied: the author allowed DisTinta to stay active for this autonomous run (2026-10-18) | design D14; task 6.1 |
| Linear updates | D3 revised and technical context fixed in Enhanced; DR1–DR5 recorded | DIS-103 Enhanced |
