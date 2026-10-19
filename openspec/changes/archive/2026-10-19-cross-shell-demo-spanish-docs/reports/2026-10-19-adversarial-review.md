# Adversarial Review Report

- Date: 2026-10-19
- Change: cross-shell-demo-spanish-docs (DIS-102)
- Step: 19.6 — `/adversarial-review` (run 1 on `f9df1ca`, after the show-spec-working and
  verify-against-spec fixes), plus the inline security review of the diff
- The review ran as the skill's forked Explore agent (a separate context from the one that wrote the
  code); its report is reproduced verbatim below, then the resolution.

## Run 1 (verbatim)

### Adversarial review

**Scope.** I reviewed `git diff 368dc38...HEAD`: 41 commits, 52 files. None of them are under `.claude/`. The "Changed files" list in the prompt was built against a different base, so it does not match this diff. I read the three spec deltas, `tasks.md`, the Follow-ups in `design.md`, the five scripts under `scripts/`, the six new or changed spec files under `tests/unit/`, the config diffs (`package.json`, `packages/api/package.json`, `Makefile`, `docker-compose.yml`, `vitest.config.ts`, `vitest.stryker.config.ts`), the `ProjectPickerPage` change and every `shell` block of `docs/DEMO.md`. I also checked which commits touched what, to see whether the spec was edited after the code. I could not read `.env.example` because the secret-read hook blocks it.

#### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `scripts/demo-ask.mjs:109-119`; spec `local-startup/spec.md:278-279` | The spec says `demo:ask` "SHALL set no time limit on the request (a live model can take minutes on a CPU)". The code calls Node's built-in `fetch`, which stops any request after 300 s by default (`headersTimeout`/`bodyTimeout`). The repo already says so in `packages/adapters/llm/src/config.ts:113-116`. The `catch {}` at line 116 treats every `fetch` error the same way, so a request that hits the 300 s limit prints `demo:ask: the API is not reachable at … (start it with npm run up)` and exits `1`. | `readme.md:407` measures one live question on Ollama/CPU at **3.5–9 min**, which is exactly the case the spec gives as its reason. Past 300 s the helper wrongly says the API is down while the API is still working on the answer. The spec requirement is not met, and no review report caught it (the spec audit's 5.5 discussed only the question of adding a limit). The guide's default evaluation mode is not affected. |
| Minor | `scripts/env.mjs:93`; `tests/unit/scripts/env.spec.ts:157-170` | The spec says "any other value [of `CODEMIND_SKIP_DOTENV`], or its absence, loads normally". Only the value `1` is tested. If `=== '1'` were changed to a truthy check, `'0'` or `'false'` would skip the file and every test would still pass. | Part of the requirement is unproven. |
| Minor | `scripts/demo-ask.mjs:30-35`; `demo-ask.spec.ts` | `PORT` handling is tested only for valid ports and `abc`. Nothing covers unset or blank (default `3000`), trimming, `0`, `65535` or `65536`. Changing `<= 65_535` to `<` would go unnoticed. | Boundaries the spec names are not checked. |
| Minor | `scripts/demo-ask.mjs:113`; `demo-ask.spec.ts:90-95` | The `content-type: application/json; charset=utf-8` header (added to the spec in 5c0e9f5) is never asserted. The test server ignores headers, so deleting the header passes the suite. The real Fastify API would likely reject such a request. | A spec sentence has no test. |
| Minor | `scripts/demo-ask.mjs:53,61` | Two parts of the spec have no test: leaving `usage` out when the body has none, and the "only for 2xx" condition (dropping `isSuccess(status) &&` survives, because the 404 body has no `statements`). | These sentences were added after the code (design.md "Spec sentences for behaviour the code already had"), with no test. |
| Minor | `tests/unit/docs/guides.spec.ts:91-97` | The spec says a `powershell`/`bash` pair must be adjacent "with only text between them". The test only checks that the next fenced block is the other shell's; a `##` heading in between would pass. `docs/DEMO.md` has no pairs today, so the check currently tests nothing. | Weak protection if a pair is ever added. |
| Minor | `scripts/up.mjs:143` + `scripts/env.mjs:103` | `up` copies `process.env` into a plain object, so on Windows the `Object.hasOwn` check becomes case-sensitive. The preload (`load-env.mjs`) works on `process.env` directly and stays case-insensitive. If a shell variable differs from a `.env` key only in letter case, `up`'s child processes get both keys. | "The environment wins" holds slightly differently under `up` than under the other commands on Windows. Unlikely in practice. |
| Minor | spec history: 5c0e9f5 comes after 487b357, 049087f, 403c4bb, 3f78732, 835e584 | The spec was edited after the code for D19–D22 and V-U4..6. Each fix commit has its test and code together, so there is no evidence that the test failed first (RED). | Process debt. It is recorded in design.md, which is why this is not rated higher. |
| Minor | task 14.3 ("`scripts/` is not in its scope") | Stryker does not mutate `scripts/`. The surviving mutants above were found only by reading the code. | The mutation-score gate tells us nothing about the new code. |
| Question | `scripts/demo-ask.mjs:111` | `encodeURIComponent('..')` leaves `..` as is, and URL parsing removes it as a dot segment. So `demo:ask -- .. "q"` sends `POST /api/ask`, and `.` sends `/api/projects/ask`. The id never appears in the path, which contradicts "the id percent-encoded as a path segment". | The likely result is a 404 and exit `1`, which is harmless. It still breaks a spec sentence. |
| Question | `scripts/up.mjs:96-99` (D21) | D21 stops a `.env` line from setting `npm_execpath`, but `NODE_OPTIONS=--import=x.mjs` or `npm_config_*` in `.env` still reach every npm step. | D21's reason ("a `.env` line could run code") is only half closed. The threat is low because `.env` belongs to the user. |
| Question | `.env.example` | I could not read the file (hook denied). `wiring.spec.ts:219-224` checks the values, but nothing checks the required comment "both change together". | Unverified. |

