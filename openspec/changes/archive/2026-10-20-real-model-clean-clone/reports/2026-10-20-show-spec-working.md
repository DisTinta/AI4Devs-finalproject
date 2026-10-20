# Show Spec Working — real-model-clean-clone (DIS-103)

- Date: 2026-10-20 (task 12.3)
- Branch: `feature/DIS-103-real-model-clean-clone`, HEAD `48d3578` (local and `origin` equal)
- Machine: Windows 11 Pro 10.0.26300, Docker Desktop, Node v24.11.1, Git Bash. The OS user is
  written `<user>`; the scratchpad path is shortened to `…scratchpad`.
- Approach: a **new** clean clone of the pushed branch (`dis103-ssw`, Compose project `dis103-ssw`,
  `POSTGRES_PORT=55444`) exercised now, plus a fresh run of the 310 s check against the branch code.
  The long live runs with Ollama on CPU (8–10 min per question) and the web checks in Chromium are
  reused from the step 6 report (`2026-10-20-6-live-verification.md`) and the run of the guide in
  both shells from the step 8 report (`2026-10-20-8-manual-interface-testing.md`), both made today on
  clean clones of this branch (the commits after them change only reports and `prompts.md`).
- `.env` deviation (as in steps 6 and 8): the agent cannot read or write `.env*` files, so each
  command got its variables in its own environment (a variable already set wins over `.env`; a
  missing `.env` is skipped).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Up builds the fixture history the seed indexed | fresh clone without `fixtures/acme-shop/.git`; `npm run up` twice (process tree ended between runs) | six `[up]` lines, the history step between `db:seed` and `dev`, summary `32 commits`; after each run `HEAD` `4f028db…`, tree clean, `npm run verify` exit 0 (3/3), fingerprint input hashes equal to the branch's | yes | §1, §2 |
| A timeout above 300 s is accepted / A malformed timeout (`3600001`) | `npm run cli -- ask acme-shop "x"` in live mode with `LLM_TIMEOUT_MS` = `3600001`, `3600000`, `300001` | `3600001` → `LLM_CONFIG_INVALID` naming `LLM_TIMEOUT_MS`, value not printed, exit 1; `3600000` and `300001` accepted (`UNKNOWN (no-anchor)`, exit 0, no model call) | yes | §3 |
| A response after 300 s is accepted | `createLlm` without `fetch`, `LLM_TIMEOUT_MS=600000`, stub answering after 310 s | `OK after 310.1 s` with the stub's text; no `LLM_UNAVAILABLE` | yes | §4 |
| Up with Docker unavailable fails naming its first step | `DOCKER_HOST=tcp://127.0.0.1:1 npm run up` (Bash) | `[up] docker compose up -d --wait`, `[up] "docker compose up -d --wait" failed with exit code 1`, no `npm install`, exit 1 | yes (Bash now; PowerShell in step 8.1) | §5 |
| Building the history changes neither fingerprints nor evaluation answers | `npm run verify` after each `up`; a free question through `demo:ask` in evaluation mode | 3/3 golden answers match; free question → `UNKNOWN` / `llm-required` (unchanged evaluation behaviour) | yes | §2, §6 |
| Automated scenarios of both deltas (25 of 30) | `npx vitest run tests/unit/llm tests/unit/scripts tests/unit/docs tests/unit/cli/long-fetch.spec.ts tests/unit/cli/cache-build.spec.ts` | 16 files, 148 tests passed; every non-recorded scenario maps to a test of the same name | yes | §7 |
| The Ollama path was followed on a clean clone | reused (step 6.3a–6.3b) | CLI answer after 508 s; API (uncached) answer after 300.9 s; no `SOURCE_UNAVAILABLE` / `LLM_UNAVAILABLE` | yes | step 6 report |
| Web past 300 s (DR10/DR12) and a live web answer | reused (step 6.3c, 6.4b, Chromium) | live answer after 597.7 s; stub `UNKNOWN` with «Motivo: invalid-model-output» after 310.8 s; 0 console errors | yes | `./2026-10-20-6-web-live-answer.png`, `./2026-10-20-6-web-past-300s.png` |
| The guide was followed on a clean clone in both shells | reused (step 8.2) | every command outside `Probar con un modelo real` identical in Bash and PowerShell apart from the listed changing fields; the API-down alert of the web the same in both | yes | step 8 report |

## Evidence

### §1 Fresh clone

```text
$ git -c core.longpaths=true clone -q --branch feature/DIS-103-real-model-clean-clone https://github.com/DisTinta/AI4Devs-finalproject dis103-ssw
git status --porcelain → 0 lines; HEAD 48d3578767a6c8ca558283b57c9bc60883106230
ls fixtures/acme-shop/.git → No such file or directory
docker compose config --format json → name "dis103-ssw"
ports 3000, 5173, 11500, 55444: free (netstat); no container running
```

### §2 `npm run up`, run 1 (11:29:30 → API listening 11:31:12) and run 2 (11:31:51 → 11:32:20)

Both runs printed the same lines:

```text
[up] docker compose up -d --wait
[up] npm install
[up] npm run db:migrate
[up] npm run db:seed
[up] node fixtures/build-history.mjs acme-shop
acme-shop: 32 commits, 3 authors -> C:\Users\<user>\…scratchpad\dis103-ssw\fixtures\acme-shop\.git
[up] npm run dev
[0] {"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}
```

