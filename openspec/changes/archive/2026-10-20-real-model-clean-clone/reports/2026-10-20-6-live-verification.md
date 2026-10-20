# Live Verification Report

- Date: 2026-10-20
- Change: real-model-clean-clone (DIS-103)
- Step: 6 — Live verification on a clean clone (design D8)
- Machine: Windows 11 Pro 10.0.26300, Docker Desktop (Compose v5.5.1), Node v24.11.1, npm 11.19.0,
  Ollama 0.40.5 (CPU only on this machine), Chromium through the browser-automation skill (patchright).
  The OS user is written `<user>`.

## 6.1 Clone

- Branch pushed with the DisTinta account
  (`git -c credential.helper='!gh auth git-credential' push -u origin feature/DIS-103-real-model-clean-clone`), HEAD `1556be6`.
- `git clone --branch feature/DIS-103-real-model-clean-clone https://github.com/DisTinta/AI4Devs-finalproject dis103-live`
  in the agent's scratchpad. The scratchpad path is long, so the first checkout failed with
  `Filename too long` on archived report paths; `git config core.longpaths true`,
  `git restore --source=HEAD :/` and `git reset -q` completed it (`git status --porcelain` empty, 1395
  tracked files). This comes from the agent's deep scratchpad path, not from the repository (a clone
  under a short path, as in `readme.md` §1.4, needs nothing).