**Existing tests modified.** `confidence-doc.spec.ts` and `ProjectPickerPage.test.tsx` changed. Both follow MODIFIED requirements in the `confidence-score` and `project-picker` deltas, and neither got weaker (the confidence test gained a header-cell check). Justified.

**Blast radius checked.** Processes started by tests (`dev-script.spec.ts:58,82`, the migration specs) inherit `process.env`, which holds `CODEMIND_SKIP_DOTENV=1`. The other test environments are passed in-process, not to child processes. The remaining `make up` mentions are comments or archived specs, and they stay true. There is no migration, and `package-lock.json` is unchanged.

**Evidence quality.** The strongest test is "Up runs the start sequence in order" (`up.spec.ts:84-136`). It fails if the steps are reordered, `--wait` is dropped, `shell: true` is used, the working directory is wrong, the loaded `.env` is not passed to the steps (the `POSTGRES_PORT=5433` check), or an `[up]` line is printed after its step instead of before. It would not notice `up` going on to the next step after a Ctrl+C during a step other than `npm run dev`.

#### Verdict
**PASS WITH GAPS.** There are no Blockers and one Major. Task 19.8 requires a run with no Major, so the Major has to be fixed in this change before archiving.

#### Recommended next steps before archiving
1. **Major → A, fix in this change, test first.** Either send the request with `node:http`, which has no client-side time limit, or keep `fetch` and amend the spec to state the 300 s limit with its own message. In both cases, stop reporting a request that ran out of time as "not reachable" (check `error.cause?.code`). Re-run show-spec-working step E for `demo:ask` and add an addendum to `reports/2026-10-19-verify-against-spec.md`.
2. **Test gaps → A** (cheap, same change): `CODEMIND_SKIP_DOTENV=0`; `PORT` unset, blank, padded, `0`, `65535`, `65536`; the request header; `usage` left out; a 4xx body that has `statements`; the "only text between" pairing. If they are not done now, put them all in **one** Linear debt issue (**C**), not one issue each.
3. **Windows letter-case and `NODE_OPTIONS` questions → D** (accepted, with a reason in design.md Follow-ups), or one sentence in the Risks section.
4. **`..`/`.` as a project id → A** (refuse with the usage error) **or D** (accepted, since it ends in a 404).
5. **Spec edited after the code / RED not seen, and `scripts/` outside Stryker's scope** → process debt. Record it in design.md Follow-ups, not in Linear.
6. Save this review as `reports/2026-10-19-adversarial-review.md` (design.md Follow-ups already links to it), then finish 18.1 (PR body with the clean-clone run, which closes V1) before 19.9.

