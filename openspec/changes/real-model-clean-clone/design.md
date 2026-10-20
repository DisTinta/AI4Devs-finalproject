## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `scripts/up.mjs` → `runUp()` runs five steps (`docker compose up -d --wait`, `npm install`,
  `npm run db:migrate`, `npm run db:seed`, `npm run dev`) with a step-runner seam
  (`tests/unit/scripts/up.spec.ts`), notes SIGINT while a step runs and prints
  `[up] stopped (Ctrl+C)` / exit `130` when the step ends. It imports only `node:` modules and files
  of `scripts/` (scenario "The startup scripts need no installed dependency").
- `fixtures/build-history.mjs acme-shop` rebuilds `fixtures/acme-shop/.git` deterministically
  (32 commits, about 11 s on Windows, `HEAD` `4f028db4d51a3321031f3a24b3f36240410ed38c` =
  `indexed_commit` of `seeds/graph-dump.sql`). Its build loop is synchronous (`execFileSync('git', …)`)
  and writes `hist:rN` markers into the fixture's tracked files, restored in a `finally`. Its summary
  line prints the absolute `.git` path. **It is an input of the seed's analyzer fingerprint**
  (`seed-build` → "Fingerprints"), and a stale seed fingerprint stales the golden file through its
  `seed.*` header (`docs/project-context.md` → `verify` and the fingerprint policy).
- `packages/adapters/llm/src/openai-compatible-llm.ts` uses `options.fetch ?? fetch`; Node's `fetch`
  (undici) ends any request at 300 s, hence `MAX_TIMEOUT_MS = 300_000` in `config.ts`. The API
  (`packages/api/src/composition.ts`) and the CLI (`packages/cli/src/commands/ask.ts`) build the
  model through `createLlm` without a `fetch`.
- `packages/cli/src/cache/long-fetch.ts` → `longFetch` (`node:http`/`node:https`, only the caller's
  `signal` as limit, `redirect: 'manual'` semantics, system error `code` intact) is used by
  `cache:build` and tested by `tests/unit/cli/long-fetch.spec.ts`, which already drives
  `createOpenAiCompatibleLlm` through it (timeout, redirect, refused connection).
- The web's `ask()` has no limit of its own, Vite's proxy sets no `proxyTimeout`, Fastify's
  `requestTimeout`/`connectionTimeout` are left at `0`.
- `docs/DEMO.md` (DIS-102) is Spanish and cross-shell, checked by `tests/unit/docs/guides.spec.ts`.

## Goals / Non-Goals

**Goals:**

- A clean clone reaches free questions with a real model by following `docs/DEMO.md` only, in
  PowerShell and in Bash.
- No time limit below `LLM_TIMEOUT_MS` anywhere on the live path (CLI, API, web through the API).
- Zero change to the seed, the golden file and evaluation mode.

**Non-Goals:** see `proposal.md` → Non-goals. Design-level additions: no new dependency, no change to
`fixtures/build-history.mjs`, no change to the API or web source, and none to the CLI source beyond `packages/cli/src/cache/long-fetch.ts` becoming a re-export.

## Decisions

### D1. The history is an `up` step of its own, after `db:seed`, every time (Enhanced D1)

`startSequence()` gains `{ label: 'node fixtures/build-history.mjs acme-shop', command: process.execPath,
args: ['--import', './scripts/defer-ctrl-c.mjs', 'fixtures/build-history.mjs', 'acme-shop'] }`
between `npm run db:seed` and `npm run dev` (the step's `cwd` is the root, so the relative
`--import` specifier and script path resolve there, as the API's `dev` does with
`--import ../../scripts/load-env.mjs`). After Docker so the existing failure scenarios keep their
calls; before `dev` so the API starts with readable code. Always rebuilt: deterministic, ~11 s, and
no logic for a stale or half-built `.git`. Only `acme-shop`: the only project `db:seed` loads.
*Alternatives:* build it only when `.git` is missing (needs a "valid and current" check; rejected);
inside `db:seed` (changes `seed-load`, a product command; rejected).

### D2. Documented for whoever does not use `up` (Enhanced D2)