- `docker compose config --format json` → project name `dis103-live` (not `codemind`).
- **`.env` deviation.** The agent's permission rules deny any read or write of `.env*` files in this
  run (the clone's `cp .env.example .env` was refused: `cp to '…\.env' was blocked by a deny rule`).
  Every command therefore got its variables in its own environment instead (`POSTGRES_PORT=55441`,
  `DATABASE_URL=postgresql://codemind:codemind@localhost:55441/codemind`, and the `LLM_*` values below).
  `up`, the CLI and `demo:ask` load `.env` only for variables that are not already set, and a missing
  `.env` is skipped silently (`scripts/env.mjs`, `ENOENT`), so the effect is the one of the edited
  `.env` the guide describes. Helper scripts (scratchpad, not committed): `start-up.sh <clone> <log> VAR=value…`
  runs `env VAR=value… npm run up` in the background and prints its Windows PID; `stop-tree.sh <pid>`
  runs `taskkill /T /F /PID <pid>` (the agent's tools cannot send Ctrl+C).

## 6.2 Recorded check "Up builds the fixture history the seed indexed"

Before each start, `Get-NetTCPConnection` showed 3000, 5173, 55441 and 11434 free.

Run 1 (10:11:26 → API listening at 10:13:36), the `[up]` lines and the builder's summary:

```text
[up] docker compose up -d --wait
[up] npm install
[up] npm run db:migrate
[up] npm run db:seed
[up] node fixtures/build-history.mjs acme-shop
acme-shop: 32 commits, 3 authors -> C:\Users\<user>\AppData\Local\Temp\claude\…\scratchpad\dis103-live\fixtures\acme-shop\.git
[up] npm run dev
[0] {"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}
```

Checks after run 1 and again after run 2 (process tree ended, `up` started again over the existing
`.git`; the same six lines):

| Check | Run 1 | Run 2 |
|---|---|---|
| `git -C fixtures/acme-shop rev-parse HEAD` | `4f028db4d51a3321031f3a24b3f36240410ed38c` | `4f028db4d51a3321031f3a24b3f36240410ed38c` |
| `git status --porcelain` of the clone | empty | empty |
| `npm run verify` | `acme-shop: 3/3 golden answers match`, exit 0 | same, exit 0 |
| `git hash-object seeds/graph-dump.sql seeds/cache/acme-shop.json fixtures/build-history.mjs` | `4ef1b30…`, `e15463c…`, `69ba33e…` | same |

The hashes equal those of task 0.4 on the branch (`4ef1b30d20566a85c566ed2a0ee4d11eac1b61bd`,
`e15463ccc516187f531f56e4332dbfca5f7306c5`, `69ba33edcdafba6230bc2a316e4f88724156c4bb`). This also
closes the `npm run verify` half of task 3.5 (on the clone's seeded database; the author's database
`codemind-postgres-1` is stopped and was not touched).

## 6.3a Ollama on CPU

- Before: no `ollama` / `llama-server` process, tray app not running (task 0.4). A first
  `ollama list` with no server running started the Ollama desktop app (`ollama app.exe`) by itself
  (client 0.40.5); both processes were stopped at once (`Stop-Process`), before any model ran.
- The guide's PowerShell block, with this machine's CPU-only variables set first in the same
  terminal:
  `$env:CUDA_VISIBLE_DEVICES='-1'; $env:GGML_VK_VISIBLE_DEVICES='-1'; $env:OLLAMA_VULKAN='0'; $env:OLLAMA_LLM_LIBRARY='cpu'; $env:OLLAMA_CONTEXT_LENGTH='16384'; ollama serve`
  → log: `OLLAMA_CONTEXT_LENGTH:16384`, `Listening on 127.0.0.1:11434`, `library=cpu`, `total_vram="0 B"`. Stopped.
- The guide's Bash block (Git Bash), the same CPU-only variables in front:
  `CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu OLLAMA_CONTEXT_LENGTH=16384 ollama serve`
  → the same four log facts. Kept running.
- `ollama pull qwen2.5-coder` → `success` (`qwen2.5-coder:latest dae161e27b0e 4.7 GB`).
- `up` restarted (process tree ended, ports checked free) with `LLM_BASE_URL=http://localhost:11434/v1`,
  `LLM_API_KEY=` (empty), `LLM_MODEL=qwen2.5-coder`, `LLM_TIMEOUT_MS=1200000`: six `[up]` lines, API listening.

## 6.3b Free question through the CLI and the API

| Interface | Command | Start → end | Duration | Outcome |
|---|---|---|---|---|
| CLI | `npm run cli -- ask acme-shop "¿Qué hace DiscountService?"` | 10:17:13 → 10:25:41 | **508 s (8 min 28 s)** | answer, 2 statements (1 FACT, 1 INFERENCE), exit 0; one `entailment_unverified` event (`invalid-output`) |
| API, as the guide | `npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Qué hace DiscountService?"` | 10:25:54 → 10:25:56 | 2 s | HTTP 200, `cacheHit: true`: the CLI run had stored the answer |
| API, live | `node api-ask-nocache.mjs` (POST of the same question with `useCache: false`, over `node:http`) | 08:26:26Z → 08:31:27Z | **300.9 s** | HTTP 200, answer, 5 statements, 9 evidence, `cacheHit: false`, generation 6 591 + 399 tokens, 9 verification calls |

Neither `SOURCE_UNAVAILABLE` nor `LLM_UNAVAILABLE`. The guide's literal `demo:ask` is answered from the
cache because the guide asks through the CLI first; to exercise the live path through the API the same
question was sent with `useCache: false` (`demo:ask` has no cache flag). Its source:

```js
// Throwaway (DIS-103 6.3b): POST one question to the running API with useCache:false over node:http
// (no 300 s limit), timed, so the live path through the API is exercised although the CLI run cached it.
import { request } from 'node:http';
const question = process.argv[2] ?? '¿Qué hace DiscountService?';
const body = JSON.stringify({ question, useCache: false });
const t0 = Date.now();
console.log(new Date().toISOString(), 'sent', question);
const req = request('http://127.0.0.1:3000/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log(new Date().toISOString(), `HTTP ${res.statusCode} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    try { const j = JSON.parse(data); console.log(JSON.stringify({ kind: j.kind ?? j.status ?? null, reason: j.reason, error: j.error, statements: j.statements?.length, evidence: j.evidence?.length, usage: j.usage }, null, 2)); } catch { console.log(data.slice(0, 2000)); }
  });
});
req.on('error', (e) => console.log('error', e.code, e.message));
req.end(body);
```

## 6.3c Web (the CLI answer took 8 min 28 s, at most 15 min, so the check ran)

Screen 2 in Chromium (browser-automation skill, `--script web-ask.mjs`, which fills the question
field, presses Enter and waits up to 25 min for an answer, an `UNKNOWN` or an alert). The guide's
question was already cached by the CLI, so an uncached free question was asked instead, «¿Qué hace
ShippingService?». Sent 08:32:17Z, outcome 08:42:14Z: **597.7 s**, kind `answer` (5 statements with
«HECHO» / «INFERIDO», 6 evidence entries, usage panel «Confianza 0.85 · 9 764 tokens · $0 · 596.6 s ·
sin caché»), 0 console errors, 0 failed requests. Screenshot: `2026-10-20-6-web-live-answer.png`.

## 6.3d Guide

The CLI and `demo:ask` outputs above are pasted in `docs/DEMO.md` → `Probar con un modelo real` with
their durations, and `Cómo se capturó` records the capture (Ollama on CPU, `qwen2.5-coder`,
`OLLAMA_CONTEXT_LENGTH=16384`, `LLM_TIMEOUT_MS=1200000`, Git Bash, 2026-10-20, the durations) and the
`.env` deviation. The web claim is limited to Chromium.

## 6.4 Recorded check "A response after 300 s is accepted"

Throwaway stub (scratchpad, not committed), started with `node stub-310.mjs`:

```js
// Throwaway stub of an OpenAI-compatible model (DIS-103 design D8, not committed): answers every
// POST .../chat/completions with a valid completion DELAY_MS after the request (310 s by default).
import { createServer } from 'node:http';
const port = Number(process.env.STUB_PORT ?? 11500);
const delay = Number(process.env.DELAY_MS ?? 310_000);
const content = process.env.STUB_CONTENT ?? 'respuesta del stub tras 310 s';
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const t0 = Date.now();
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} (${body.length} bytes) -> answering in ${delay} ms`);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
      console.log(`${new Date().toISOString()} answered after ${Date.now() - t0} ms`);
    }, delay);
  });
}).listen(port, '127.0.0.1', () => console.log(`stub listening on 127.0.0.1:${port}, delay ${delay} ms`));
```

