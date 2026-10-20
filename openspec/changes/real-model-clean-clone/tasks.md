## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 First action of the apply: confirm DIS-103 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `real-model-clean-clone` and the branch `feature/DIS-103-real-model-clean-clone`
- [ ] 0.2 Feature branch `feature/DIS-103-real-model-clean-clone` (`BRANCH_PREFIX=feature/`), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/real-model-clean-clone/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, merge it before any code (never force-push a published branch)
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` is ever staged (explicit paths only)
- [ ] 0.4 Baseline: `npx vitest run` once (integration database as `docs/TESTING.md` says) and record the totals; `node -v`, `npm -v`, `docker compose version`; `git hash-object seeds/graph-dump.sql seeds/cache/acme-shop.json fixtures/build-history.mjs` (must not change, design D3); in the author's local database `SELECT count(*) FROM project`, `FROM query_log`, `SELECT count(*), sum(hit_count) FROM cache_entry` (re-checked in 7.4)

## 1. Timeout range (TDD, design D5) — `llm-adapter` → "LLM configuration is classified and validated when read"

- [ ] 1.1 RED: in `tests/unit/llm/llm-config.spec.ts`, change `300001` to `3600001` in "A malformed timeout or URL fails naming the variable" (requirement change, D5/D10; no other value touched) and add "A timeout above 300 s is accepted" (`300001`, `1200000`, `3600000`). See the new scenario fail
- [ ] 1.2 GREEN: `MAX_TIMEOUT_MS = 3_600_000` in `packages/adapters/llm/src/config.ts`, its comment rewritten (range of `CACHE_BUILD_TIMEOUT_MS`, design D5); `npx vitest run tests/unit/llm` green

## 2. Default transport over `node:http` (TDD, design D4) — `llm-adapter` → "The client waits as long as the configured timeout"

- [ ] 2.1 RED: create `tests/unit/llm/default-transport.spec.ts` with "Without an injected fetch the request does not use the global fetch" (`node:http` server on port 0; `vi.stubGlobal('fetch', spy)` restored after each test; the model built with `createLlm` without `fetch`). See it fail (the spy is called)
- [ ] 2.2 GREEN: move `longFetch` byte for byte to `packages/adapters/llm/src/long-fetch.ts` (TSDoc updated: used by the client by default and by `cache:build`), export it from `packages/adapters/llm/src/index.ts`, make `packages/cli/src/cache/long-fetch.ts` a re-export from `@codemind/adapter-llm`; `createOpenAiCompatibleLlm` uses `options.fetch ?? longFetch` (option TSDoc updated). LF on the new file (`grep -c $'\r'`)
- [ ] 2.3 RED → GREEN: "Without an injected fetch timeouts, refusals and redirects keep their mapping" (never-answering server with `LLM_TIMEOUT_MS=50`; a port taken and released for `ECONNREFUSED`; a 302 server counting requests). Add a test (not a named scenario) that a connection cut mid-body over the default transport is `network` (design D4)
- [ ] 2.3b `stryker.config.json`: add `packages/adapters/llm/src/long-fetch.ts` to `mutate` and the file to `disableTypeChecks` (design D12); `npx stryker run --mutate packages/adapters/llm/src/long-fetch.ts` scores >= 80 (kill or justify survivors with tests in `tests/unit/llm/default-transport.spec.ts`, never editing `tests/unit/cli/long-fetch.spec.ts`)
- [ ] 2.4 Run `npx vitest run tests/unit/llm tests/unit/cli/long-fetch.spec.ts tests/unit/cli/cache-build.spec.ts` (the last two untouched and green), `npm run typecheck`, `npm run lint:architecture`

## 3. The history step of `up` (TDD, design D1, D3) — `local-startup` → "One command starts the system"

- [ ] 3.1 RED: create `tests/unit/scripts/defer-ctrl-c.spec.ts` with "The history step finishes its work before ending on Ctrl+C": spawn `process.execPath` with `--import ./scripts/defer-ctrl-c.mjs` and a temporary script that delivers SIGINT to itself (`process.kill(process.pid, 'SIGINT')` on POSIX, `process.emit('SIGINT', 'SIGINT')` on win32, design D3), keeps working (a short synchronous loop), then writes a marker file: marker present, `signal === null`, exit `0`; a second case calls `process.exit(1)` after SIGINT and the marker: marker present, exit `1`, no signal; a third without SIGINT exits `0`. See it fail (module missing; on POSIX the process is ended by SIGINT)
- [ ] 3.2 GREEN: `scripts/defer-ctrl-c.mjs` (no imports, a no-op `SIGINT` listener only, no `exit` listener; JSDoc citing design D3); LF
- [ ] 3.3 RED: in `tests/unit/scripts/up.spec.ts`, update "Up runs the start sequence in order" and "Ctrl+C stops up without a failure line" to the six-step requirement (D10). See them fail
- [ ] 3.4 GREEN: `scripts/up.mjs` → `startSequence()` adds the step of design D1 (label `node fixtures/build-history.mjs acme-shop`, `process.execPath`, `['--import', './scripts/defer-ctrl-c.mjs', 'fixtures/build-history.mjs', 'acme-shop']`); header comment lists six steps; `npx vitest run tests/unit/scripts` green (including "The startup scripts need no installed dependency")
- [ ] 3.5 Confirm `fixtures/build-history.mjs`, `fixtures/acme-shop/`, `fixtures/history/` and `seeds/` are unchanged (`git diff --exit-code` on them) and `npm run verify` exits `0` on the seeded database

## 4. `docs/DEMO.md` → `Probar con un modelo real` (design D6) — `local-startup` → "The demo guide runs the same in PowerShell and Bash"

- [ ] 4.1 RED: in `tests/unit/docs/guides.spec.ts`, add `Probar con un modelo real` to "The demo guide is ordered for a first-time reader" (D10) and add "The real-model section says how to try each model". See both fail
- [ ] 4.2 Re-read the two official Anthropic pages of design D6 (WebFetch; date them) and confirm base URL, supported fields and model ids; anything not stated there stays out of the guide
- [ ] 4.3 Write the section in Spanish (history step for whoever does not use `up`; Ollama GPU/CPU with the one labelled pair; `.env` lines in the text; `LLM_TIMEOUT_MS=1200000` on CPU and the 3600000 limit; hosted API «no verificado»; Claude «no verificado» with links and limits; restart `npm run up` after editing `.env`; CLI and `demo:ask` questions). Output blocks marked `[pendiente de la prueba en vivo]` until 6.3. `guides.spec.ts` green
- [ ] 4.4 `Paso 0`: the new `[up] node fixtures/build-history.mjs acme-shop` line and its output in the pasted `up` output (placeholder until 6.2, with `<carpeta del clon>` for the clone's folder, design D3) and `Cómo se capturó` updated

## 5. Other docs (design D2, D7, D9)

- [ ] 5.1 `readme.md`: «cuatro comandos» at §1.2, §1.3 and the §1.4 title; every link to the old anchor (`grep -rn "tres-comandos" --include=*.md .`) updated; the `up` sequence with the new step; `Probar con un modelo real` linking to `docs/DEMO.md#probar-con-un-modelo-real`, keeping the times table, no «máximo admitido»; `LLM_TIMEOUT_MS` row «entero de 1 a 3600000»; `grep -n "300000\|300 s\|tres comandos" readme.md` reviewed line by line
- [ ] 5.2 `fixtures/README.md` ("Git history — how it is versioned"): `npm run up` builds `acme-shop`'s history; the manual command
- [ ] 5.3 `docs/project-context.md`: Commands (`up` six steps, the `defer-ctrl-c` preload and why the builder is not edited, design D3), the `LLM_TIMEOUT_MS` cap lines (l.649, l.914, l.1141 at base) and the `longFetch` location (l.1139–1141)
- [ ] 5.4 `.env.example` per design D9 (count-only check; scripted edit or one PR line)
- [ ] 5.5 `npx vitest run tests/unit/docs` green

