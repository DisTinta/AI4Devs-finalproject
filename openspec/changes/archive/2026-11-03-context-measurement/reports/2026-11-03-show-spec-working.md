# Show spec working: context-measurement (DIS-81)

*(Agent's text, review step of the autonomous run, 2026-11-03.)*

- Interface: `npm run measure:context` (`node scripts/measure-context.mjs [--root <dir>]`).
- Live system: the API started detached for this step (`npm -w packages/api run dev`, port 3000, with
  `LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder:latest LLM_MODEL_VERIFY= LLM_TIMEOUT_MS=1200000`
  on its command line), the Docker Postgres `codemind-postgres-1` (healthy), and the machine's Ollama 0.40.13 on port
  11434, which lists `qwen2.5-coder:latest` with the digest of the published run
  (`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`).
- Copies: `git archive HEAD fixtures seeds docs/measurements` extracted under the session scratchpad
  (`<scratchpad>/live`); the repository's frozen files were never touched. OS user name masked as `<scratchpad>`.
- Note: this Ollama runs with its default context length, not the `OLLAMA_CONTEXT_LENGTH=16384` of the published
  run. Only the one demonstration answer below went through it, on a copy; no committed figure comes from it.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Committed measurement matches the raw data (success path, no request after the checks) | `npm run measure:context` on the repository | exit 0, the two summary lines, `git diff --exit-code -- docs/measurements/context` exit 0, 0 `/ask` requests in the API log | yes | E1 |
| Every question is sent without the cache / A resumed run skips the answered questions (live) | copy without `raw/acme-shop/Q10.json`, `node scripts/measure-context.mjs --root .` | one `POST /api/projects/a794456d-…/ask`, stdout `acme-shop Q10: respondida`, raw response written with `usage.cacheHit` `false`, outputs rebuilt, exit 0 | yes | E2 |
| An unknown argument is a usage error (both cases) | `--verbose`; `PORT=abc` | exit 2 with the usage line; exit 2 with the `PORT` line | yes | E3 |
| The model variable is not set | `LLM_MODEL=" "` | exit 1, `measure:context: LLM_MODEL is not set` | yes | E3 |
| The API does not answer | `PORT=3999` | exit 1, the exact unreachable line with port 3999 | yes | E3 |
| The Ollama version check fails | `LLM_BASE_URL` at an unused port | exit 1, line naming `/api/version` | yes | E3 |
| The model is not in Ollama | `LLM_MODEL=no-such-model` | exit 1, line naming `LLM_MODEL` | yes | E3 |
| A raw run of another model is not mixed | `LLM_MODEL=nomic-embed-text:latest` (listed by Ollama) | exit 1, line naming `docs/measurements/context/raw/run.json`; also seen with `.env`'s own `LLM_MODEL_VERIFY` (another verification model) | yes | E3, E4 |
| A stale raw response stops the run | copy whose `raw/task-api/Q05.json` has another `question` | exit 1, line naming `docs/measurements/context/raw/task-api/Q05.json` | yes | E4 |
| A sample file differs from the seed | copy with one byte appended to `fixtures/task-api/src/app.ts` | exit 1, line naming the file | yes | E4 |
| A frozen question file was modified | copy with one byte appended to `questions.json` | exit 1, line naming `docs/measurements/context/questions.json` | yes | E4 |

## Evidence

E1, success path on the repository (all raw data present):

```
$ LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder:latest LLM_MODEL_VERIFY= npm run measure:context
acme-shop: contexto bruto 86355 · CODEMIND 116025 · ahorro -34,4 % · 17 respondidas, 3 UNKNOWN
task-api: contexto bruto 52420 · CODEMIND 85200 · ahorro -62,5 % · 16 respondidas, 4 UNKNOWN
exit=0
$ git diff --exit-code --stat -- docs/measurements/context
diff-exit=0
$ grep -c '"url":"/api/projects' <scratchpad>/api.log
0
```

E2, one live question through the real API and model (copy without `raw/acme-shop/Q10.json`):

```
$ LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder:latest LLM_MODEL_VERIFY= node scripts/measure-context.mjs --root <scratchpad>/live
acme-shop Q10: respondida
acme-shop: contexto bruto 86355 · CODEMIND 116030 · ahorro -34,4 % · 17 respondidas, 3 UNKNOWN
task-api: contexto bruto 52420 · CODEMIND 85200 · ahorro -62,5 % · 16 respondidas, 4 UNKNOWN
exit=0
API log: "url":"/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask"   (one request)
raw/acme-shop/Q10.json: question "¿Qué comprueba el middleware EnsureCartNotEmpty?", receivedAt 2026-11-03T13:08:23.675Z,
  usage {"inputTokens":865,"outputTokens":86,"baselineTokens":166,"savingsPct":-421.1,"latencyMs":45422,"cacheHit":false,
  "generation":{"inputTokens":485,"outputTokens":76},"verification":{"calls":1,"cacheHits":0,"inputTokens":380,"outputTokens":10,"latencyMs":7680}}
```

The copy's `acme-shop` «CODEMIND» moved from 116 025 to 116 030 (the new answer used 865 input tokens against 860
in the published one), so the outputs are rebuilt from the raw data and not cached; the repository was not changed.