`docs/DEMO.md` → `Probar con un modelo real` and `fixtures/README.md` say `npm run up` builds it and
give `node fixtures/build-history.mjs acme-shop`.

### D3. `fixtures/build-history.mjs` is not edited; Ctrl+C is deferred by a preload (agent's decision, replaces Enhanced D3)

Enhanced D3 planned a SIGINT handler and a relative summary path **inside** `build-history.mjs`. On
reading the fingerprint policy, that is rejected: `fixtures/build-history.mjs` is an analyzer
fingerprint input (`packages/cli/src/seed/fingerprint.ts`), so any byte change makes
`npm run verify` fail (`FINGERPRINT_MISMATCH`, reason `seed`, `packages/cli/src/verify.ts`; ADR
`20261017-stale-fingerprint-fails-verify`) until `npm run seed:build` (which needs the unversioned
salt) and then `npm run cache:build` run with a live model; the regenerated golden
entries lose their reviews (the author signs a sample again) and the answers pasted in `docs/DEMO.md`
could change. The risk Enhanced D3 addresses is still introduced by this change (`up` now runs the
builder, and a Ctrl+C in its ~11 s would kill Node before the `finally` restores the fixture), so it
is fixed here, outside the fingerprint:

- `scripts/defer-ctrl-c.mjs` (no imports) registers a no-op `SIGINT` listener: while a listener
  exists, Node does not end the process on SIGINT. Nothing else: Node's signal handle is unref'd and
  the JS listener runs only when the event loop polls, which the builder's synchronous loop and its
  `process.exit(1)` path may never do, so the step's exit code after a Ctrl+C is not specified (spec
  audit run 1, DR1). `up` reports `[up] stopped (Ctrl+C)` and `130` from its own flag, as for any
  step.
