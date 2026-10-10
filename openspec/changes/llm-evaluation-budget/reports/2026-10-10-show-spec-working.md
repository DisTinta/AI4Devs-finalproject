# Show spec working — llm-evaluation-budget (DIS-18)

Date: 2026-10-10. Branch `feature/DIS-18-llm-evaluation-budget` (PR #32). OS user name masked as `<user>`.

No CLI or HTTP entry point uses the LLM yet (DIS-76), so every scenario was exercised through a
throwaway `tsx` script in the session scratchpad (deleted afterwards) that calls the real sources:
`llmConfigFromEnv`, `createLlm`, `withDailyBudget`, `costUsd`/`hasPrice`/`COST_TABLE` and
`createPostgresStore`, against:

- the local Postgres of `docker compose up -d` (migrated), all writes inside one transaction that the
  script rolls back;
- a real local OpenAI-compatible HTTP endpoint started by the script with `node:http` on
  `127.0.0.1:<random port>`, reached by Node's real `fetch` (Ollama on this machine answers HTTP 500,
  `CUDA error: the provided PTX was compiled with an unsupported toolchain`, see the step 12 report);
- a counter wrapped around the global `fetch`, and a statement counter around the store's client.

`DATABASE_URL` was exported from `.env` in a subshell, never printed.

The type-level scenario is exercised through its real interface, the type check.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| No URL and no key selects evaluation mode | `llmConfigFromEnv` with unset / empty / `'   '` URL and key | `{"mode":"evaluation"}` ×3 | yes | Output §config |
| A URL without a key selects live mode | URL Ollama, key empty, `chat-x` | live, base URL, `chat-x`, no `apiKey`, 120000 ms | yes | Output §config |
| A key without a URL fails without showing the key | key `centinela-secreta`, URL empty | `LLM_BASE_URL is missing or invalid` (no key) | yes | Output §config |
| A URL without a model fails | without / with key | `LLM_MODEL …` ×2, no key nor URL | yes | Output §config |
| A malformed timeout or URL fails naming the variable | 6 timeouts + 5 URLs | 11 rejected, right variable, no value | yes | Output §config |
| A valid timeout overrides the default | `LLM_TIMEOUT_MS=50` | 50 | yes | Output §config |
| The daily budget is read in live mode only | unset, `'  '`, `2.5`, evaluation + `abc` | none, none, 2.5, evaluation | yes | Output §config |
| A malformed daily budget fails naming the variable | `abc`, `0`, `0.0`, `-1`, `1e3`, `1.` | all `DAILY_BUDGET_USD`, no value | yes | Output §config |
| With a ceiling every configured model needs a price | `llama3.2`; `llama3.2:3b`; verify / embed `sin-precio` | ceiling 1; three errors naming `LLM_MODEL`, `LLM_MODEL_VERIFY`, `LLM_EMBED_MODEL`, Ollama hint, no value | yes | Output §config |
| Without a ceiling a model needs no price | empty ceiling, unpriced models | live, no ceiling | yes | Output §config |
| Without URL and key no request is sent | two envs × complete answer/verify, embed `["a"]`, `[]` | 8× `evaluation-mode`, `fetchCalls: 0` | yes | Output §evaluation |
| A live configuration does not type-check against the evaluation model | `npx tsc -p tests/tsconfig.json` over `tests/unit/llm/evaluation-llm.spec.ts:60` (`// @ts-expect-error`) | exit 0: the directive is consumed, so the live call is a type error and the evaluation call type-checks (RED shown in step 4.3 with `TS2578`) | yes | Type check |
| The entry point builds a live model for a live configuration | `createLlm` on the local endpoint | mode live, exactly `POST /v1/chat/completions`, text `hola` | yes | Output §evaluation |
| The cost of a priced model is computed and rounded | injected table | `0.006`, `0.000003` | yes | Output §cost |
| A model without a price costs nothing and has no price | injected table | 0, 0; `otro` / `llama3.2:3b` unpriced | yes | Output §cost |
| The shipped table holds only the Ollama examples at zero | `COST_TABLE` | 4 entries at 0 | yes | Output §cost |
| The cost since an instant is summed across projects | 5 rows in 2 projects | number `0.6` | yes | Output §store |
| With no matching row the cost is zero | only yesterday; none | `0`, `0` | yes | Output §store |
| Invalid read arguments are rejected before querying | 7 invalid reads on a counting client | `INVALID_STORE_QUERY` naming name/kinds/hops, 0 statements | yes | Output §store |
| An invalid instant for the cost sum is rejected before querying | `sumCostSince(new Date('x'))` | `INVALID_STORE_QUERY`, `since`, 0 statements | yes | Output §store |
| A reached ceiling blocks completions and embeddings | spend `1.000001`, then `1`, clock 15:00Z, inner = real live client | `BUDGET_EXHAUSTED`, reset `2026-10-10T00:00:00Z`, since `2026-10-09T00:00:00Z`, 0 endpoint hits | yes | Output §ceiling |
| Below the ceiling the request reaches the model | spend `0.999999` | `hola`, 1 vector, one hit each on `/chat/completions` and `/embeddings`, mode live | yes | Output §ceiling |
| The ceiling survives a restart | rows of today = 1.5; two fresh store + wrapper instances | `BUDGET_EXHAUSTED` ×2, spent 1.5, 0 endpoint hits | yes | Output §ceiling |

