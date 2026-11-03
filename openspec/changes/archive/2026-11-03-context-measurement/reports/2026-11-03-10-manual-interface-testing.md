# Manual Interface Testing Report

*(Agent's text, autonomous run, DIS-81.)*

- Date: 2026-11-03
- Change: context-measurement
- Step: 10 Manual Interface Testing and 11 End-to-End Testing
- Interface: `npm run measure:context`
- Versions: Node v24.11.1, npm 11.19.0, PowerShell (`pwsh`) 7.6.9, Windows PowerShell (`powershell.exe`) 5.1.26100.9818,
  Ollama 0.40.13, model `qwen2.5-coder:latest`. The OS user name is masked in paths (`<user>`).

## Setup

API at `http://127.0.0.1:3000` (`npm -w packages/api run dev`, detached, same `LLM_*` values as the run) and Ollama
at `http://127.0.0.1:11435` (`OLLAMA_CONTEXT_LENGTH=16384 ollama serve`, detached), as in task 7.3 of the live run
(see the step 9 report). All raw data present (the committed run).

## 10.1 Success path with all raw data present

`LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=qwen2.5-coder:latest LLM_MODEL_VERIFY= LLM_TIMEOUT_MS=1200000 npm run measure:context`
from Bash, then the same prefix before `pwsh -NoProfile -Command 'npm run measure:context'` and before
`powershell.exe -NoProfile -Command 'npm run measure:context'` (the PowerShell process inherits the variables; no
`$env:` assignment). Each run:

```
acme-shop: contexto bruto 86355 · CODEMIND 116025 · ahorro -34,4 % · 17 respondidas, 3 UNKNOWN
task-api: contexto bruto 52420 · CODEMIND 85200 · ahorro -62,5 % · 16 respondidas, 4 UNKNOWN
```

| Shell | Exit code | `git diff --exit-code -- docs/measurements/context` |
|---|---|---|
| Bash (Git Bash) | 0 | 0 (unchanged) |
| `pwsh` 7.6.9 | 0 | 0 (unchanged) |
| `powershell.exe` 5.1.26100.9818 | 0 | 0 (unchanged) |

No ask or generate request is made after the checks: all raw data is present and the runs took seconds. The
outputs are byte-identical to the committed ones.

## 10.2 Error cases on a scratchpad copy

The copy was made with `git archive HEAD fixtures seeds docs/measurements` extracted under the session scratchpad
(never the repository's frozen files) and deleted-by-session-end.

| Case | Command | Output | Exit |
|---|---|---|---|
| a changed `questions.json` (one byte appended in the copy) | `node scripts/measure-context.mjs --root <scratchpad>/copy1` | `docs/measurements/context/questions.json: the SHA-256 differs from the one the report records` | 1 |
| unknown argument | `node scripts/measure-context.mjs --verbose` | `Usage: node scripts/measure-context.mjs [--root <dir>]` | 2 |
| the API stopped (`node scripts/dev-processes.mjs stop` first; the copy's file restored) | `LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=qwen2.5-coder:latest node scripts/measure-context.mjs --root <scratchpad>/copy1` | `measure:context: the API is not reachable at http://127.0.0.1:3000 (start it with npm run up)` | 1 |

## 10.3 State restored

`git status` shows only the change's files (and the untouched local `.claude/sdd-harness.env`, never staged);
hashes equal the baseline of 9.1; `node scripts/dev-processes.mjs stop` ran; the agent's own `ollama serve` (port
11435) was stopped and the tray app and `ollama.exe` of the machine, which the agent never stopped, still answer on
port 11434; the database was restored with `npm run db:seed` and `npm run verify` exits 0 (step 9 report).

## 11 End-to-end

Not applicable to a user interface: no screen of `packages/web` changes. The end-to-end evidence is the live run of
task 7.4 through the real API and the real model (step 9 report: one launch, 40 answers, 89 counts, exit 0) and the
CI run of the pull request (task 13.2).

## Outcome

- Status: PASS
- Blocking issues: none
