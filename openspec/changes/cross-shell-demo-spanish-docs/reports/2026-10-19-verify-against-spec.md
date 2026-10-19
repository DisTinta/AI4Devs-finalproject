# Verify Against Spec Report

- Date: 2026-10-19
- Change: cross-shell-demo-spanish-docs (DIS-102)
- Step: 19.5 — `/verify-against-spec`
- Audited commit: `b23658e` (read-only conformance audit, run as the skill's forked Explore agent; its
  report is reproduced verbatim below, with the OS user name of one path masked), then the resolution
  of every finding in this change.

## Audit (verbatim)

I audited `cross-shell-demo-spanish-docs` (DIS-102) on `feature/DIS-102-cross-shell-demo-spanish-docs` at `b23658e`, against the base `368dc38`. It is mostly conformant. One clause of one scenario has no evidence yet, two tests check less than their scenario says, and there are a few behaviours the spec doesn't ask for that need a decision. I did not run the tests myself, because this audit was read-only. The test states below come from `reports/2026-10-19-14-test-and-state-verification.md` (45 of 45 targeted tests, 1719 of 1719 in the full suite). `reports/2026-10-19-show-spec-working.md` confirms that no code or test changed between `c129278` and `b23658e`.

All paths are relative to the repository root (`C:\Users\<user>\…\Codemind\`).

### 1. Requirements implemented correctly

| Requirement | Code | Proof |
|---|---|---|
| The .env file grammar | `scripts/env.mjs:30-67` | `tests/unit/scripts/env.spec.ts:13`, `:45` |
| Loading .env into a process (precedence, missing file, warning, root path, skip switch) | `scripts/env.mjs:17,81-94`, `scripts/load-env.mjs:11`, `vitest.config.ts:45` | `env.spec.ts:90,104,118,134,146` |
| Which commands load .env | `package.json:21-34`, `packages/api/package.json:8` | `tests/unit/scripts/wiring.spec.ts:91`; real shells: report 15 §15.4 |
| One command starts the system | `scripts/up.mjs:57-137` | `tests/unit/scripts/up.spec.ts:84,128,152,178,192`, `wiring.spec.ts:149`; Docker down: report 15 §15.5 |
| Stopping the system and the Makefile | `package.json:22`, `Makefile:11,15,19,23` | `wiring.spec.ts:189,197`; `make up`/`make down`: report 15 §15.6 |
| Configurable Postgres port | `docker-compose.yml:9`, `.env.example:47-52` | `wiring.spec.ts:216` |
| The demo question helper | `scripts/demo-ask.mjs:30-123` | `tests/unit/scripts/demo-ask.spec.ts:72,100,120,139,161,187` (but see block 2) |
| The demo excerpt helper | `scripts/demo-excerpt.mjs:76-111` | `tests/unit/scripts/demo-excerpt.spec.ts:43,58,82,101` |
| The demo guide runs the same in PowerShell and Bash | `docs/DEMO.md` (no `powershell`/`bash` blocks, no indented fences) | `tests/unit/docs/guides.spec.ts:82,108,158`; review half: report 16 and its screenshots |
| The deployment and testing guides in Spanish | `docs/DEPLOYMENT.md:22,99`; `docs/TESTING.md:44-57` (labelled pair, `Remove-Item Env:DATABASE_URL`) | `guides.spec.ts:206`; phrase search: report 14 addendum 17.1. I re-ran the search and every hit is still a true statement. |
| Published weights, in Spanish | `docs/CONFIDENCE.md:8,20,41-51` | `tests/unit/knowledge/confidence-doc.spec.ts:51,72` |
| API status on Screen 1 (`npm run up` hint) | `packages/web/src/pages/ProjectPickerPage.tsx:46` | `ProjectPickerPage.test.tsx:364` ("A failed retry keeps the alert"); the other 8 scenarios are unchanged at `:176-387` |

"Warning at most once per process" has no automated test. It was shown by hand in the show-spec-working report, E5: one `warning: .env not read (EISDIR)` per process.

### 2. Requirements missing or partial

- **"…the pull request body records the run"** (scenario "The guide was followed on a clean clone in both shells"): **absent**. No PR exists yet; tasks 18.1 and 19.1 are still unchecked in `tasks.md`.
- **"in PowerShell and in Bash"**: partial evidence. Only PowerShell 7.6.6 was run. Report 16, lines 53-54, says Windows PowerShell 5.1 (the default on Windows 11) was not tried, and that is where `npm.ps1` handling of `--` could differ.
- **"PORT=abc … no request was sent"**: the test proves nothing here. `demo-ask.spec.ts:167,183` checks that a second server got no request, but the helper never contacts that server's port. Exit code 2 and the message are checked; "no request sent" is not. A fetch double would prove it.
- **"A `<path>` that … resolves, links included, outside `fixtures/<project>` SHALL be refused"**:
  - The code checks links (`demo-excerpt.mjs:100`), but no test covers a symlink.
  - A broken link pointing outside the fixture fails `realpathSync` at `:95-97`. It then reports "not found", although the spec puts the "outside" check before the "missing" check.
  - `isInside` (`:53`) uses `rest.startsWith('..')`, so a file inside the project whose name starts with `..` (e.g. `..foo`) is wrongly refused as outside.
- **"Before each step it SHALL print one line `[up] <command>`"**: `up.spec.ts:114-123` only checks the final stdout text. It never checks that each line comes before its step runs.
- **"a `powershell` block and a `bash` block SHALL always come as an adjacent pair"**: `guides.spec.ts:89-94` accepts `bash, powershell, bash`. Today this cannot fail, since DEMO.md has no such blocks.

### 3. Unspecified behaviour (each needs a decision: remove it, or add it to the spec)

1. **`.env` can supply `npm_execpath`.** `scripts/up.mjs:96-98` loads `.env` before reading `npm_execpath`. A `.env` line `npm_execpath=x.js` makes `node scripts/up.mjs` run `x.js` with Node at every npm step. The spec says it is "the `npm_execpath` npm gives its scripts". An empty value is also treated as unset, which the spec doesn't mention. Either read it before loading `.env`, or write this into the spec.
2. **`demo:ask` crashes if reading the body fails.** At `scripts/demo-ask.mjs:120`, if `response.text()` rejects (connection dropped after the headers), the error is not caught. The helper dies with a Node stack trace. The spec only defines the "not reachable" case.
3. **`demo:ask` loads `.env` before checking its arguments** (`demo-ask.mjs:96-100`). With an unreadable `.env`, stderr gets the warning line plus the usage line. The scenario says stderr *is* the usage line.
4. **A 2xx body without `usage`** prints `{statements, evidence}` with no `usage` key (`demo-ask.mjs:61`, dropped by `JSON.stringify`). The spec always lists `usage`.
5. **Request header** `content-type: application/json; charset=utf-8` (`demo-ask.mjs:113`). It is implied by the spec but not stated. Simplest fix is to add it to the spec.
6. **An `unknown` fallback when an error has no code**: `scripts/env.mjs:88` and `scripts/up.mjs:133`.
7. **Readme changes beyond the spec:**
   - `readme.md:415-435`: a new `bash`/`powershell` pair for `OLLAMA_CONTEXT_LENGTH`, and the `LLM_*` setup moved into `.env`. The spec only asks to remove the "export DATABASE_URL" sentences.
   - `readme.md:461`: a `POSTGRES_PORT` row in the variables table (listed in task 12.1, not in the spec).
   - `readme.md:659`: a `scripts/` entry in the §2.3 file tree. The proposal names only §0, §1.3 and §1.4.
8. **A governance rule**: `docs/project-context.md` adds the "Language exception, evaluator guides" rule (design D18). It is in the proposal and design, but no spec requirement covers it.
9. **Makefile comments rewritten in English** (`Makefile:1-22`). Task 5.2 asked for this; the spec doesn't mention it.

### Specific checks
- **Dependencies outside the manifest:** none. `scripts/*.mjs` import only `node:` modules. The tests import `vitest`, `yaml` (`package.json:61`, already there before this change) and `@codemind/core` (a workspace package). `package-lock.json` is unchanged.
- **Authorisation:** the spec asks for no auth check. The guards it does ask for are in place: excerpt confinement (with the broken-link gap above), `down` never using `-v`, and the loader never printing keys or values (`env.mjs:88`).
- **Extra response fields:** none. `demo:ask` prints only the fields the spec names, and no API or CLI contract changed.
- **Weaker tests:** the three listed in block 2 (PORT=abc, `[up]` line order, block pairing).

### Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The .env grammar of .env.example is read | `env.spec.ts:13` | green |
| Lines that do not match are ignored… | `env.spec.ts:45` | green |
| Values of .env fill only the variables the environment lacks | `env.spec.ts:90` | green |
| Without .env the environment is unchanged | `env.spec.ts:104` | green |
| An unreadable .env is skipped with a warning | `env.spec.ts:118` | green |
| The loaded .env is the repository root's | `env.spec.ts:134` | green |
| The test suite never reads .env | `env.spec.ts:146` | green |
| The guide's scripts load .env and the quality scripts do not | `wiring.spec.ts:91` | green |
| A guide command reads DATABASE_URL from .env | manual, report 15 §15.4 | green (manual) |
| Up runs the start sequence in order | `up.spec.ts:84` | green (weak on line order) |
| Up stops at the first failing step | `up.spec.ts:128` | green |
| Ctrl+C stops up without a failure line | `up.spec.ts:152` | green |
| A step that cannot start stops up | `up.spec.ts:178` | green |
| Up needs npm to start it | `up.spec.ts:192` | green |
| The startup scripts need no installed dependency | `wiring.spec.ts:149` | green |
| Up with Docker unavailable fails naming its first step | manual, report 15 §15.5 | green (manual) |
| Down keeps the data volume | `wiring.spec.ts:189` | green |
| Make delegates to the npm commands | `wiring.spec.ts:197` | green |
| The Postgres port follows POSTGRES_PORT | `wiring.spec.ts:216` | green |
| An answered question prints its status and summary | `demo-ask.spec.ts:72` | green |
| An UNKNOWN answer prints its reason | `demo-ask.spec.ts:100` | green |
| An error status prints the error body | `demo-ask.spec.ts:120` | green |
| An unreachable API is reported | `demo-ask.spec.ts:139` | green |
| demo:ask reads PORT from .env | `demo-ask.spec.ts:161` | green (weak on "no request sent") |
| Missing arguments are a usage error | `demo-ask.spec.ts:187` | green |
| An excerpt prints exactly the cited lines | `demo-excerpt.spec.ts:43` | green |
| Paths outside the project are refused | `demo-excerpt.spec.ts:58` | green (no symlink case) |
| A missing file or a range past its end is reported | `demo-excerpt.spec.ts:82` | green |
| A malformed citation is a usage error | `demo-excerpt.spec.ts:101` | green |
| The demo guide has no Bash-only command | `guides.spec.ts:82` | green (weak on pairing) |
| The demo guide is ordered for a first-time reader | `guides.spec.ts:108` | green |
| The web walkthrough names what each screen shows | `guides.spec.ts:158` + report 16 review | green |
| The guide was followed on a clean clone in both shells | report 16 | red: the PR-body clause is absent; PowerShell 5.1 not run |
| Links to the guides' sections resolve | `guides.spec.ts:206` | green |
| The guides are in Spanish and say that .env is read | report 14, addendum 17.1 | green (manual) |
| The published weights are the code's weights | `confidence-doc.spec.ts:51` | green |
| The confidence document states its limits | `confidence-doc.spec.ts:72` | green |
| Project-picker: the 9 "API status on Screen 1" scenarios | `ProjectPickerPage.test.tsx:176,194,250,276,299,330,348,370,387` | green |

## Resolution

Severity: no Blocker and no Major; every point is Minor or Question. Each one has its destination in
`design.md` → Follow-ups (V1–V8, V-U1–V-U9); the ones fixed in code followed TDD.

| Finding | Resolution |
|---|---|
| V1 — PR body clause | Task 18.1 (PR preparation) writes the clean-clone run into the PR body; destination A. |
| V2 — Windows PowerShell 5.1 | Exercised now (evidence below); design → Risks updated. |
| V3 — `PORT=abc` "no request" | "demo:ask reads PORT from .env" now passes a `fetch` double and asserts no request was attempted. |
| V4 — no link test | New scenario and test "A link that leads out of the project is refused" (a junction): green on its first run, because the real-path check already refused it (a guard test, as noted in the step 14 report for two others). |
| V5 — broken link → "not found" | Spec sentence: a link that leads nowhere is a missing file; behaviour kept (nothing is read in either case). |
| V6 — `..name` refused | Fixed (design D20). RED: `expected '' to be 'first\nsecond\n'`; GREEN after `isInside` checks the first segment. |
| V7 — `[up]` line order | "Up runs the start sequence in order" records stdout at each step start and asserts the lines up to it. |
| V8 — pairing | The pairing check consumes each pair; `bash, powershell, bash` now fails. |
| V-U1 — `npm_execpath` from `.env` | Fixed (D21). RED: `expected [ … ] to have a length of +0 but got 5`; GREEN after reading it before `.env` is loaded. |
| V-U2 — body read crash | Fixed (D22). RED: `TypeError: terminated` (uncaught); GREEN with the new stderr line and exit `1`. |
| V-U3 | Accepted (D): the spec loads `.env` first; the warning is the loader's own line. |
| V-U4, V-U5, V-U6 | Spec sentences added; behaviour kept. |
| V-U7, V-U8, V-U9 | Accepted (D): documentation and governance within the ticket's author decisions and tasks 5.2, 12.1. |

The show-spec-working finding SSW1 (`KEY= # note` read as `# note`) was fixed in the same pass (D19).
RED: `expected { E: '# set it here', …(2) } to deeply equal { E: '', H: '', I: '#kept' }`.

### V2 evidence — Windows PowerShell 5.1

`powershell.exe -NoProfile -File <scratchpad>\ps51.ps1` (UTF-8 with BOM), from the working tree, with a
local echo server on 127.0.0.1:39123 that records the request body and answers it back:

```text
PSVersion 5.1.26100.9711; npm -> C:\laragon\bin\nodejs\node-v24.11.1-win-x64\npm.ps1
HTTP 200
{
  "answer": "UNKNOWN",
  "reason": "echo",
  "message": "{\"question\":\"¿Cómo se calcula el precio final de un pedido?\"}"
}
exit 0
usage: npm run demo:ask -- <projectId> "<question>"
exit 2
excerpt exit 0; lines 29; first: class PriceCalculator
```

The server's log: `{"path":"/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask","body":"{\"question\":\"¿Cómo se calcula el precio final de un pedido?\"}"}`;
the decoded question equals the golden question (`true`). `--` reached the script (two arguments) and
the accents arrived byte for byte. The echo server was stopped afterwards.

### Tests after the fixes

`npx vitest run tests/unit/scripts tests/unit/docs` → 6 files, 36 tests passed (31 before, plus five new
scenarios); `npx eslint scripts tests/unit/scripts tests/unit/docs` clean; `npm run typecheck` clean. The
full suite and the gates are re-run before the commit (addendum below).