- Ctrl+C also reaches the `git` children of the builder (same console / process group): the running
  `execFileSync` throws, the builder's `finally` restores the tracked files, its `main` prints the
  error and exits `1`. If Ctrl+C lands between `git` calls, the build simply finishes. Either way `up`
  prints `[up] stopped (Ctrl+C)` and exits `130`
  (unchanged behaviour), and the fixture is intact (`git-history` → "Fixture histories record every
  listed file": tracked files keep their content whether the build succeeds or fails).
- The summary line keeps its absolute path. `docs/DEMO.md` → `Paso 0` pastes it with the clone's
  absolute path replaced by `<repo>`, the placeholder that rule (b) of `Cómo se capturó` already
  defines (spec audit run 4, DR13: one placeholder per guide; "carpeta del clon" stays the folder
  name of the Docker-prefix note), and rule (b) now says the separator is the system's (`\` on Windows in both shells, `/` on Linux and macOS).
- The label printed is `node fixtures/build-history.mjs acme-shop`, the command a person types; the
  preload is an implementation detail stated in `docs/project-context.md` → Commands.

*Alternatives:* a wrapper in `scripts/` that imports the builder (breaks "The startup scripts need no
installed dependency", which allows only `scripts/` files); `git checkout -- fixtures/acme-shop` after
an interrupted step (would discard a reader's own edits); editing the builder and regenerating seed +
golden (cost above). The test of the preload ("The history step finishes its work before ending on
Ctrl+C") delivers the signal with `process.kill(process.pid, 'SIGINT')` on POSIX and
`process.emit('SIGINT', 'SIGINT')` on Windows, where `process.kill` with `SIGINT` terminates the
process unconditionally. **Verification scope (DR4):** a real signal is exercised on POSIX only (CI,
Linux); on Windows the test checks the listener path, and the rest rests on Node's documented
behaviour (with a `SIGINT` listener, Ctrl+C in the console does not end the process). The agent's
tools cannot press Ctrl+C in a Windows console during the ~11 s step, and a `GenerateConsoleCtrlEvent`
helper would need its own console attach logic for one check; the PR states this scope.

### D4. The LLM adapter sends with `node:http` by default (author decision; Enhanced D4)

`longFetch` moves, byte for byte, to `packages/adapters/llm/src/long-fetch.ts`, exported from
`@codemind/adapter-llm`; `packages/cli/src/cache/long-fetch.ts` becomes
`export { longFetch } from '@codemind/adapter-llm';`, so `cache-build.ts` and its tests keep the same
function identity (`tests/unit/cli/cache-build.spec.ts` compares `fetches` with `longFetch`).
`createOpenAiCompatibleLlm` uses `options.fetch ?? longFetch`; its option's TSDoc says so. The
`UND_ERR_*` classification stays for an injected `fetch`. Error mapping over `longFetch`: the
`AbortSignal.timeout` reason is a `TimeoutError` (→ `timeout`), a refused connection keeps
`code: 'ECONNREFUSED'` (→ `network` + `systemCode`), a 3xx comes back as itself (→ `http-status`),
and a connection cut mid-body rejects with the response's error (→ `network`, `ECONNRESET` when Node
sets it). "Byte for byte" is the starting point, not a freeze: if the mid-body cut test of task 2.3
shows `longFetch` waiting for the timeout instead (a `close` without `error`), the fix goes into the
moved file under TDD and is recorded here. *Alternatives:* an undici `Agent` with `headersTimeout: 0` (undici is not a declared
dependency; rejected), keeping the cap and documenting CPU as unsupported (contradicts the author).

### D5. `LLM_TIMEOUT_MS` from 1 to 3600000; default 120000 (Enhanced D5)

`MAX_TIMEOUT_MS = 3_600_000`, the range of `CACHE_BUILD_TIMEOUT_MS`, far under the 2³¹−1 ms of Node
timers; one hour covers the slowest CPU answer measured (~9 min per request). The default stays
for GPU and hosted APIs; the guide recommends `1200000` on CPU. The scenario value `300001` becomes
`3600001` in `tests/unit/llm/llm-config.spec.ts` because the requirement changes (author decision of
2026-10-20), not to make the suite pass; the other invalid values stay.

### D6. `Probar con un modelo real` in `docs/DEMO.md` (Enhanced D6–D9, D13)

Placed between `Recorrido por la web` and `Parar el sistema` (needs the system running; the ordered
headings check only requires existing sections in order). Content per the `local-startup` delta.
Facts:

- Ollama: `ollama pull qwen2.5-coder`; `OLLAMA_CONTEXT_LENGTH=16384` as the only labelled pair
  (`$env:OLLAMA_CONTEXT_LENGTH=16384` then `ollama serve` in PowerShell;
  `OLLAMA_CONTEXT_LENGTH=16384 ollama serve` in Bash). When Ollama already serves port 11434 (the
  desktop app on Windows and macOS, the systemd service the Linux installer creates), a second
  `ollama serve` cannot start: the guide says to quit the app (or stop the service) first, or to give
  `OLLAMA_CONTEXT_LENGTH` to that app or service as Ollama's documentation explains, and says the pair
  was verified on Windows only (DR5). Each block of the pair is run once in its own shell (PowerShell,
  Git Bash) on Windows, and the guide says so. CPU times from `readme.md`'s table.
- Hosted OpenAI-compatible API (Enhanced D7): generic, `https://api.openai.com/v1` may be cited as an
  example base URL, no model id invented; `DAILY_BUDGET_USD` empty because `COST_TABLE` has no paid
  prices and a ceiling would make the configuration invalid; spend is watched in the provider's
  console; «no verificado».
- Claude (Enhanced D8): from the official pages
  (`https://platform.claude.com/docs/en/api/openai-sdk`,
  `https://platform.claude.com/docs/en/about-claude/models/overview`), re-read on the day the section
  is written and dated in the section: base URL `https://api.anthropic.com/v1`, `Authorization: Bearer`
  supported, the client sends neither `response_format` nor `temperature`/`top_p`, the `system`
  message is lifted to Anthropic's `system`, `usage.prompt_tokens`/`completion_tokens` supported; the
  layer is presented by Anthropic for testing and comparing, a multi-workspace key needs a header the
  client does not send, `max_tokens` is not sent and its default is not checked here; model ids as
  listed there. «no verificado: no se ha probado con una clave real».
- Commands (spec audit run 2, DR8): the `shell` blocks use the literal project id
  `a794456d-6d1b-5b55-a360-13fec83dc7bc` and the literal question `¿Qué hace DiscountService?`; no
  `<…>` placeholder, which PowerShell reserves.
- Restart (Enhanced D9): Ctrl+C in terminal 1 and `npm run up` again; `npm run cli` reads `.env` on
  every run.
- The web (Enhanced D13): only what is verified; if the web check runs only in Chromium, the guide
  says Chromium.

### D7. `readme.md` (Enhanced D10–D11)

«tres comandos» → «cuatro comandos» at §1.2 (l.147), §1.3 (l.170) and the §1.4 title, and every link
to the old anchor `#camino-corto--sistema-operativo-en-tres-comandos` (searched in the repo).
`Probar con un modelo real` keeps the times table, links to
`docs/DEMO.md#probar-con-un-modelo-real` instead of repeating the recipe, and drops «el máximo
admitido» / the 300 s explanation; the `LLM_TIMEOUT_MS` row says «entero de 1 a 3600000»; the
`up` sequence lists the new step, and the output excerpt under «Lo que imprime al terminar» gains the
new `[up]` line and its summary (from the live run, date updated). `docs/DEPLOYMENT.md`'s table of
`npm run up` steps gains the row `node fixtures/build-history.mjs acme-shop` between `npm run db:seed`
and `npm run dev` (spec audit run 3). `docs/DEMO.md`'s paragraph after the `Paso 0` output describes
the new step and its ~11 s.

### D8. Live verification (Enhanced D14 and acceptance criterion 3)

A clone of the pushed branch in the scratchpad with its own Compose project name (the folder name)
and a free `POSTGRES_PORT`; `.env` from `.env.example` plus scripted line edits (never read or
printed). Ollama per the project's CPU recipe (tray app stopped, CPU-only variables,
`OLLAMA_CONTEXT_LENGTH=16384`, `qwen2.5-coder`), `LLM_TIMEOUT_MS=1200000`. Questions through the CLI
and `demo:ask`, durations recorded; the web in Chromium (browser-automation skill) when the CLI
answer took 15 min or less, otherwise the report and the guide say the web check did not run.
Since a CPU answer may still finish under 300 s, the deterministic proof is the recorded check
"A response after 300 s is accepted": a throwaway script in the scratchpad (not committed; its source
pasted in the report) starts a local server that answers after 310 s and calls the client built
through `createLlm` with `LLM_TIMEOUT_MS=600000`. **The web past 300 s (spec audit run 3, DR10):** the
same stub then serves the `dis103-live` API (`LLM_BASE_URL` pointing at it, `LLM_TIMEOUT_MS=600000`,
`up` restarted) and one free question is asked through `npm run demo:ask` and on Screen 2 in Chromium:
any outcome other than `LLM_UNAVAILABLE` / `timeout`, arriving after more than 300 s, proves that
neither the API, Vite's dev server and proxy nor the browser cut the request (the stub answers a valid
OpenAI completion whose text need not be a valid explain answer, so the API returns an answer or an
`UNKNOWN` such as `invalid-model-output`; on Screen 2 the check passes only with an answer or an
`UNKNOWN` showing «Motivo: …» after more than 300 s, since every `LLM_UNAVAILABLE` alert looks the
same there (`notice-display.ts`); through `demo:ask`, anything other than `LLM_UNAVAILABLE` with
reason `timeout` passes; spec audit run 4, DR12). Only then may the guide
and the PR say the web waits past 300 s; otherwise they say what was measured. **The Ollama tray app
(DR11):** task 0.4 records whether it runs; 8.3 starts it again if it did, since restoring the
machine's state comes first (the GPU crash on this machine happens when a model runs, not when the
app is open). **Ports (spec audit run 2, DR6):** `3000` and
`5173` are fixed (`packages/web/vite.config.ts` proxies to `127.0.0.1:3000`; only `POSTGRES_PORT`
differs per clone), so only one scratchpad `up` runs at a time: each start is preceded by a free-port
check of `127.0.0.1:3000` and `:5173`, the previous `up` is stopped (process tree) first, and a port
held by anything outside the scratchpad clones (for example the author's own instance) stops the run
and is recorded, never ended. Afterwards: `ollama` and any orphan `llama-server`
stopped, `docker compose -p <clone> down -v` on the clone only; the author's clone and
`codemind-postgres-1` untouched.

### D9. `.env.example` (Enhanced D12)

The agent's read rules on `.env*` stay. A count-only search (`git grep -c 300000 -- .env.example`)
tells whether its comment states the cap; if it does and the count-only check is allowed, the line is
fixed with a line-anchored scripted edit as in DIS-102 and checked with `git diff --stat`; if the
check is blocked, the PR records one line for the author.

### D10. Tests that change follow modified requirements

`tests/unit/llm/llm-config.spec.ts` (D5), `tests/unit/scripts/up.spec.ts` ("Up runs the start
sequence in order", "Ctrl+C stops up without a failure line": six calls) and
`tests/unit/docs/guides.spec.ts` ("The demo guide is ordered for a first-time reader": one more
heading). New: `tests/unit/llm/default-transport.spec.ts` (the two automated scenarios of
"The client waits as long as the configured timeout"), `tests/unit/scripts/defer-ctrl-c.spec.ts`,
the new guide scenario in `guides.spec.ts`, and the new timeout scenario in `llm-config.spec.ts`.
`tests/unit/cli/long-fetch.spec.ts` and `tests/integration/git/build-history.spec.ts` stay untouched.

### D11. No ADR

The transport and the range are local to the LLM adapter and reversible in one commit; the author
decided them in the ticket. `adr-new` criteria: not warranted (recorded in the step report).

### D12. `long-fetch.ts` stays in the mutation scope (spec audit run 1, DR2)

`stryker.config.json` mutates `packages/core`, `packages/cli` and `packages/api`, not
`packages/adapters`; moving `longFetch` would take it out of mutation testing. The file is added to
`mutate` (`packages/adapters/llm/src/long-fetch.ts`) and to `disableTypeChecks`, whose single glob
becomes `"{packages/core/src/**/*.ts,packages/cli/src/**/*.ts,packages/api/src/**/*.ts,packages/adapters/llm/src/long-fetch.ts}"`;
the rest of `packages/adapters` stays out (scope unchanged). The CI `mutation` job only runs when its
`business` path filter matches (`.github/workflows/ci.yml`), which lists `packages/cli/**` but not
`packages/adapters/**`: the filter gains `packages/adapters/llm/src/long-fetch.ts`, otherwise a later
PR touching only that file would skip mutation testing (spec audit run 2, DR7). The comments that say
Stryker mutates only core, cli and api (`ci.yml`, `vitest.stryker.config.ts`,
`docs/project-context.md`) are updated.

### D13. The guide is re-run in both shells (spec audit run 1, DR3)

`Paso 0` changes, and the scenario "The guide was followed on a clean clone in both shells" stays in
the modified requirement, so every command of `docs/DEMO.md` outside `Probar con un modelo real` is
run again literally in PowerShell and in Bash on clean clones (as DIS-102 did), and the run is
recorded in the PR body. The recorded check "Up with Docker unavailable fails naming its first step"
of the same requirement is re-run in both shells too. The clones run one after the other under the
port rule of D8 (DR6).

### D14. `gh` account

The pushes and the PR use the DisTinta account, which the author allowed to stay active for this
autonomous run (2026-10-18); the tasks do not switch back.

## Risks / Trade-offs

- [Every `up` spends ~11 s rebuilding `.git`] → acceptable against a hidden step; stated in the guide.
- [Git missing or failing] → the step fails with its exit code and `up` stops, as any step; `git
  --version` is already a prerequisite in `Antes de empezar`.
- [`rmSync` of a `.git` whose objects are read-only on Windows] → the builder already rebuilds over
  an existing `.git` (developers rerun it); the recorded check "Up builds the fixture history the
  seed indexed" runs `up` twice to prove it on this machine.
- [`up` rewrites `fixtures/acme-shop`'s tracked files for ~11 s on every start] → do not run the
  test suite in the same checkout during that step (the DIS-61 race of `docs/project-context.md`,
  whose text is updated by task 5.3); the agent's suite runs never overlap a local `up` of the same
  checkout.
- [This PR's `mutation` job runs every mutant (spec audit run 3, DR9)] → the cache key hashes
  `stryker.config.json` and `vitest.stryker.config.ts`, which this change edits, so no incremental
  report is restored (limit 40 min, DIS-26 measured ~30 min for a full run). Task 0.4 records the last
  base-branch `mutation` duration; on a timeout the job is re-run once, and a second timeout raises
  `timeout-minutes` in this change with its reason, recorded in the PR.
- [A real Ctrl+C on Windows is not exercised by a test] → Node's documented behaviour plus the POSIX
  test in CI; stated in the PR (D3, DR4).
- [A browser or the Vite dev server could cap a long request] → Vite's proxy and Fastify set no
  limit; verified live in Chromium only, and the guide claims nothing else (D6).
- [Default `node:http` agent behaviour differs from undici (keep-alive, proxies)] → Node's global
  `fetch` honours no proxy variable by default either; keep-alive reuse is harmless for one request
  at a time; `longFetch` is already proven by `cache:build` with minutes-long answers.
- [The Claude and hosted paths are unproven] → marked «no verificado», sourced from official docs,
  no key or URL invented.
- [A CPU answer that finishes under 300 s does not prove the cap is gone] → the deterministic 310 s
  check (D8).

## Migration Plan

None: no data or contract change. An existing `.env` with `LLM_TIMEOUT_MS` ≤ 300000 keeps working.
Rollback is reverting the branch's commits.

### Spec-audit amendments (run 1, 2026-10-20)

DR1 (no exit code `130` from the step; the preload only defers SIGINT), DR2 (D12), DR3 (D13), DR4 (D3
verification scope), DR5 (D6, Ollama as an app or service); the `up` scenario pins the exact
arguments; pasted paths use `<carpeta del clon>` (replaced by `<repo>` in run 4, DR13); the Claude limits are enumerated in the delta; the
recorded check of the history also compares the fingerprint inputs' hashes; the web check rule
(≤ 15 min); the restoration of the clone moves after the manual tests; `FINGERPRINT_MISMATCH`
wording in D3; a TDD fix of `longFetch` is allowed (D4); `gh` stays on DisTinta (D14).

### Spec-audit amendments (run 2, 2026-10-20)

DR6 (fixed ports `3000`/`5173`: one scratchpad `up` at a time, free-port check, never end a foreign
process; D8, D13), DR7 (CI `business` filter and the exact `disableTypeChecks` glob; D12), DR8 (literal
id and question in the guide; D6); the scenario of the preload covers the `process.exit(1)` run; the
history check may stop `up` by ending its process tree; the CPU times come from `readme.md`'s table;
stale comments about the mutation scope are listed in tasks 2.3b and 5.3.

### Spec-audit amendments (run 3, 2026-10-20)

`docs/DEPLOYMENT.md` table of `up` steps (D7; proposal Impact; task 5.2b); the readme output excerpt
and DEMO's `Paso 0` paragraph (D7; tasks 4.4, 5.1); project-context's DIS-61 paragraph (Risks; task
5.3); DR9 (full mutation run on this PR; Risks; tasks 0.4, 12.2); DR10 (deterministic web check past
300 s through the API and Chromium; D8; task 6.4b); DR11 (tray app state recorded and restored; D8;
tasks 0.4, 8.3); the `INVALID_CONFIG` check of 8.1 names its command.

### Spec-audit amendments (run 4, 2026-10-20, verdict APPROVED; minor points folded)

DR12 (web pass criterion; D8; task 6.4b), DR13 (`<repo>` reused for the clone's absolute path; D3,
delta, tasks 4.4, 5.1), `Cómo se capturó` states the real-model capture (delta; task 6.3d), per-shell
set/unset of variables in 8.1, both blocks of the Ollama pair run (D6; task 6.3a), 9.1 cites 6.4b,
embeddings in the default-transport scenario (delta; task 2.1).

## Follow-ups

None yet.