## Resolution of run 1

One Major, nine Minor, three Questions. Every one has its destination in `design.md` → Follow-ups
(AR1–AR12); the fixes are D23 and A27 and five new or strengthened tests.

| Finding | Resolution |
|---|---|
| AR1 Major — `fetch` stops after 300 s | **Fixed** (D23). `demo:ask` sends with `node:http` (`agent: false`, no timeout). RED of the new scenario "A slow answer is waited for": `expected '/**\n * \`npm run demo:ask -- <project…' not to match /\bfetch\s*\(\|globalThis\.fetch/`. Real check below. |
| AR2 — skip switch values | New scenario "Any other value of the skip switch loads .env" (`0`, `true`, empty, ` 1`): green on its first run (the strict `=== '1'` already held; it now guards it). |
| AR3 — `PORT` boundaries | New scenario "PORT is read as the API reads it": green on its first run (guard). |
| AR4 — header untested | "An answered question prints its status and summary" asserts `content-type: application/json; charset=utf-8` at the server. |
| AR5 — `usage` and 2xx-only | New scenario "Only a 2xx answer is summarised": green on its first run (guard). |
| AR6 — heading between a pair | The pairing check compares the headings before each block of a pair. |
| AR7 — Windows letter case in `up` | Accepted (D), design → Risks. |
| AR8 — RED not visible in history | Accepted as process (D): every behaviour fix was seen RED first; the failure messages are quoted in this report and in `2026-10-19-verify-against-spec.md`. |
| AR9 — `scripts/` outside Stryker | Accepted (D16); answered with the targeted tests above. |
| AR10 — `.`/`..` project id | **Fixed** (A27). RED of "A dot project id is a usage error": `.: expected '' to be 'usage: npm run demo:ask -- <projectId…'`. |
| AR11 — `NODE_OPTIONS` via `.env` | Accepted (D), D21 reworded: it fixes which npm runs, it is not a sandbox. |
| AR12 — `.env.example` comment | Accepted (D): values pinned; the agent may not read `.env.example`; the PR asks the author to confirm the comment. An assertion that the comment block names `DATABASE_URL` was tried and failed (the block right above `POSTGRES_PORT` is the section header), so it was not kept: the wording is the author's to confirm. |

### AR1 — real check of the fix

A local server that answers `200` 310 s after the request (`<scratchpad>/slow-server.mjs`), with
`CODEMIND_SKIP_DOTENV=1`:

```text
# before the fix (scripts/demo-ask.mjs of f9df1ca, with fetch)
$ PORT=39124 node scripts/demo-ask.mjs a794456d-… "¿Cómo se calcula el precio final de un pedido?"
demo:ask: the API is not reachable at http://127.0.0.1:39124 (start it with npm run up)
exit 1 after 307 s

# after the fix (node:http)
$ PORT=39125 node scripts/demo-ask.mjs a794456d-… "¿Cómo se calcula el precio final de un pedido?"
HTTP 200
{ "statements": 1, "evidence": 0, "usage": { "slowSeconds": 310 } }
exit 0 after 310 s
```

