# Verify against spec — cli-ask (DIS-40)

- Date: 2026-10-13
- Spec: `openspec/changes/cli-ask/specs/cli-ask/spec.md`
- Code: `packages/cli/src/commands/ask.ts`, `packages/cli/src/index.ts`
- Tests: `tests/unit/cli/ask-command.spec.ts` (U), `tests/integration/cli/ask-command.spec.ts` (I)
- Run by the `/verify-against-spec` skill (forked, read-only). Tests were not re-run by the auditor;
  states come from the step 11 report (1169 passed, 0 skipped, mutation score 94.70 %).

## 1. Requirements implemented correctly

| Requirement | Code | Proving test |
|---|---|---|
| `ask <project> <question>`, two arguments, extra arguments rejected, `--` lets a question start with `-` | `ask.ts:327-351` (`allowExcessArguments(false)` :333) | U:144, U:529 |
| `--help`/`--version` go to stdout, exit 0, before the environment is read | `ask.ts:78-79`, `:336`, `:344` | U:128 |
| `USAGE` exit 2 with fixed messages; `commander` prints nothing of its own | `ask.ts:309-313`, `:338`, `:345` | U:144 |
| Question checked before the environment is read; `INVALID_EXPLAIN_REQUEST`, `details.field`, exit 2 | `ask.ts:80`, `:264-266` | U:161 |
| `DATABASE_URL` trimmed, then `MISSING_CONFIG` | `ask.ts:81-82` | U:179 |
| `LLM_*` read before any connection; `LLM_CONFIG_INVALID` with `variable`/`modelVariable`, never the value | `ask.ts:83`, `:267-274` | U:179, U:197 |
| `DAILY_BUDGET_USD` wraps the model in `withDailyBudget` | `ask.ts:89-92` | U:248 |
| Own connections; a probe connection; `DATABASE_UNAVAILABLE` / `cannot connect to the database`; no URL in output | `ask.ts:121-136`, `:275` | I:127 |
| Every connection closed, whatever happened | `ask.ts:101-103`, `:132` | I:139, U:263 |
| `LLM_API_KEY` never reaches an output | `ask.ts:83-88`, `:267-274` | U:209 |
| Exact-name resolution; `PROJECT_NOT_FOUND` without the name; an id is not accepted | `ask.ts:86-87` | U:307 |
| `explain` called once with `{ projectId, question }` only | `ask.ts:93-96` | U:517 |
| Answer, `statements:`, `evidence:`, `prior claims:` and `note:` sections, in that order | `ask.ts:168-191`, `:241-253` | U:352, U:410, U:478, U:505, I:148 |
| Duplicate spans listed once, in first-citation order | `ask.ts:175-182` | U:410 |
| Excerpts cut to 5 lines with `… (+k lines)`; a `null` excerpt prints only the span line | `ask.ts:213-218`, `:181` | U:352, U:429 |
| Lines split, tabs expanded, each line escaped only when needed (C0, C1, bidi, line separators) | `ask.ts:202-228`; `safe-json.ts:8`, `:31-41` | U:393, U:448 |
| Events go to stderr as `{"level":"info",…}`; stderr stays empty when there are none | `ask.ts:98-99`; `logger.ts:69-72` | U:505, I:225 |
| `UNKNOWN (<reason>)`, plus the message for `llm-required`; no claim stored | `ask.ts:145-147` | U:438, I:194, I:210, I:225 |
| Failures: one terminal-safe JSON line; domain codes with their details; everything else `INTERNAL` / `unexpected error` | `ask.ts:104-108`, `:262-306` | U:545, U:570, U:589, U:598 |
| Entry point hands `ask` to `runAskCommand` | `index.ts:15-16` | none automated (manual step 8.2 only) |

Other checks:
- **Dependencies:** every import in `ask.ts` (`pg`, `commander`, `@codemind/adapter-git`, `adapter-llm`, `adapter-store-postgres`, `core`, `node:url`) is in `packages/cli/package.json` and in the tsconfig references or paths. Clean.
- **Authorisation:** the spec requires no authorisation check. None is missing.

## 2. Requirements missing or partial

1. **Paths are not split into lines or tab-expanded.** The spec ("Ask terminal safety") says every untrusted text, "paths and excerpts" included, "SHALL be split into lines at each line feed … every tab SHALL be replaced by two spaces". `spanOf` (`ask.ts:236-238`) escapes the whole path as one literal: no split, and a tab comes out as `\t` in quotes. The result is still safe, and core's `FORBIDDEN_PATH_CHARACTER` (`packages/core/src/index/source-path.ts:19`) rejects such paths when indexing, so this can't happen today. No test covers a path with a tab or line feed. **Low**: change the spec to "a path is escaped as a whole", or the code.
2. **"No transaction held open while the model answers" is implemented but never tested.** The spec says "each write committing on its own (no transaction held open while the model answers)". The pool store (`ask.ts:122-135`) does this. But every integration test that reaches `explain` injects `createPostgresStore({ transaction: db() })` (I:106-107), and the two tests using the default pool stop before `explain` (I:127, I:139). Only the manual step 12 run exercises it. Stryker reports `defaultOpenStore` as no-coverage (step 11 report). **Medium.**
3. **No `ask` test for bidi, C1 or line-separator characters.** The spec says "no … bidirectional formatting character or line or paragraph separator SHALL reach stdout raw". The `ask` tests only use ESC (U:393, U:448). C1 is tested elsewhere (`index-command.spec.ts:428`, `render-report.spec.ts:41`), but no test anywhere sends U+202E or U+2028 through the `ask` formatter. **Low.**
4. **`index.ts` delegation has no automated test.** `index.ts:15-16` is checked only by hand (task 8.2). **Low.**

