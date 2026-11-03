# Verify against spec: context-measurement (DIS-81)

*(Agent's text, inline mode of `verify-against-spec`, review step of the autonomous run, 2026-11-03.)*

Compared: `openspec/changes/context-measurement/specs/context-measurement/spec.md` (eleven requirements, 42
scenarios) and `specs/graph-quality/spec.md` (MODIFIED "Published Table 2") against `scripts/measure-context.mjs`,
`tests/unit/scripts/measure-context.spec.ts`, `tests/unit/docs/context-savings.spec.ts`, `readme.md` §2.6 and
`docs/measurements/context-savings.md`, at `e59ff63` plus the review fixes of this step. Line numbers are those of
the files after the fixes.

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Freeze check before measuring | `scripts/measure-context.mjs:264` (`freezeProblems`, called at `:875` after `.env` and `PORT`, `:869`-`:874`); table row check `:246` (`hashTableLists`) | `measure-context.spec.ts:245`, `:255`, `:265`, `:275` |
| The question set | `:286` (`checkQuestions`: shape, ids, UTF-16 length, whitespace, U+0000, trimmed uniqueness, `expected`, ≥ 2 `unknown`); golden texts in the test only | `measure-context.spec.ts:292`, `:303`; `context-savings.spec.ts:28` |
| Live environment check | `:884`-`:917` (order `LLM_BASE_URL`, `LLM_MODEL`, `/health`, `/api/version`, `/api/tags`; `run.json` written once, compared, `:481` `readRun` validates it) | `measure-context.spec.ts:332`, `:340`, `:347`, `:355`, `:373`, `:381`, `:389`, `:423` |
| Asking each question | `:921`-`:957` (POST body `{ question, useCache: false }`, project id from the seed, `sendWithHttp` without time limit, raw file written at once, stop rules via `bodyProblem` `:445`); raw validation `:509` (`readRaw`) before any ask | `measure-context.spec.ts:442`-`:584` |
| Tokenizer deviation sample | `:345` (`readSample`: non-redacted rows, SHA-256 against `content_hash`, missing project, `readSeed` errors); `:959`-`:981` (`/api/generate` with `raw`, `stream: false`, `num_predict: 1`, count written at once); `:101` (`estimateTokens`) | `measure-context.spec.ts:602`-`:681`, `:632` |
| Aggregation rules | `:594` (`aggregateProject`), `:658` (`aggregateTokenizer`), `:113` (`savingsTenths`, `-0` → `0`), `:578` (`median`, `⌈n/2⌉`-th), ratios through `roundRatio` | `measure-context.spec.ts:736`-`:800` |
| Measurement outputs | `:730` (`build`: CSV header and RFC 4180 fields, JSON, blind answer files with `text`, `type`, `evidenceIds` only), `:984`-`:986` written only after every answer and count | `measure-context.spec.ts:818`, `:853`, `:871` |
| Measurement CLI | `:77` (`parseArguments`), `:862`-`:874` (usage and `PORT` exit 2 first), stdout lines `:955`, `:980`, `:230` | `measure-context.spec.ts:228`, `:442`, `:871` |
| Committed measurement matches the raw data | `:767` (`buildFromDisk`); raw data under `docs/measurements/context/raw/` (40 responses, `run.json`, 89 counts) | `context-savings.spec.ts:42`, `:46` |
| Published Table 1 | `readme.md` §2.6 (Table 1, the three lines below it, the negative-savings paragraph, §0.3 sentence, limitations, review row, §3.2) | `context-savings.spec.ts:102`, `:117`, `:127` |
| Measurement report | `docs/measurements/context-savings.md` (all seven sections) | `context-savings.spec.ts:151` |
| graph-quality → Published Table 2 (MODIFIED) | `readme.md` §2.6 first paragraph names `DIS-81` and both commands | `tests/unit/docs/graph-quality.spec.ts` (unchanged, green) |

## 2. Requirements missing or partial

Found during this review and fixed in this step (each with a new test seen failing first):

1. **Freeze check, "The table SHALL list `docs/measurements/context/questions.json`"** — partial. The question-file
   check scanned every line of the report, so a mention of the path with any 64-hex string outside the
   `## Hashes SHA-256` table (for example in `## Método`) counted as "listed". Fixed: `hashTableLists`
   (`scripts/measure-context.mjs:246`) reads only that table's rows, as `checkFreeze` does. Test
   `measure-context.spec.ts:275`.
2. **Tokenizer deviation sample, "A failed Ollama answer … SHALL make the command exit with code 1 naming the
   file"** — partial: the line named `<fixture>/<path>`, while every other file problem and every `file` of the
   counts use the repository-relative `fixtures/<fixture>/<path>` (spec, same requirement). Fixed (`:975`). Test
   `measure-context.spec.ts:667`.
3. **Asking each question / Measurement outputs** — partial: a `200` `UNKNOWN` body (live or raw) without a
   `statements` or `evidence` list, or a statement that is not an object, passed the checks and then crashed
   `build` with a `TypeError` and a stack trace instead of one stderr line naming the question or the raw file.
   Fixed in `bodyProblem` (`:445`). Test `measure-context.spec.ts:563`.
4. **Aggregation rules, "A published one-decimal percentage … SHALL be rounded half away from zero from its
   integer numerator and denominator"** — partial for a priced cost share: it was formatted from the 4-decimal
   rounded ratio (double rounding: 12,345 % gave `12,4 %`). Fixed: `formatCostShare` (`:190`) formats it from the
   summed costs in micro-dollars. Not reachable with the published 0 USD run, so no figure changes. Test
   `measure-context.spec.ts:920`.

Nothing else is missing.

## 3. Unspecified behaviour

- `raw/<fixture>/<id>.json` also stores `status: 200` (`:952`), and the JSON's `run` also holds `questionsSha256`
  (`:739`); the JSON's projects also hold `generation`, `verification.calls`, `costUsd` and the tokenizer's
  `excluded` list and per-file `deviation`. All are pinned by `design.md` D7 and D10 (lines 123 and 181), which
  the spec audits reviewed; the spec's "the aggregates of each project and the deviation" covers them. Decision:
  keep (A).
- `GET /api/tags` matches `LLM_MODEL` against an entry's `name` **or** `model` field (`:900`). Both fields are the
  same tag in Ollama 0.40.13 (`/api/tags` output in the show-spec-working report). Decision: keep, harmless (A).
- The `/health`-not-ok line text (`:894`) is not pinned by the spec (only the exit code is). Decision: keep (A).
- Several trailing `/` are stripped from `LLM_BASE_URL` (`:890`), where the spec says "a trailing `/`". Same
  result for one; decision: keep (A).

Extra checks:

- Dependencies: only Node built-ins and sibling scripts (`:13`-`:19`); `package.json` adds only the npm script.
- Authorisation: none required by the spec (local CLI).
- Response fields: the answer files hold only the fields the spec lists (`:748`-`:754`).
- Weaker tests: "The health check is not ok" does not assert stderr, and the spec asks none. "The answer files are
  blind" checks keys and `model` on fake data; the committed answer files are pinned byte for byte by
  `context-savings.spec.ts:46`, built by the same `build`. No scenario test asserts less than its THEN.

## Scenario → test → state

All 42 scenario titles of `context-measurement` and the two of `graph-quality` appear verbatim as test names
(grep of each title in `tests/`, one file each). Run after the fixes:
`npx vitest run tests/unit/scripts tests/unit/docs` → 18 files, 174 tests passed; `npm run lint`,
`npm run typecheck` and `npm run docs:coverage` clean.

| Scenario | Test | State |
|---|---|---|
| A frozen question file was modified | `measure-context.spec.ts:245` | green |
| The savings report records no hash | `:255` | green |
| A project has 19 questions | `:292` | green |
| The committed question set is complete | `context-savings.spec.ts:28` | green |
| The API does not answer | `:332` | green |
| The health check is not ok | `:340` | green |
| The model variable is not set | `:347` | green |
| The Ollama version check fails | `:373` | green |
| The model is not in Ollama | `:381` | green |
| A raw run of another model is not mixed | `:389` | green |
| No variable value is written | `:423` | green |
| Every question is sent without the cache | `:442` | green |
| An evaluation-mode API stops the run | `:457` | green |
| A cached answer stops the run | `:465` | green |
| A verification answered from the API cache | `:473` | green |
| A non-200 status stops the run | `:485` | green |
| A body that is not JSON stops the run | `:493` | green |
| An answered body without a usage field stops the run | `:502` | green |
| A stale raw response stops the run | `:512` | green |
| Unusable raw data stops the run before any question | `:528` | green |
| A resumed run skips the answered questions | `:584` | green |
| The local estimate equals the product's | `:602` | green |
| A sample file differs from the seed | `:606` | green |
| The seed has no row of a sample project | `:614` | green |
| A malformed generate answer stops the count | `:652` | green |
| Every non-redacted file is counted once | `:681` | green |
| Savings of two answered rows | `:736` | green |
| UNKNOWN rows are counted apart | `:750` | green |
| The savings equal the product's formula | `:765` | green |
| Verifier latency and calls of three answered rows | `:777` | green |
| A project with no answered row | `:787` | green |
| The tokenizer deviation of a sample | `:800` | green |
| A CSV field with a comma, a quote and a line break | `:818` | green |
| The answer files are blind | `:853` | green |
| The outputs are deterministic | `:871` | green |
| An unknown argument is a usage error | `:228` | green |
| The committed outputs are the current aggregation | `context-savings.spec.ts:46` | green |
| The frozen questions still match their hash | `context-savings.spec.ts:42` | green |
| The README Table 1 agrees with the measurement | `context-savings.spec.ts:102` | green |
| A negative savings is explained | `context-savings.spec.ts:117` | green |
| The README limitations and verifier row are current | `context-savings.spec.ts:127` | green |
| The report agrees with the measurement | `context-savings.spec.ts:151` | green |
| The README table agrees with the measurement (graph-quality) | `tests/unit/docs/graph-quality.spec.ts` | green |
| A TypeScript figure below PHP is explained (graph-quality) | `tests/unit/docs/graph-quality.spec.ts` | green |

Verdict: conforms after the four fixes of block 2; block 3 decided (keep, A).