E3, environment and argument errors (cwd `<scratchpad>/live`, `--root .`):

```
--- verbose                      Usage: node scripts/measure-context.mjs [--root <dir>]            exit=2
--- PORT=abc                     measure:context: PORT must be a port number                        exit=2
--- LLM_MODEL blank              measure:context: LLM_MODEL is not set                              exit=1
--- API unreachable (PORT 3999)  measure:context: the API is not reachable at http://127.0.0.1:3999 (start it with npm run up)   exit=1
--- Ollama version fails         measure:context: GET /api/version of the Ollama server did not answer with a version           exit=1
--- model not in Ollama          measure:context: LLM_MODEL is not listed by GET /api/tags of the Ollama server                  exit=1
--- another model than run.json  docs/measurements/context/raw/run.json: the raw data was made with another model, modelDigest, verifyModel; delete the raw data to measure again   exit=1
```

E4, input tampering on the copy (each restored afterwards):

```
--- stale raw          docs/measurements/context/raw/task-api/Q05.json: the question differs from the question file's (stale raw response)   exit=1
--- fixture changed    fixtures/task-api/src/app.ts: the SHA-256 differs from the content_hash of seeds/graph-dump.sql                     exit=1
--- questions changed  docs/measurements/context/questions.json: the SHA-256 differs from the one the report records                    exit=1
--- restored copy      the two summary lines                                                                                              exit=0
--- (without LLM_MODEL_VERIFY= on the command line, .env's verification model) docs/measurements/context/raw/run.json: the raw data was made with another verifyModel; ...   exit=1
```

After all the error cases the API log still holds exactly one `/ask` request (the E2 one): no error case sent a
question.

## State

- Before: `git status` clean apart from `.claude/sdd-harness.env` (never staged); API not running; database as left
  by the apply step (`npm run db:seed` and `npm run verify` green, step 9 report).
- After: the one live question wrote a `query_log` row and its claims and, with `useCache: false`, could replace a
  `cache_entry` row of `acme-shop`.
- Restored: yes. `node scripts/dev-processes.mjs stop` (1 process tree; `GET /health` no longer answers, curl exit 7),
  `npm run db:seed` (`2 projects loaded`, `acme-shop` 174 nodes · 170 edges, `task-api` 102 nodes · 100 edges) and
  `npm run verify` (`acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match`). The machine's
  Ollama was not started or stopped by this step. The scratchpad copy is outside the repository. No screenshot was
  taken (no UI is involved) and none was left at the repository root.

## Not demonstrated

- The tokenizer count against a live Ollama (`/api/generate`) was not repeated: all 89 counts are present, and a
  recount needs deleting them, which the spec forbids for the committed data. It is covered by the published run
  (step 9 report: 89 counts, exit 0) and by "Every non-redacted file is counted once" with a fake Ollama.
- The `llm-required`, `cacheHit: true`, non-200 and non-JSON answers cannot be produced by the live API in live mode
  on demand; they are covered by their fake-sender tests in `tests/unit/scripts/measure-context.spec.ts`.

**Handoff:** the change is demonstrably working through its real interface: the committed outputs are the
aggregation of the raw data, a missing answer is asked live with `useCache: false` and resumed, and every
environment and input error demonstrated exits with the code and the line the spec gives, sending no question.