## 6. Live verification on a clean clone (MANDATORY - AGENT MUST EXECUTE; design D8)

- [ ] 6.1 Push the branch (`gh auth switch -u DisTinta`, which stays active for this run, design D14; `git -c credential.helper='!gh auth git-credential' push -u origin feature/DIS-103-real-model-clean-clone`); clone it into the scratchpad (folder `dis103-live`, checked with `docker compose config --format json` to be a project other than `codemind`); `cp .env.example .env` plus scripted edits for a free `POSTGRES_PORT` and the matching `DATABASE_URL` (never read or printed)
- [ ] 6.2 Recorded check "Up builds the fixture history the seed indexed": `npm run up` in the background; the six `[up]` lines; `git -C fixtures/acme-shop rev-parse HEAD`; `git status --porcelain` empty; `npm run verify` exit `0`; `git hash-object` of the three fingerprint inputs equal to the branch's; stop (process tree), run `up` again and repeat the checks; keep the real `Paso 0` output for 4.4
- [ ] 6.3a Ollama for the recorded check "The Ollama path was followed on a clean clone": stop the Ollama tray app; start `ollama serve` on CPU only (project memory recipe, `OLLAMA_CONTEXT_LENGTH=16384`), `ollama pull qwen2.5-coder`; scripted `.env` edits of the guide with `LLM_TIMEOUT_MS=1200000`; stop and restart `up`
- [ ] 6.3b `npm run cli -- ask acme-shop "¿Qué hace DiscountService?"` and the same question through `npm run demo:ask`, each timed (start/end timestamps); no `SOURCE_UNAVAILABLE`, no `LLM_UNAVAILABLE`
- [ ] 6.3c Web: when the 6.3b CLI answer took 15 min or less, the same question on Screen 2 in Chromium (browser-automation skill, screenshot `reports/YYYY-MM-DD-6-web-live-answer.png`), timed; otherwise record that it did not run and make no web claim in the guide (design D6, D8)
- [ ] 6.3d Paste the real output of 6.3b into `Probar con un modelo real` replacing the 4.3 placeholders; `guides.spec.ts` green
- [ ] 6.4 Recorded check "A response after 300 s is accepted": the throwaway scratchpad script of design D8 (310 s server, `LLM_TIMEOUT_MS=600000`, `createLlm` without `fetch`); its source and output in the report
- [ ] 6.5 Stop `ollama` and any orphan `llama-server` (the clone stays up for step 8)
- [ ] 6.6 Report `openspec/changes/real-model-clean-clone/reports/YYYY-MM-DD-6-live-verification.md` (commands, outputs, durations, machine, OS user masked)