## Evidence

Command:

```
export DATABASE_URL="$(. ./.env >/dev/null 2>&1; printf %s "$DATABASE_URL")"
npx tsx <scratchpad>/ssw.mts          # exit 0
npx tsc -p tests/tsconfig.json        # exit 0
```

A first run printed two `FAIL` lines for the two `InvalidStoreQuery` scenarios with correct data
(right arguments, 0 statements): the script checked `instanceof`, and it imports core by file URL
while the store resolves `@codemind/core`, so there were two copies of the class. The check was
changed to the stable `code` and the run repeated; that is the output below.

Output (verbatim):

```
local endpoint http://127.0.0.1:59387/v1
== llm-adapter: configuration
PASS | No URL and no key selects evaluation mode | {"mode":"evaluation"}
PASS | No URL and no key selects evaluation mode | {"mode":"evaluation"}
PASS | No URL and no key selects evaluation mode | {"mode":"evaluation"}
PASS | A URL without a key selects live mode | {"mode":"live","baseUrl":"http://localhost:11434/v1","model":"chat-x","verifyModel":"chat-x","timeoutMs":120000}
PASS | A key without a URL fails without showing the key | LLM_BASE_URL is missing or invalid; see .env.example
PASS | A URL without a model fails | LLM_MODEL is missing or invalid; see .env.example
PASS | A URL without a model fails | LLM_MODEL is missing or invalid; see .env.example
PASS | A malformed timeout or URL fails naming the variable | 11 values rejected
PASS | A valid timeout overrides the default | 
PASS | The daily budget is read in live mode only | {"unset":false,"blank":false,"set":2.5,"evaluation":{"mode":"evaluation"}}
PASS | A malformed daily budget fails naming the variable | DAILY_BUDGET_USD is missing or invalid; see .env.example
PASS | With a ceiling every configured model needs a price | {"first":{"mode":"live","baseUrl":"http://localhost:11434/v1","model":"llama3.2","verifyModel":"llama3.2","timeoutMs":120000,"dailyBudgetUsd":1},"errors":["DAILY_BUDGET_USD is set but LLM_MODEL has no price in COST_TABLE; with a local Ollama leave DAILY_BUDGET_USD empty; see .env.example","DAILY_BUDGET_USD is set but LLM_MODEL_VERIFY has no price in COST_TABLE; with a local Ollama leave DAILY_BUDGET_USD empty; see .env.example","DAILY_BUDGET_USD is set but LLM_EMBED_MODEL has no price in COST_TABLE; with a local Ollama leave DAILY_BUDGET_USD empty; see .env.example"]}
PASS | Without a ceiling a model needs no price | {"mode":"live","baseUrl":"http://localhost:11434/v1","model":"llama3.2:3b","verifyModel":"sin-precio","timeoutMs":120000,"embedModel":"sin-precio"}
== llm-adapter: evaluation mode and entry point
PASS | Without URL and key no request is sent | {"mode":"evaluation","reasons":["evaluation-mode","evaluation-mode","evaluation-mode","evaluation-mode"],"fetchCalls":0}
PASS | Without URL and key no request is sent | {"mode":"evaluation","reasons":["evaluation-mode","evaluation-mode","evaluation-mode","evaluation-mode"],"fetchCalls":0}
PASS | The entry point builds a live model for a live configuration | {"mode":"live","endpointHits":["POST /v1/chat/completions"],"text":"hola"}
== llm-adapter: cost table
PASS | The cost of a priced model is computed and rounded | [0.006,0.000003]
PASS | A model without a price costs nothing and has no price | {"otro":false,"llama3.2:3b":false}
PASS | The shipped table holds only the Ollama examples at zero | {"llama3.2":{"inputPerMTok":0,"outputPerMTok":0},"mistral":{"inputPerMTok":0,"outputPerMTok":0},"qwen2.5-coder":{"inputPerMTok":0,"outputPerMTok":0},"nomic-embed-text":{"inputPerMTok":0,"outputPerMTok":0}}
== graph-store and daily ceiling (real Postgres, one transaction rolled back)
before: query_log 0 project 0
PASS | The cost since an instant is summed across projects | {"total":0.6,"type":"number"}
PASS | With no matching row the cost is zero | [0,0]
PASS | Invalid read arguments are rejected before querying | {"codes":["INVALID_STORE_QUERY"],"arguments":["name","name","kinds","hops","hops","hops","kinds"],"statements":0}
PASS | An invalid instant for the cost sum is rejected before querying | {"code":"INVALID_STORE_QUERY","argument":"since","message":"Invalid store query: since must be a valid date","statements":0}
PASS | A reached ceiling blocks completions and embeddings (spend 1.000001) | {"messages":["Daily LLM budget exhausted: spent 1.000001 USD of 1 USD; resets at 2026-10-10T00:00:00.000Z","Daily LLM budget exhausted: spent 1.000001 USD of 1 USD; resets at 2026-10-10T00:00:00.000Z"],"since":"2026-10-09T00:00:00.000Z","endpointHits":0}
PASS | A reached ceiling blocks completions and embeddings (spend 1) | {"messages":["Daily LLM budget exhausted: spent 1 USD of 1 USD; resets at 2026-10-10T00:00:00.000Z","Daily LLM budget exhausted: spent 1 USD of 1 USD; resets at 2026-10-10T00:00:00.000Z"],"since":"2026-10-09T00:00:00.000Z","endpointHits":0}
PASS | Below the ceiling the request reaches the model | {"text":"hola","vectors":1,"endpointHits":["POST /v1/chat/completions","POST /v1/embeddings"],"mode":"live"}
PASS | The ceiling survives a restart | {"codes":["BUDGET_EXHAUSTED","BUDGET_EXHAUSTED"],"spent":[1.5,1.5],"endpointHits":0}
after: query_log 0 project 0
failures 0
```