The other paths of the new sender, for real: a server that sends the headers and part of the body and
then drops the socket → `demo:ask: the answer of the API at http://127.0.0.1:39126 could not be read`,
exit `1`; a closed port → `demo:ask: the API is not reachable at http://127.0.0.1:39127 (start it with
npm run up)`, exit `1`; `..` as the id → the usage line, exit `2`. Against the real API (the working
tree's `packages/api` on the throwaway test database `codemind_test`, seeded, `CODEMIND_SKIP_DOTENV=1`,
port 39130): the golden question → `HTTP 200`, 4 statements, 4 evidence, exit `0`; the refunds question
→ `HTTP 200` `UNKNOWN` `no-anchor`; an unknown id → `HTTP 404` `PROJECT_NOT_FOUND`, exit `1`; a
four-letter question → `HTTP 400` `VALIDATION_ERROR`, exit `1`. Fastify accepts the `node:http` request
(header and `content-length`). The API was stopped afterwards; ports free.

## Security review (inline)

The step asks for the `security-reviewer` agent when the diff touches HTTP inputs, rate limits, secrets
or personal data. The diff touches how `.env` (which can hold `LLM_API_KEY`) is read; this step has no
agent tool, so the agent's checklist (`.claude/agents/security-reviewer.md`) was applied inline to
`git diff 368dc38...HEAD`:

| Severity | Area | Finding |
|---|---|---|
| High — none | Secrets | No secret, token or key in the diff (pattern search for key shapes, `Authorization:`, private keys; the only URLs with credentials are the local `codemind:codemind` default and the deliberately wrong `wrong-password` of the reports). The loader never prints a key or a value (its only line is `warning: .env not read (<code>)`). |
| High — none | Entry points | No new route; the only product change is one string of Screen 1. `demo:ask` is a client of the existing API; `demo:excerpt` reads only inside `fixtures/<project>` (lexical and real-path checks, links included, D20). |
| Medium — none | Error messages | The helpers echo only what the person typed (the path, the project) and the local origin; no stack trace is printed (D22 removed the one case). |
| Medium — none | Dependencies | None added; `package-lock.json` unchanged; `scripts/` imports only `node:` modules (pinned by a test). |
| Low — none | Logs | Nothing logs a request body. |

Nothing to fix.

## Run 2 (on `525724f`, trimmed to the change)

### Adversarial review: run 2

**Scope:** I reviewed `git diff f9df1ca..HEAD`, the 5 commits made after run 1 (a2ffdec, d1c1372, 3e74e28, 4cd99d7, 525724f). For the AR1 fix I read all of `scripts/demo-ask.mjs` and `tests/unit/scripts/demo-ask.spec.ts`. I also read the parts of `guides.spec.ts`, `env.spec.ts`, the spec delta, `design.md`, `tasks.md` and the report addenda that changed. To compare, I read the existing `node:http` sender `packages/cli/src/cache/long-fetch.ts`. I checked the Fastify options in `packages/api/src/app.ts:93` and the Node version (v24.11.1). I did not run the test suite: it creates temporary directories, which this read-only review does not allow.

#### Is the AR1 fix correct?
Yes.
- `http.request` has no client-side time limit, and `scripts/demo-ask.mjs:35-55` sets neither `timeout` nor `setTimeout`.
- `agent: false` means no keep-alive connection is left open, so the process exits once the answer is printed.
- The body is read with listeners attached in the response callback, so no data is lost. `text.catch` avoids an unhandled rejection.
- A socket error after the response has arrived is handled. It reaches `outgoing`'s `failed`, which has no effect once the promise is settled, and the response's `error`/`close` events then reject `text()`.
- On the server side, Fastify is built with no `connectionTimeout` or `requestTimeout`, so the API does not close a slow answer either.
- The A27 dot check is complete. Any `%` the user types is encoded to `%25`, so `%2E`-style dot segments cannot reach the URL.