## 7. Review and Update Existing Tests / Run Tests and Verify Data State (MANDATORY)

- [ ] 7.1 Review the affected tests (`grep -rn "300001\|startSequence\|five\|Paso 0\|long-fetch" tests`); only the D10 tests change; every `#### Scenario:` of both deltas maps to a test of the same name except the recorded checks (6.2, 6.3, 6.4, 8.1, 8.2); "The web walkthrough names what each screen shows": automated half green, review half not re-run because `Recorrido por la web` is unchanged (stated in the report)
- [ ] 7.2 Targeted: `npx vitest run tests/unit/llm tests/unit/scripts tests/unit/docs tests/unit/cli/long-fetch.spec.ts tests/unit/cli/cache-build.spec.ts`
- [ ] 7.3 Broader: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run test:mutation` (score >= 80, `long-fetch.ts` included per design D12), `npm run verify`
- [ ] 7.4 `/privacy-ethics-check` over the diff (no key in the guide, `.env` never printed); post-test state: the 0.4 counts and hashes unchanged; no temporary files left. Report `reports/YYYY-MM-DD-7-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6; "no dependency installed: no npm package check needed")

## 8. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 In the 6.1 clone, in PowerShell and in Bash: `npm run up` prints the six lines; with `LLM_TIMEOUT_MS=3600001` set in the shell for one command, `npm run cli -- ask acme-shop "x"` fails with `LLM_CONFIG_INVALID` naming `LLM_TIMEOUT_MS` without the value, and the API's `dev` prints `INVALID_CONFIG` the same way; `node fixtures/build-history.mjs acme-shop` run by hand rebuilds the same `HEAD`; recorded check "Up with Docker unavailable fails naming its first step" with `DOCKER_HOST=tcp://127.0.0.1:1` for that one command in each shell (the `[up]` failure line, no `npm install`, exit other than `0`)
- [ ] 8.2 Recorded check "The guide was followed on a clean clone in both shells" (design D13): two fresh clones (`dis103-bash`, `dis103-pwsh`, evaluation-mode `.env`, own `POSTGRES_PORT`), one after the other; every command of `docs/DEMO.md` outside `Probar con un modelo real` run literally with the Bash tool and with the PowerShell tool and compared with the pasted output (fields that change per run or with the clone's folder ignored); fix the guide where it differs; record it for the PR body
- [ ] 8.3 Restore: stop the dev servers, `docker compose -p <clone> down -v` for `dis103-live`, `dis103-bash` and `dis103-pwsh` only, move the clones out of the scratchpad's working area without `rm -rf`; the author's clone and `codemind-postgres-1` untouched; re-check the 0.4 indicators
- [ ] 8.4 Document every command and output of 8.1-8.3 in `reports/YYYY-MM-DD-8-manual-interface-testing.md`

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Covered by 6.3b-6.3c (CLI, API and Screen 2 in Chromium under the 15-minute rule) and 8.2 (the whole guide in both shells); if the web check did not run, the report and the guide say so and no web claim is made (design D6)

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-103 prompts with its Índice entry in the same edit
- [ ] 10.2 ADR not warranted (design D11): record it in the step 7 report

## 11. Pull request preparation

- [ ] 11.1 `/pr-describe` in Spanish against `feature/entrega-2-CRN`: the Why marked as the agent's decision where it is (design D3 replacing Enhanced D3, D12-D14), the live run and durations, the run of the guide in both shells (8.2), the Ctrl+C verification scope (POSIX CI only, design D3), «no verificado» paths, no dependency added, the D10 tests, the `.env.example` note if any

## 12. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Open the PR against `feature/entrega-2-CRN` (ADR `20261016-autonomous-workflow-run-entrega-2`; `gh` on DisTinta); DIS-103 to In Review with a Spanish comment linking it
- [ ] 12.2 CI green (`quality`, `verify`, `mutation`, `secrets`, `Frontend`); link the run in an addendum to the step 7 report
- [ ] 12.3 `/show-spec-working` (may reuse 6 and 8 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 12.4 `/verify-against-spec` → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 12.5 `/adversarial-review` → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 12.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 12.7 `/opsx:archive`, commit it to the same PR; merge only after the archive commit and with CI green (ADR `20261016-autonomous-workflow-run-entrega-2`)