Script (as run):

```ts
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BudgetExhausted, COST_TABLE, costUsd, hasPrice, type InvalidStoreQuery, withDailyBudget, type CompletionRequest } from 'file:///C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/packages/core/src/index.ts';
import { createLlm, llmConfigFromEnv, LlmConfigError } from 'file:///C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/packages/adapters/llm/src/index.ts';
import { createPostgresStore } from 'file:///C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/packages/adapters/store-postgres/src/index.ts';

const pg = createRequire('C:/Users/<user>/Desktop/AI4Dev/00-TFM/Codemind/package.json')('pg') as typeof import('pg');
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} |`, typeof detail === 'string' ? detail : JSON.stringify(detail));
};
const err = (f: () => unknown) => { try { f(); return undefined; } catch (e) { return e; } };
const aerr = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e);
const NUL = String.fromCharCode(0);

// A real local OpenAI-compatible endpoint (Ollama on this machine answers 500: CUDA toolchain error).
const hits: string[] = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    hits.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/chat/completions')) {
      res.end(JSON.stringify({ choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    } else {
      res.end(JSON.stringify({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }], usage: { prompt_tokens: 1 } }));
    }
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
console.log('local endpoint', BASE);
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((...a: Parameters<typeof fetch>) => { fetchCalls += 1; return realFetch(...a); }) as typeof fetch;
const ASK: CompletionRequest = { messages: [{ role: 'user', content: 'q' }], purpose: 'answer' };
const OLLAMA = 'http://localhost:11434/v1';

