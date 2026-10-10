# Step 12 — Manual interface testing (DIS-18, `llm-evaluation-budget`)

Date: 2026-10-10. Branch `feature/DIS-18-llm-evaluation-budget`. OS user name masked as `<user>`.

No CLI or HTTP entry point uses the LLM yet (DIS-76), so the change was exercised through a throwaway
`tsx` script in the session scratchpad (never committed, deleted afterwards). It imports the real
sources (`packages/core`, `packages/adapters/llm`, `packages/adapters/store-postgres`), runs against the
local Postgres of `docker compose up -d` (migrated, `npm run db:migrate` → `No migrations to run!`) and
the local Ollama on `http://localhost:11434`, and wraps the global `fetch` with a call counter.
`DATABASE_URL` was exported from `.env` in a subshell, without printing it; no other variable of `.env`
was loaded.

## Command

```
export DATABASE_URL="$(. ./.env >/dev/null 2>&1; printf %s "$DATABASE_URL")"
npx tsx <scratchpad>/manual-dis18.mts
```

## Script (as run)

```ts
import { createRequire } from 'node:module';
import { BudgetExhausted, withDailyBudget, type CompletionRequest } from 'file:///C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/packages/core/src/index.ts';
import { createLlm, llmConfigFromEnv, LlmConfigError } from 'file:///C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/packages/adapters/llm/src/index.ts';
import { createPostgresStore } from 'file:///C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/packages/adapters/store-postgres/src/index.ts';

const pg = createRequire('C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/package.json')('pg') as typeof import('pg');
const OLLAMA = 'http://localhost:11434/v1';
const ASK: CompletionRequest = { messages: [{ role: 'user', content: 'Responde solo: hola' }], purpose: 'answer' };
const show = (e: unknown) =>
  e instanceof Error ? { name: e.name, code: (e as { code?: string }).code, message: e.message, ...e } : e;

let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => { fetchCalls += 1; return realFetch(...args); }) as typeof fetch;

async function count(c: import('pg').Client) {
  return (await c.query('SELECT count(*)::int AS n FROM query_log')).rows[0].n as number;
}

async function main() {
  console.log('== 12.2 evaluation path');
  const evalCfg = llmConfigFromEnv({});
  const evalLlm = createLlm(evalCfg);
  console.log('mode', evalCfg.mode, evalLlm.mode);
  for (const [label, call] of [['complete', () => evalLlm.complete(ASK)], ['embed', () => evalLlm.embed(['a'])]] as const) {
    console.log(label, show(await call().catch((e: unknown) => e)));
  }
  console.log('fetch calls', fetchCalls);

  console.log('== 12.3 ceiling path (real DB, rolled back)');
  const observer = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await observer.connect();
  const before = await count(observer);
  console.log('query_log count before', before);
  const tx = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await tx.connect();
  await tx.query('BEGIN');
  try {
    const projectId = await createPostgresStore({ transaction: tx }).createProject({ name: 'manual-dis18', rootPath: '/repos/sample', language: 'php' });
    const now = new Date().toISOString();
    for (const cost of ['1.0', '0.5']) {
      await tx.query("INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'q', 'explain', $2, $3)", [projectId, cost, now]);
    }
    const cfg = llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2', DAILY_BUDGET_USD: '1' });
    if (cfg.mode !== 'live' || cfg.dailyBudgetUsd === undefined) throw new Error('expected a live config with a ceiling');
    console.log('config', { mode: cfg.mode, model: cfg.model, dailyBudgetUsd: cfg.dailyBudgetUsd });
    fetchCalls = 0;
    for (const run of ['first process', 'restart']) {
      const llm = withDailyBudget(createLlm(cfg), { store: createPostgresStore({ transaction: tx }), dailyBudgetUsd: cfg.dailyBudgetUsd });
      const e = await llm.complete(ASK).catch((x: unknown) => x);
      console.log(run, e instanceof BudgetExhausted, show(e));
    }
    console.log('fetch calls', fetchCalls);
  } finally {
    await tx.query('ROLLBACK');
    await tx.end();
  }
  console.log('query_log count after rollback', await count(observer));

  console.log('== 12.4 below the ceiling (Ollama)');
  const cfg = llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2', DAILY_BUDGET_USD: '1' });
  if (cfg.mode !== 'live' || cfg.dailyBudgetUsd === undefined) throw new Error('expected live');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    fetchCalls = 0;
    const llm = withDailyBudget(createLlm(cfg), { store: createPostgresStore({ pool }), dailyBudgetUsd: cfg.dailyBudgetUsd });
    const r = await llm.complete(ASK).catch((e: unknown) => e);
    if (r instanceof Error) console.log('mode', llm.mode, 'passed through to Ollama, failure unchanged:', show(r), 'fetch calls', fetchCalls);
    else console.log('mode', llm.mode, 'model', (r as { model: string }).model, 'text', JSON.stringify((r as { text: string }).text.slice(0, 60)), 'fetch calls', fetchCalls);
  } finally {
    await pool.end();
  }

  console.log('== 12.5 configuration errors');
  for (const env of [
    { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2', DAILY_BUDGET_USD: 'abc' },
    { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2:3b', DAILY_BUDGET_USD: '1' },
  ]) {
    try { llmConfigFromEnv(env); console.log('no error?!'); } catch (e) { console.log(e instanceof LlmConfigError, show(e)); }
  }
  console.log('query_log count end', await count(observer));
  await observer.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

## Output (exit 0)

```
== 12.2 evaluation path
mode evaluation evaluation
complete {
  name: 'LlmUnavailable',
  code: 'LLM_UNAVAILABLE',
  message: 'LLM unavailable: evaluation-mode',
  reason: 'evaluation-mode'
}
embed {
  name: 'LlmUnavailable',
  code: 'LLM_UNAVAILABLE',
  message: 'LLM unavailable: evaluation-mode',
  reason: 'evaluation-mode'
}
fetch calls 0
== 12.3 ceiling path (real DB, rolled back)
query_log count before 0
config { mode: 'live', model: 'llama3.2', dailyBudgetUsd: 1 }
first process true {
  name: 'BudgetExhausted',
  code: 'BUDGET_EXHAUSTED',
  message: 'Daily LLM budget exhausted: spent 1.5 USD of 1 USD; resets at 2026-10-11T00:00:00.000Z',
  spentUsd: 1.5,
  dailyBudgetUsd: 1,
  resetsAt: 2026-10-11T00:00:00.000Z
}
restart true {
  name: 'BudgetExhausted',
  code: 'BUDGET_EXHAUSTED',
  message: 'Daily LLM budget exhausted: spent 1.5 USD of 1 USD; resets at 2026-10-11T00:00:00.000Z',
  spentUsd: 1.5,
  dailyBudgetUsd: 1,
  resetsAt: 2026-10-11T00:00:00.000Z
}
fetch calls 0
query_log count after rollback 0
== 12.4 below the ceiling (Ollama)
mode live passed through to Ollama, failure unchanged: {
  name: 'LlmUnavailable',
  code: 'LLM_UNAVAILABLE',
  message: 'LLM unavailable: http-status 500',
  reason: 'http-status',
  status: 500
} fetch calls 1
== 12.5 configuration errors
true {
  name: 'LlmConfigError',
  code: 'LLM_CONFIG_INVALID',
  message: 'DAILY_BUDGET_USD is missing or invalid; see .env.example',
  variable: 'DAILY_BUDGET_USD'
}
true {
  name: 'LlmConfigError',
  code: 'LLM_CONFIG_INVALID',
  message: 'DAILY_BUDGET_USD is set but LLM_MODEL has no price in COST_TABLE; with a local Ollama leave DAILY_BUDGET_USD empty; see .env.example',
  variable: 'DAILY_BUDGET_USD',
  modelVariable: 'LLM_MODEL'
}
query_log count end 0
```

## Results

| Task | Check | Result |
|---|---|---|
| 12.2 | Empty env → mode `evaluation`; `complete` and `embed` fail with `evaluation-mode`; zero `fetch` | PASS (`fetch calls 0`) |
| 12.3 | Rows of today summing `1.5` inside a rolled-back transaction, `DAILY_BUDGET_USD=1`, `LLM_MODEL=llama3.2` → `BUDGET_EXHAUSTED` before any request, also after a "restart" (new store + wrapper) | PASS (`spentUsd: 1.5`, `resetsAt: 2026-10-11T00:00:00.000Z`, `fetch calls 0`) |
| 12.3 | `query_log` count back to baseline after rollback | PASS (0 → 0) |
| 12.4 | Below the ceiling (real DB spend `0`) the request reaches Ollama | Request passed through (`fetch calls 1`) and the endpoint failure came back unchanged (`http-status 500`). Ollama itself is broken on this machine: a direct `curl` to `/v1/chat/completions` with `llama3.2` returns HTTP 500 `llama-server process has terminated … CUDA error: the provided PTX was compiled with an unsupported toolchain`. Not a defect of the change; nothing was installed or reconfigured. A successful live completion through the wrapper is covered by the unit test "Below the ceiling the request reaches the model" |
| 12.5 | `DAILY_BUDGET_USD=abc` → error naming the variable, no value | PASS |
| 12.5 | `DAILY_BUDGET_USD=1` + `LLM_MODEL=llama3.2:3b` → error naming `DAILY_BUDGET_USD` and `LLM_MODEL`, no value, mentions Ollama | PASS |

Deviation from 12.3: the local database had no project (`project` count 0), so the script created one
inside the same rolled-back transaction instead of using an existing one.

## Cleanup (12.6)

The scratchpad script and its output file were deleted after this report was written; `git status`
shows no stray file and `query_log` stays at the baseline count `0`.
