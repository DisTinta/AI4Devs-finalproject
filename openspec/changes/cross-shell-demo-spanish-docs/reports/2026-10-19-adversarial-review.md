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