console.log('== llm-adapter: configuration');
for (const env of [{}, { LLM_BASE_URL: '', LLM_API_KEY: '', LLM_MODEL: '' }, { LLM_BASE_URL: '   ', LLM_API_KEY: '   ', LLM_MODEL: '' }]) {
  check('No URL and no key selects evaluation mode', JSON.stringify(llmConfigFromEnv(env)) === '{"mode":"evaluation"}', llmConfigFromEnv(env));
}
{
  const c = llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_API_KEY: '', LLM_MODEL: 'chat-x' });
  check('A URL without a key selects live mode', c.mode === 'live' && c.baseUrl === OLLAMA && c.model === 'chat-x' && !('apiKey' in c) && c.timeoutMs === 120000, c);
}
{
  const e = err(() => llmConfigFromEnv({ LLM_API_KEY: 'centinela-secreta', LLM_BASE_URL: '' })) as LlmConfigError;
  check('A key without a URL fails without showing the key', e.code === 'LLM_CONFIG_INVALID' && e.variable === 'LLM_BASE_URL' && !e.message.includes('centinela-secreta'), e.message);
}
for (const env of [{ LLM_BASE_URL: OLLAMA, LLM_MODEL: '' }, { LLM_BASE_URL: OLLAMA, LLM_MODEL: '', LLM_API_KEY: 'centinela-secreta' }]) {
  const e = err(() => llmConfigFromEnv(env)) as LlmConfigError;
  check('A URL without a model fails', e.variable === 'LLM_MODEL' && !e.message.includes('centinela-secreta') && !e.message.includes(OLLAMA), e.message);
}
{
  const bad: Array<[Record<string, string>, string, string]> = [
    ...['abc', '0', '-5', '1.5', '9999999999', '300001'].map((v): [Record<string, string>, string, string] => [{ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: v }, 'LLM_TIMEOUT_MS', v]),
    ...['localhost:11434', 'ftp://x', 'http://user:pw@localhost:11434/v1', 'http://localhost:11434/v1?k=1', 'http://localhost:11434/v1#x'].map((v): [Record<string, string>, string, string] => [{ LLM_BASE_URL: v, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '50' }, 'LLM_BASE_URL', v]),
  ];
  const ok = bad.every(([env, variable, value]) => {
    const e = err(() => llmConfigFromEnv(env)) as LlmConfigError;
    return e?.code === 'LLM_CONFIG_INVALID' && e.variable === variable && !e.message.includes(value);
  });
  check('A malformed timeout or URL fails naming the variable', ok, `${bad.length} values rejected`);
}
check('A valid timeout overrides the default', (llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'chat-x', LLM_TIMEOUT_MS: '50' }) as { timeoutMs: number }).timeoutMs === 50);
{
  const live = { LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2' };
  const a = llmConfigFromEnv(live);
  const b = llmConfigFromEnv({ ...live, DAILY_BUDGET_USD: '  ' });
  const c = llmConfigFromEnv({ ...live, DAILY_BUDGET_USD: '2.5' });
  const d = llmConfigFromEnv({ DAILY_BUDGET_USD: 'abc' });
  check('The daily budget is read in live mode only', !('dailyBudgetUsd' in a) && !('dailyBudgetUsd' in b) && (c as { dailyBudgetUsd?: number }).dailyBudgetUsd === 2.5 && d.mode === 'evaluation', { unset: 'dailyBudgetUsd' in a, blank: 'dailyBudgetUsd' in b, set: (c as { dailyBudgetUsd?: number }).dailyBudgetUsd, evaluation: d });
}
{
  const msgs: string[] = [];
  const ok = ['abc', '0', '0.0', '-1', '1e3', '1.'].every((v) => {
    const e = err(() => llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, LLM_MODEL: 'llama3.2', DAILY_BUDGET_USD: v })) as LlmConfigError;
    msgs.push(e.message);
    return e.variable === 'DAILY_BUDGET_USD' && !e.message.includes(v);
  });
  check('A malformed daily budget fails naming the variable', ok, msgs[0]);
}
{
  const base = { LLM_BASE_URL: OLLAMA, DAILY_BUDGET_USD: '1' };
  const first = llmConfigFromEnv({ ...base, LLM_MODEL: 'llama3.2' }) as { mode: string; dailyBudgetUsd?: number };
  const cases: Array<[Record<string, string>, string]> = [
    [{ ...base, LLM_MODEL: 'llama3.2:3b' }, 'LLM_MODEL'],
    [{ ...base, LLM_MODEL: 'llama3.2', LLM_MODEL_VERIFY: 'sin-precio' }, 'LLM_MODEL_VERIFY'],
    [{ ...base, LLM_MODEL: 'llama3.2', LLM_EMBED_MODEL: 'sin-precio' }, 'LLM_EMBED_MODEL'],
  ];
  const errs = cases.map(([env]) => err(() => llmConfigFromEnv(env)) as LlmConfigError);
  const ok = first.mode === 'live' && first.dailyBudgetUsd === 1 && errs.every((e, i) => e.variable === 'DAILY_BUDGET_USD' && e.modelVariable === cases[i][1] && !/llama3\.2:3b|sin-precio/.test(e.message) && e.message.includes('with a local Ollama leave DAILY_BUDGET_USD empty'));
  check('With a ceiling every configured model needs a price', ok, { first, errors: errs.map((e) => e.message) });
}
{
  const c = llmConfigFromEnv({ LLM_BASE_URL: OLLAMA, DAILY_BUDGET_USD: '', LLM_MODEL: 'llama3.2:3b', LLM_MODEL_VERIFY: 'sin-precio', LLM_EMBED_MODEL: 'sin-precio' });
  check('Without a ceiling a model needs no price', c.mode === 'live' && !('dailyBudgetUsd' in c), c);
}