#### Findings
| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `scripts/demo-ask.mjs:41-50`; `tests/unit/scripts/demo-ask.spec.ts:320-342` | The new sender's dropped-body handling (the `error` and `close` listeners and the `!incoming.complete` check) is not run by any test. "An answer that cannot be read is reported" still injects a `send` double that rejects with fetch's `TypeError('terminated')`. **Mutation it misses:** delete lines 44-47. A body cut mid-way would then leave `text` unsettled for ever, and the CLI would end with an unsettled top-level await instead of the spec's message and exit `1`. The suite stays green. This path was only checked by hand (report AR1, port 39126). | This is the code AR1 added, and the only proof that it works is manual. A short test would close it: a real server that sends the headers and part of the body, then destroys the socket. |
| Minor | `tests/unit/scripts/demo-ask.spec.ts:294`; spec "A slow answer is waited for" | The "no time limit" requirement is guarded only by a regex on the source (`/\bfetch\s*\(\|globalThis\.fetch/`). The 1.5 s server delay would pass with `fetch` too. A `outgoing.setTimeout(300_000, …)` or `AbortSignal.timeout(300_000)` would bring the 300 s limit back with every test green, and so would `globalThis['fetch']`. The spec now names the transport (`node:http`), not only the behaviour. | D23 accepts this ("a 300 s wait does not belong in the suite"), but the guard checks how the code is written, not what it does. Record it as accepted (D) or replace it with a check on the request's socket timeout. |
| Minor | `tests/unit/docs/guides.spec.ts:100-101`; `docs/DEMO.md` (0 `powershell`/`bash` blocks) | The AR6 fix (no heading between the two blocks of a pair) runs over an empty set. `DEMO.md` has no shell pairs, and no made-up markdown is fed to `fences()`. Deleting line 101 changes nothing. Run 1 already said "the check currently tests nothing", and the resolution's "test strengthened" does not change that. | AR6 is marked **A, fixed**, but there is still no evidence that the check works. A small markdown example with one valid pair, one pair split by a heading and one unpaired block would make it real. |
| Minor | `design.md:168-169`; `tasks.md:41` | D8 still says `runDemoAsk(args, { env, dotenvPath, fetch, stdout, stderr })` and "the real `fetch` taken from `globalThis`". Task 6.2 (`[x]`) still says `globalThis.fetch`. D23 renamed the option to `send` and banned `fetch`, but did not change D8. | The design now contradicts itself, and the code. The archived design will describe the wrong transport. |
| Minor | spec history: 4cd99d7 comes after a2ffdec | The spec scenarios "A slow answer is waited for" and "A dot project id is a usage error" were written after the code and test commit. This repeats AR8. The RED messages are quoted in the report, but the history cannot show them. | Process debt only, the same class as AR8. |
| Question | `scripts/demo-ask.mjs:154-156` | Every failure before the headers still prints "the API is not reachable … (start it with npm run up)". That includes an `ECONNRESET` or socket hang-up when the API dies while working on an answer. Run 1 step 1 suggested telling the cases apart with the error `code`, and that was not done. With no client time limit left, the main trigger is gone, and "start it with npm run up" is roughly right for an API that died. | Probably acceptable. Record it as D or say nothing, but decide on purpose. |

**Existing tests modified in this round:**
- "An answered question prints its status and summary" gained the `content-type` assertion, so it is stronger.
- "demo:ask reads PORT from .env" and "An answer that cannot be read is reported" only had the `fetch` → `send` rename.
- `apiDouble` gained an optional `delayMs`, and existing calls are unchanged.

None got weaker, so these changes are justified.