## 3. Unspecified behaviour

Each item needs a decision: remove it, or add it to the spec.

1. **`-h` and `-V` are accepted.** `.version(CLI_VERSION)` (`ask.ts:332`) and `commander`'s default help option also register the short flags. Confirmed against the installed `commander`: `-h` gives `commander.helpDisplayed` and `-V` gives `commander.version`, so `ask -h` and `ask -V` exit `0`. The spec allows only `--help` and `--version` and says an unknown option SHALL fail with `USAGE`, so this breaks the spec as written. No test covers it. **Highest priority.**
2. **`application_name: 'codemind-ask'` on every session** (`ask.ts:33`, `:125`). Visible to anyone who reads `pg_stat_activity`. Design D3 calls it "an addition … for observability only", and the "connections are closed" test (I:71-86) depends on it. It isn't in the spec.
3. **A relative `root_path` resolves against the repository root of the installation** (`REPO_ROOT`, `ask.ts:30`, `:94`), not the current directory. Tested by U:648. The spec says nothing about it.
4. **The statement `evidence:` line is dropped when empty, and unknown evidence ids are skipped silently** (`ask.ts:170-171`, `:251`). The spec says each statement has "the line `   evidence: …`", always. A test locks in the omission (U:613).
5. **Empty inner lines of a statement or excerpt are not indented** (`ask.ts:231-233`). The spec says "each further line … indented by 3 spaces" and "each excerpt line indented by 4 spaces"; only the answer (item 1) has an empty-line exception. Locked in by U:638. Related edge: an empty statement text prints `1. [FACT] ` with a trailing space (`ask.ts:248-249`).
6. **`formatUnknown` prints `message` for any reason, unescaped** (`ask.ts:146`). The spec says the extra line is printed only for `llm-required`. Today the behaviour is the same, because core attaches `message` only for that reason (`packages/core/src/explain/unknown-policy.ts:47`), but the CLI relies on that rather than checking.
7. **A failing `close()` is ignored** (`ask.ts:102`, `.catch(() => undefined)`), and so are idle-client pool errors (`ask.ts:128`). The spec says connections are closed; it doesn't say what happens when closing fails. Locked in by U:290.
8. **Error and help text the spec doesn't fix.** The spec fixes only `cannot connect to the database` and `unexpected error`. These other messages are visible output, set only in design D6, and tested exactly:
   - `DATABASE_URL is not set` (`ask.ts:82`)
   - `invalid question` (`:265`)
   - `… is missing or invalid; see .env.example` and `… has no price in COST_TABLE …` (`:269-270`)
   - `project not found` (`:87`, `:276`)
   - `the project's source cannot be read` (`:278`)
   - `the language model is unavailable` (`:285`)
   - `the daily LLM budget is exhausted` (`:294`)
   - the `USAGE` messages and their `invalid usage` fallback (`:309-313`, `:345`)

   Every error line also carries a `details` field, even when empty (`{}`). The help descriptions (`ask.ts:329-331`, tested at U:669) say "1 to 1,000 characters"; the spec says code points.
9. **The top-level `codemind --help` still lists `ask <project> <question>` with no action** (`index.ts:28-29`). The spec doesn't cover top-level help.

## Tests that assert less than their scenario says

- **"A typed answer is printed with its evidence and stored" (I:148).** The scenario requires "the evidence section with each cited span's excerpt". The test checks only that the first excerpt line starts with 4 spaces (I:183), and only that the heuristic span's line is present (I:184), not its excerpt.
- **"An unreachable database fails without leaking the URL" (I:127)** needs no database but sits inside `describeWithDatabase`, so it is skipped wherever no database is configured.
- **"Help and version print without reading the environment" (U:128)** shows the environment isn't read only indirectly (it runs with an empty environment and still exits 0); nothing records whether the environment was read.

## Scenario → test → state

Every state is green per the step 11 report; not re-run in this audit.

| Scenario | Test | State |
|---|---|---|
| Help and version print without reading the environment | U:128 | green |
| Usage errors never quote the arguments | U:144 | green |
| An invalid question is rejected before any connection | U:161 | green |
| Configuration errors fail before any connection | U:179 | green |
| An unreachable database fails without leaking the URL | I:127 | green (skipped without a DB) |
| The connections are closed after a run | I:139 | green |
| A daily budget stops the model call | U:248 | green |
| The API key never reaches an output | U:209 | green |
| Only the exact name resolves the project | U:307 | green |
| A typed answer is printed with its evidence and stored | I:148 | green (weaker than scenario) |
| Stale statements and prior claims are marked | U:478 | green |
| An unsaved answer is printed with a closing note | U:505 | green |
| A span cited twice is listed once | U:410 | green |
| Explain receives only the project id and the question | U:517 | green |
| Control characters are escaped line by line | U:448 | green |
| Excerpts are cut, tabs expanded and missing values shown | U:352 | green |
| Evaluation mode answers llm-required | I:194 | green |
| A question without anchor answers no-anchor | I:210 | green |
| A discarded model output answers invalid-model-output | I:225 | green |
| Model, budget and source failures keep their code | U:545 | green |
| An unexpected failure is internal and does not deny a write | U:589 | green |

Nothing was fixed in this pass.