console.log('== llm-adapter: evaluation mode and entry point');
fetchCalls = 0;
for (const env of [{}, { LLM_BASE_URL: ' ', LLM_API_KEY: '', LLM_MODEL: 'x' }]) {
  const llm = createLlm(llmConfigFromEnv(env));
  const es = (await Promise.all([aerr(llm.complete(ASK)), aerr(llm.complete({ ...ASK, purpose: 'verify' })), aerr(llm.embed(['a'])), aerr(llm.embed([]))])) as Array<{ code: string; reason: string }>;
  check('Without URL and key no request is sent', llm.mode === 'evaluation' && es.every((e) => e.code === 'LLM_UNAVAILABLE' && e.reason === 'evaluation-mode') && fetchCalls === 0, { mode: llm.mode, reasons: es.map((e) => e.reason), fetchCalls });
}
{
  fetchCalls = 0;
  hits.length = 0;
  const llm = createLlm(llmConfigFromEnv({ LLM_BASE_URL: BASE, LLM_MODEL: 'chat-x', DAILY_BUDGET_USD: '' }));
  const r = await llm.complete(ASK);
  check('The entry point builds a live model for a live configuration', llm.mode === 'live' && hits.length === 1 && hits[0] === 'POST /v1/chat/completions' && fetchCalls === 1, { mode: llm.mode, endpointHits: hits, text: r.text });
}

console.log('== llm-adapter: cost table');
const T = { 'paid-x': { inputPerMTok: 3, outputPerMTok: 15 }, 'local-y': { inputPerMTok: 0, outputPerMTok: 0 }, 'llama3.2': { inputPerMTok: 0, outputPerMTok: 0 } };
{
  const a = costUsd('paid-x', { inputTokens: 1000, outputTokens: 200 }, T);
  const b = costUsd('paid-x', { inputTokens: 1, outputTokens: 0 }, T);
  check('The cost of a priced model is computed and rounded', a === 0.006 && b === 0.000003, [a, b]);
}
check('A model without a price costs nothing and has no price',
  costUsd('local-y', { inputTokens: 1000, outputTokens: 200 }, T) === 0 && costUsd('otro', { inputTokens: 1000, outputTokens: 200 }, T) === 0 && hasPrice('paid-x', T) && hasPrice('local-y', T) && !hasPrice('otro', T) && !hasPrice('llama3.2:3b', T),
  { otro: hasPrice('otro', T), 'llama3.2:3b': hasPrice('llama3.2:3b', T) });
