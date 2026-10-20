# Manual Interface Testing Report

- Date: 2026-10-20
- Change: real-model-clean-clone (DIS-103)
- Step: 8 — Manual interface testing (8.1 to 8.3)
- Machine: Windows 11 Pro 10.0.26300, Docker Desktop (Compose v5.5.1), Node v24.11.1, npm 11.19.0,
  Git 2.45.1, PowerShell 7.6.6, Git Bash. The OS user is written `<user>`.
- Clones: `dis103-live` (step 6), `dis103-bash` and `dis103-pwsh` (fresh, `da94264`), all in the
  agent's scratchpad with `core.longpaths=true` (long scratchpad path) and their own Compose projects.
- **`.env` deviation (same as step 6).** The agent cannot read or write `.env*` files in this run, so
  every command got `POSTGRES_PORT` / `DATABASE_URL` (and, where named, `LLM_*`) in its own
  environment; a variable already set wins over `.env`, and a missing `.env` is skipped silently.
- Ports `3000` and `5173` were checked free (`Get-NetTCPConnection`) before every `npm run up`; only
  one scratchpad `up` ran at a time and each was stopped by ending its process tree (`taskkill /T /F`)
  before the next. No foreign process held those ports.

## 8.1 In `dis103-live`, Bash and PowerShell

| Check | Bash | PowerShell |
|---|---|---|
| `npm run up` prints the six `[up]` lines (`… db:seed`, `node fixtures/build-history.mjs acme-shop`, `npm run dev`) | yes (step 6.2 runs and the run below) | yes (`up-pwsh.log`, lines 5–46) |
| CLI with `LLM_TIMEOUT_MS=3600001` (live mode: `LLM_BASE_URL`, `LLM_MODEL` set) | `{"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","details":{"variable":"LLM_TIMEOUT_MS"}}}`, exit 1 | the same line, exit 1; `$env:LLM_TIMEOUT_MS='3600001'` then `Remove-Item Env:LLM_TIMEOUT_MS` (empty afterwards) |
| CLI with `LLM_TIMEOUT_MS=3600000` | accepted: `UNKNOWN (no-anchor)` for «x», exit 0 | — |
| `npm run up` with `LLM_TIMEOUT_MS=3600001` | reaches `[up] npm run dev`; the API prints one line `[0] {"error":{"code":"LLM_CONFIG_INVALID",…,"details":{"variable":"LLM_TIMEOUT_MS"}}}` and `Failed running 'src/server.ts'`; the value `3600001` appears 0 times in the log; the web answers `200` on `http://localhost:5173/`, the API does not listen | the same (`up-pwsh.log` lines 64–67, `3600001` 0 times, web `200`) |
| `node fixtures/build-history.mjs acme-shop` by hand | `acme-shop: 32 commits, 3 authors -> C:\Users\<user>\…\dis103-live\fixtures\acme-shop\.git`, exit 0 in 10 s; `HEAD` `4f028db4d51a3321031f3a24b3f36240410ed38c`; `git status --porcelain` empty | the same, 12 s, same `HEAD`, clean tree |
| Recorded check "Up with Docker unavailable fails naming its first step" (`DOCKER_HOST=tcp://127.0.0.1:1`) | `[up] docker compose up -d --wait`, `error during connect: … actively refused it.`, `[up] "docker compose up -d --wait" failed with exit code 1`, no `npm install`, exit 1 | the same, exit 1; `$env:DOCKER_HOST` removed afterwards (empty) |

Note on the task wording: task 8.1 calls the API's configuration line `INVALID_CONFIG`; for an invalid
`LLM_*` variable the API prints the LLM adapter's own code, `LLM_CONFIG_INVALID` (unchanged by this
change; `INVALID_CONFIG` is the API's code for its own variables such as `DATABASE_URL`). What the
check needs holds: one line naming `LLM_TIMEOUT_MS` without its value, and the web stays up.

## 8.2 Recorded check "The guide was followed on a clean clone in both shells"

Every command of `docs/DEMO.md` outside `Probar con un modelo real`, run literally, in order, in
`dis103-bash` with the Bash tool (`POSTGRES_PORT=55442`) and in `dis103-pwsh` with the PowerShell tool
(`POSTGRES_PORT=55443`), one clone after the other. Outputs were saved per command and compared with
the block the guide pastes after the same command by a throwaway script (`compare-guide.mjs`), which
ignores the fields the guide lists as changing (`latencyMs`, `time`/`pid`/`hostname`, `(node:<pid>)`,
`ready in … ms`, the Docker prefix, the clone path).

| Command | Bash | PowerShell |
|---|---|---|
| `docker info` / `node -v` / `git --version` | exit 0 / `v24.11.1` / `git version 2.45.1.windows.1` | the same |
| `cp .env.example .env` | not run: refused by the agent's `.env` deny rule (deviation above) | same |
| `npm run up` | six `[up]` lines; differs from the old paste only in the first-run Docker lines (`Network … Creating`, `Volume … Creating` instead of `Recreate`, because the clone was new) and the new history step → **pasted as the new `Paso 0` output** | the same differences |
| `npm run cli -- projects` | identical | identical |
| Paso 1 CLI and `demo:ask` | identical | identical (accented question intact) |
| Paso 2 `demo:excerpt` | identical | identical |
| Paso 3 refunds | identical | identical |
| Paso 4 `impact` | identical | identical |
| Paso 5, both `demo:ask` | identical | identical |
| Paso 6 `task-api` | identical (`PROJECT_NOT_FOUND`, exit 1) | identical, exit 1 |
| `npm run verify` | `acme-shop: 3/3 golden answers match`, exit 0 | the same |
| `npm -w packages/web run dev` (after stopping `up`) | Screen 1 alert «La API de CODEMIND no está disponible. … pulsa Reintentar.» with «Reintentar» (Chromium, `--eval` of `[role=alert]`) | the same text |
| `npm run down` | container and network removed, exit 0 | the same → **pasted as the new `Parar el sistema` output** |

Guide changes from this run: `Paso 0`'s pasted output (Bash run, the clone path written `<repo>`, the
host `<host>`), `Parar el sistema`'s output (PowerShell run), the Docker prefix examples, and
`Cómo se capturó` (date 2026-10-20, commit `da94264`, the `.env` deviation, and that the
port-collision output of `Antes de empezar` is from the 2026-10-19 capture). `readme.md`'s excerpt of
the `up` output gained the history line and its summary (date 2026-10-20). The review half of "The web
walkthrough names what each screen shows" was not re-run: `Recorrido por la web` is unchanged.

## 8.3 Restore

- `docker compose -p <clone> down -v` for `dis103-live`, `dis103-bash` and `dis103-pwsh` only (their
  volumes and networks removed); the three clones moved to the scratchpad's `trash/` folder (no
  `rm -rf`).
- The author's clone `C:/Users/<user>/Desktop/AI4Devs-finalproject` was not touched;
  `codemind-postgres-1` is still `Exited` (never started).
- No `ollama` / `llama-server` process; the Ollama tray app stays stopped, as task 0.4 found it.
- Ports 3000, 5173, 11434 and 11500 free.
- The 0.4 indicators: the three fingerprint input hashes are unchanged (`4ef1b30…`, `e15463c…`,
  `69ba33e…`); the author's database was not queried at 0.4 nor now, because its container is stopped
  and is not to be touched.