After each run:

```text
git -C fixtures/acme-shop rev-parse HEAD → 4f028db4d51a3321031f3a24b3f36240410ed38c
git status --porcelain → 0 lines
git hash-object seeds/graph-dump.sql seeds/cache/acme-shop.json fixtures/build-history.mjs
  → 4ef1b30d20566a85c566ed2a0ee4d11eac1b61bd
    e15463ccc516187f531f56e4332dbfca5f7306c5
    69ba33edcdafba6230bc2a316e4f88724156c4bb   (equal to task 0.4)
npm run verify → acme-shop: 3/3 golden answers match, exit 0
```

Between the runs, `up` was stopped by ending its process tree (`taskkill /T /F`) and ports 3000/5173
were checked free before the second start.

### §3 Timeout range through the real CLI (live mode: `LLM_BASE_URL=http://127.0.0.1:11500/v1`, `LLM_MODEL=stub-model`)

```text
--- LLM_TIMEOUT_MS=3600001
{"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","details":{"variable":"LLM_TIMEOUT_MS"}}}
exit 1
--- LLM_TIMEOUT_MS=3600000
UNKNOWN (no-anchor)
exit 0
--- LLM_TIMEOUT_MS=300001
UNKNOWN (no-anchor)
exit 0
```

The stub's log shows no request from these runs (`x` has no anchor, so no model call).

### §4 310 s check (the step 6.4 scripts, re-run now against HEAD `48d3578`)

```text
stub listening on 127.0.0.1:11500, delay 310000 ms
2026-10-20T09:29:01.817Z request sent, timeoutMs=600000
2026-10-20T09:29:01.844Z POST /v1/chat/completions (90 bytes) -> answering in 310000 ms
2026-10-20T09:34:11.852Z answered after 310008 ms
2026-10-20T09:34:11.876Z OK after 310.1 s: {"text":"respuesta del stub tras 310 s","model":"stub-model","usage":{"inputTokens":10,"outputTokens":5}}
```

Sources of `stub-310.mjs` and `check-310.mts`: step 6 report, §6.4.

### §5 Docker unavailable (Bash)

```text
$ DOCKER_HOST=tcp://127.0.0.1:1 POSTGRES_PORT=55444 npm run up
[up] docker compose up -d --wait
error during connect: Get "http://127.0.0.1:1/_ping": dial tcp 127.0.0.1:1: connectex: No connection could be made because the target machine actively refused it.
[up] "docker compose up -d --wait" failed with exit code 1
exit 1
```

### §6 Evaluation mode unchanged

```text
$ npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Qué hace DiscountService?"
{
  "answer": "UNKNOWN",
  "reason": "llm-required",
  "message": "evaluation mode (cache-only): set LLM_* to enable free-form asks"
}
exit 0
```

### §7 Automated scenarios

```text
Test Files  16 passed (16)
     Tests  148 passed (148)
```

Scenario → test mapping (grep of each `#### Scenario:` name under `tests/`): the 11 scenarios of
"LLM configuration is classified and validated when read" → `tests/unit/llm/llm-config.spec.ts`; the
two automated ones of "The client waits as long as the configured timeout" →
`tests/unit/llm/default-transport.spec.ts`; the `up` scenarios → `tests/unit/scripts/up.spec.ts`,
`defer-ctrl-c.spec.ts`, `wiring.spec.ts`; the guide scenarios → `tests/unit/docs/guides.spec.ts`. The
five without a test are the recorded checks (310 s, Docker unavailable, history of the seed, guide in
both shells, Ollama path), all demonstrated above or in the step 6/8 reports.

## State

- Before: no `dis103-ssw` clone, Compose project or volume; ports 3000, 5173, 11500, 55444 free; no
  `ollama` / `llama-server`; `codemind-postgres-1` `Exited`.
- After: `docker compose -p dis103-ssw down -v` (volume `dis103-ssw_pgdata` and network removed);
  the clone moved to the scratchpad's `trash/` (no `rm -rf`); `up` and the stub stopped; ports free;
  no `ollama` process; `codemind-postgres-1` still `Exited`; the author's clone not touched.
- Restored: yes.

## Not demonstrated

- A real Ctrl+C during the history step on Windows: the agent's tools cannot press Ctrl+C in a Windows
  console (design D3, DR4); the preload is exercised by `defer-ctrl-c.spec.ts` (a real SIGINT on
  POSIX in CI, the listener path on Windows).
- The hosted OpenAI-compatible API and Claude paths: no key; the guide marks both «no verificado».
- `cp .env.example .env` and the `.env` edits literally: blocked by the agent's `.env` rules; the same
  values were given per command (deviation recorded in steps 6 and 8 and in `Cómo se capturó`).

## Handoff

The change is **demonstrably working**: on a new clean clone `npm run up` builds the fixture history
the seed indexed (twice, same `HEAD`, clean tree, fingerprints and golden answers unchanged), the CLI
enforces the new one-hour range, and the default transport accepts a response after 310 s. The live
Ollama, API and web evidence of step 6 and the two-shell run of step 8 cover the rest. No screenshot
was written at the repository root; the two screenshots live in this `reports/` folder.