check('The shipped table holds only the Ollama examples at zero',
  JSON.stringify(Object.keys(COST_TABLE).sort()) === JSON.stringify(['llama3.2', 'mistral', 'nomic-embed-text', 'qwen2.5-coder']) && Object.values(COST_TABLE).every((p) => p.inputPerMTok === 0 && p.outputPerMTok === 0),
  COST_TABLE);

console.log('== graph-store and daily ceiling (real Postgres, one transaction rolled back)');
const observer = new pg.Client({ connectionString: process.env.DATABASE_URL });
await observer.connect();
const count = async () => (await observer.query('SELECT count(*)::int AS n FROM query_log')).rows[0].n as number;
const projects = async () => (await observer.query('SELECT count(*)::int AS n FROM project')).rows[0].n as number;
console.log('before: query_log', await count(), 'project', await projects());
const tx = new pg.Client({ connectionString: process.env.DATABASE_URL });
await tx.connect();
const log = (p: string, c: string | null, at: string) =>
  tx.query("INSERT INTO query_log (project_id, question, capability, cost_usd, created_at) VALUES ($1, 'q', 'explain', $2, $3)", [p, c, at]);
const SINCE = new Date('2026-10-09T00:00:00Z');
try {
  await tx.query('BEGIN');
  const store = createPostgresStore({ transaction: tx });
  await tx.query('DELETE FROM query_log');
  const p1 = await store.createProject({ name: 'ssw-dis18-a', rootPath: '/repos/sample', language: 'php' });
  const p2 = await store.createProject({ name: 'ssw-dis18-b', rootPath: '/repos/sample', language: 'php' });
  await log(p1, '0.4', '2026-10-08T23:59:59Z');
  await log(p1, '0.3', '2026-10-09T00:00:00Z');
  await log(p1, '0.2', '2026-10-09T10:00:00Z');
  await log(p1, null, '2026-10-09T11:00:00Z');
  await log(p2, '0.1', '2026-10-09T12:00:00Z');
  const total = await store.sumCostSince(SINCE);
  check('The cost since an instant is summed across projects', total === 0.6 && typeof total === 'number', { total, type: typeof total });

  await tx.query('DELETE FROM query_log');
  await log(p1, '0.5', '2026-10-08T10:00:00Z');
  const onlyEarlier = await store.sumCostSince(SINCE);
  await tx.query('DELETE FROM query_log');
  const none = await store.sumCostSince(SINCE);
  check('With no matching row the cost is zero', onlyEarlier === 0 && none === 0, [onlyEarlier, none]);

  let statements = 0;
  const counting = { query: (...a: unknown[]) => { statements += 1; return (tx.query as (...x: unknown[]) => unknown).apply(tx, a); } } as unknown as import('pg').ClientBase;
  const reader = createPostgresStore({ transaction: counting });
  const bad = [
    await aerr(reader.findSymbols(p1, '  ')),
    await aerr(reader.findSymbols(p1, 'a' + NUL + 'b')),
    await aerr(reader.findSymbols(p1, 'x', { kinds: [] })),
    await aerr(reader.neighbors(p1, [], 0)),
    await aerr(reader.neighbors(p1, [], 4)),
    await aerr(reader.neighbors(p1, [], 1.5)),
    await aerr(reader.neighbors(p1, [], 2, [])),
  ] as InvalidStoreQuery[];
  check('Invalid read arguments are rejected before querying', bad.every((e) => e.code === 'INVALID_STORE_QUERY') && statements === 0, { codes: [...new Set(bad.map((e) => e.code))], arguments: bad.map((e) => e.argument), statements });
  const since = (await aerr(reader.sumCostSince(new Date('x')))) as InvalidStoreQuery;
  check('An invalid instant for the cost sum is rejected before querying', since.code === 'INVALID_STORE_QUERY' && since.argument === 'since' && statements === 0, { code: since.code, argument: since.argument, message: since.message, statements });

  // Daily ceiling: the inner model is the real live client against the local endpoint.
  const live = llmConfigFromEnv({ LLM_BASE_URL: BASE, LLM_MODEL: 'llama3.2', LLM_EMBED_MODEL: 'nomic-embed-text', DAILY_BUDGET_USD: '1' });
  if (live.mode !== 'live' || live.dailyBudgetUsd === undefined) throw new Error('live config expected');
  const clock = () => new Date('2026-10-09T15:00:00Z');
  for (const spend of ['1.000001', '1']) {
    await tx.query('DELETE FROM query_log');
    await log(p1, spend, '2026-10-09T09:00:00Z');
    let asked: Date | undefined;
    const spy = { sumCostSince: (d: Date) => { asked = d; return store.sumCostSince(d); } };
    hits.length = 0;
    const llm = withDailyBudget(createLlm(live), { store: spy, dailyBudgetUsd: live.dailyBudgetUsd, now: clock });
    const es = [await aerr(llm.complete(ASK)), await aerr(llm.embed(['a']))] as BudgetExhausted[];
    check(`A reached ceiling blocks completions and embeddings (spend ${spend})`,
      es.every((e) => e instanceof BudgetExhausted && e.spentUsd === Number(spend) && e.dailyBudgetUsd === 1 && e.resetsAt.toISOString() === '2026-10-10T00:00:00.000Z') && asked?.toISOString() === '2026-10-09T00:00:00.000Z' && hits.length === 0,
      { messages: es.map((e) => e.message), since: asked, endpointHits: hits.length });
  }
  await tx.query('DELETE FROM query_log');
  await log(p1, '0.999999', '2026-10-09T09:00:00Z');
  hits.length = 0;
  {
    const llm = withDailyBudget(createLlm(live), { store, dailyBudgetUsd: 1, now: clock });
    const c = await llm.complete(ASK);
    const e = await llm.embed(['a']);
    check('Below the ceiling the request reaches the model', c.text === 'hola' && e.vectors.length === 1 && hits.length === 2 && llm.mode === 'live', { text: c.text, vectors: e.vectors.length, endpointHits: hits, mode: llm.mode });
  }
  await tx.query('DELETE FROM query_log');
  const today = new Date().toISOString();
  await log(p1, '1.0', today);
  await log(p1, '0.5', today);
  hits.length = 0;
  const restarts: unknown[] = [];
  for (let i = 0; i < 2; i += 1) {
    restarts.push(await aerr(withDailyBudget(createLlm(live), { store: createPostgresStore({ transaction: tx }), dailyBudgetUsd: 1 }).complete(ASK)));
  }
  check('The ceiling survives a restart', restarts.every((e) => e instanceof BudgetExhausted && e.spentUsd === 1.5) && hits.length === 0, { codes: restarts.map((e) => (e as BudgetExhausted).code), spent: restarts.map((e) => (e as BudgetExhausted).spentUsd), endpointHits: hits.length });
} finally {
  await tx.query('ROLLBACK');
  await tx.end();
}
console.log('after: query_log', await count(), 'project', await projects());
await observer.end();
server.close();
console.log(`failures ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
```

## State

- Before: `query_log` 0 rows, `project` 0 rows.
- After: `query_log` 0 rows, `project` 0 rows.
- Restored: yes — every write ran inside one transaction rolled back in `finally`; the local HTTP
  endpoint was closed; the script and its output were deleted from the scratchpad.

## Not demonstrated

- A completion answered by a real model below the ceiling: Ollama on this machine fails on its own
  (HTTP 500, CUDA toolchain). The wrapper's pass-through was shown against a real local HTTP
  endpoint instead, and against Ollama in step 12 (request reached it, its failure came back
  unchanged).

## Handoff

The change is demonstrably working: all 23 scenarios of `llm-adapter` (19) and `graph-store` (4)
match their THEN against the real store, the real HTTP client and the real type check. No
screenshot was taken (no UI); nothing was written at the repository root.