Check, run from the repository root with `npx tsx check-310.mts`:

```ts
// Throwaway check "A response after 300 s is accepted" (DIS-103 design D8, not committed): the client
// built through createLlm without a fetch, LLM_TIMEOUT_MS=600000, against the 310 s stub.
import { createLlm, llmConfigFromEnv } from '<repo>/packages/adapters/llm/src/index.ts';
const config = llmConfigFromEnv({ LLM_BASE_URL: 'http://127.0.0.1:11500/v1', LLM_MODEL: 'stub-model', LLM_TIMEOUT_MS: '600000' });
const llm = createLlm(config);
const t0 = Date.now();
console.log(`${new Date().toISOString()} request sent, timeoutMs=${config.mode === 'live' ? config.timeoutMs : '-'}`);
try {
  const result = await llm.complete({ purpose: 'answer', messages: [{ role: 'user', content: '¿Qué hace DiscountService?' }] });
  console.log(`${new Date().toISOString()} OK after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(result));
} catch (error) {
  console.log(`${new Date().toISOString()} FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, error);
  process.exitCode = 1;
}
```

Output:

```text
2026-10-20T08:18:06.115Z request sent, timeoutMs=600000
2026-10-20T08:23:16.168Z OK after 310.1 s: {"text":"respuesta del stub tras 310 s","model":"stub-model","usage":{"inputTokens":10,"outputTokens":5}}
```

Stub log: `POST /v1/chat/completions (90 bytes) -> answering in 310000 ms` at 08:18:06.143Z, then
`answered after 310012 ms`. Passed: the server's text after more than 300 s, no `LLM_UNAVAILABLE`.

## 6.4b Recorded check of the web past 300 s

`up` restarted (process tree ended, ports free) with `LLM_BASE_URL=http://127.0.0.1:11500/v1`,
`LLM_MODEL=stub-model`, `LLM_TIMEOUT_MS=600000`. The stub answers a valid OpenAI completion whose text
is not an explain answer, so the expected outcome is `UNKNOWN (invalid-model-output)` after more than
300 s.

| Interface | Question | Start → end | Duration | Outcome |
|---|---|---|---|---|
| `npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Qué hace TaxService?"` | uncached | 10:44:29 → 10:49:41 | **312 s** | HTTP 200, `{"answer":"UNKNOWN","reason":"invalid-model-output"}` |
| Screen 2, Chromium | «¿Qué hace CouponValidator?» | 08:44:39Z → 08:49:50Z | **310.8 s** | «Sin respuesta verificada», «El modelo devolvió una respuesta con un formato no válido y se ha descartado.», «Motivo: invalid-model-output»; 0 console errors, 0 failed requests |

A first `demo:ask` with «¿Qué hace PaymentService?» answered `UNKNOWN (no-anchor)` in 2 s without
calling the model (acme-shop has no such class); it is not part of the check. Stub log: the two
requests were answered after 310 009 ms and 310 015 ms. Neither outcome is `LLM_UNAVAILABLE` /
`timeout`, and Screen 2 shows an `UNKNOWN` with «Motivo: …» after more than 300 s (DR12): neither the
API, Vite's dev server and proxy nor Chromium cut the request. Screenshot:
`2026-10-20-6-web-past-300s.png`. The clone has no `.env` to restore: each later `up` gets its
variables per command.

## 6.5 Clean-up

`up` stopped by its process tree; the stub stopped; every `ollama` / `llama-server` process stopped
(`Get-Process` count 0); ports 3000, 5173, 11434 and 11500 free. The tray app stays stopped, as it was
before the run (task 0.4). The clone `dis103-live` and its Compose project stay for step 8.