**Blast radius:**
- `runDemoAsk` and the `Send` type are used only by its own spec and the CLI entry. Nothing else imports the old `Fetch` type.
- No other code path changed.
- The remaining mentions of `fetch` in `readme.md` and `docs/project-context.md` are about the LLM adapter's `LLM_TIMEOUT_MS`, and they are still true.
- There is no migration and no new dependency.
- `long-fetch.ts` already does this job, but `scripts/` cannot import a TypeScript module (only Node built-ins, pinned by a test), so the copy is justified.

**Other run-1 fixes I checked:**
- AR2 (`env.spec.ts` with `'0'`, `'true'`, `''`, `' 1'`) catches a truthy or trimmed check.
- AR3 catches `<=` changed to `<`, and a wrong default port.
- AR5 catches dropping `isSuccess(status) &&`: the 409 body with `statements` would be summarised.
- AR4 catches deleting the header.

#### Verdict
**PASS WITH GAPS.** There are no Blockers and no Majors. The AR1 Major is really fixed, and the A27 fix is complete. The gaps above are Minor. Two of them (the dropped-body path and AR6) are run-1 items whose resolution says more than the evidence shows.

#### Recommended next steps before archiving
1. **Dropped-body test → A.** Add one test with a real server that writes the headers and part of the body, then destroys the socket. It should expect the "could not be read" message, an empty stdout and exit `1`. It is cheap, and it covers the only new code that has no automated test.
2. **AR6 pairing check → A.** Feed `fences()` and the pairing loop a small markdown example (a valid pair, a pair split by a heading, an unpaired block), or move the loop into a helper and test that. Until then, change the AR6 resolution from "fixed" to "no pairs exist today".
3. **D8 / task 6.2 wording → A.** Update `design.md:168-169` to say `send` and `node:http`, or add a "superseded by D23" note. Leave the task text as history, or add the same note there.
4. **Source-grep guard for "no time limit" → D.** Accept it in the D23 text as a design decision ("the suite cannot wait 300 s; the guard checks the source"), or replace it with a check that the request's socket timeout is 0.
5. **"Not reachable" on a reset before the headers → D.** Accept it in design → Risks in one sentence.
7. **Spec written after the code again (4cd99d7 after a2ffdec) → D, process.** Add it to the AR8 row. It is not a Linear issue.
8. Save this run as "Run 2" in `reports/2026-10-19-adversarial-review.md`. Because no Major is left, task 19.8's "re-run until no Blocker or Major" is met once items 1 to 3 are done or given a destination.

## Resolution of run 2

No Blocker and no Major: task 19.8 is met. Ids AR2-1 to AR2-6 follow the order of the findings table
above (one finding about files outside the change was out of scope and is not listed); each has its
destination in `design.md` → Follow-ups.

| Finding | Resolution |
|---|---|
| AR2-1 — dropped-body path untested | **Fixed**: "An answer that cannot be read is reported" also runs a real server that sends the headers and part of the body and destroys the socket. Mutation check: with the `error`/`close` listeners deleted, the test fails (`Test timed out in 20000ms`); restored. |
| AR2-2 — source guard for "no time limit" | Accepted (D) in D23: the suite cannot wait 300 s; the 310 s real check is in run 1's resolution. |
| AR2-3 — pairing over an empty set | **Fixed**: the rule is the helper `unpairedShellBlocks`, tested on made-up Markdown: a pair with text between → none; a pair split by `### Otro` → both blocks; `bash, powershell, bash` → the third; a lone `powershell` → it. |
| AR2-4 — D8 / task 6.2 wording | **Fixed**: D8 names `send` and the `node:http` sender (superseded note); task 6.2 keeps its history with the same note. |
| AR2-5 — spec after code again | Accepted (D), joined to the AR8 row (process). |
| AR2-6 — reset before headers = "not reachable" | Accepted (D) in D23: the advice to start the API again is right for an API that died. |

`npx vitest run tests/unit/scripts tests/unit/docs` → 6 files, 41 tests passed; lint, typecheck and
`openspec validate --strict` clean. The full suite and gates are in the addendum of the step 14 report.
