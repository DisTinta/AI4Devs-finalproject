## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `packages/analyzers/typescript/src/symbols.ts` tests `(list.flags & ts.NodeFlags.Const) !== 0` for a
  module-level variable statement. With TypeScript 5.9.3 (the repository's): `Const` = 2,
  `Using` = 4, `AwaitUsing` = 6, `BlockScoped` = 7. Checked in this propose: the parser accepts
  `await using f = async () => 1;` and `using g = () => 1;` appended to the `src/v.ts` content of the
  scenario "Other variable forms are not function symbols" with no parse diagnostic, and their
  `declarationList.flags & 7` are 6 and 4.
- `packages/cli/src/seed/fingerprint.ts` hashes `packages/analyzers/typescript/src` into **one**
  analyzer fingerprint shared by both samples. `seeds/graph-dump.sql`, `seeds/cache/acme-shop.json`
  and `seeds/cache/task-api.json` all carry it; `verify` refuses a golden file whose `seed.*` differs
  from the seed header (`FINGERPRINT_MISMATCH` `{reason:"golden"}`), and `cache:build` refuses a
  partial regeneration over a file with other fingerprints.
- The DIS-33 round of the golden review (`docs/golden-review/2026-10-task-api-golden-review.md` and
  `docs/golden-review/panel/2026-10-golden-review-{input,panelist-1,panelist-2,resolution}.json`)
  is checked by `tests/unit/seed/golden-reviews.spec.ts`, which recomputes the panel input **from the
  current golden files**: once they are regenerated, that test fails against the DIS-33 files.
- Signatures today: task-api Q1–Q3 and acme-shop Q3 signed by the DIS-33 panel; acme-shop Q1 and Q4
  unsigned (`incorrect`, DIS-108 and DIS-109). `cache:build` empties `reviews` of every entry it
  writes.
- Ollama (`qwen2.5-coder`) runs locally; since the NVIDIA driver update it can use the GPU
  (`docs/project-context.md` → Gotchas, DIS-72), so a full `cache:build` takes roughly 25–60 minutes.

## Goals / Non-Goals

**Goals:**

- One analyzer commit, so the golden answers are regenerated once.
- A second, independent and blind panel round over the regenerated answers, with the DIS-33 criterion
  unchanged, whose record is as checkable as DIS-33's.

**Non-Goals:**

- No change to the golden format, `cache:build`, `seed:build`, `verify`, the golden questions or the
  review criterion (ticket E10, destination D).
- No other analyzer symbol change; the PHP analyzer is untouched.
- No edit of the DIS-33 round files.

## Decisions

**D1 — The fix (ticket E1).** The condition becomes
`(list.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const`: exactly `const`, which excludes
`let` (1), `var` (0), `using` (4) and `await using` (6). *Alternative rejected:* testing
`!(list.flags & ts.NodeFlags.Using)` as well — it keeps the `Const` bit test that caused the defect and
reads as two rules for one.

**D2 — The test case (ticket E2).** The two forms are appended at the **end** of the `src/v.ts`
content of the existing test "Other variable forms are not function symbols"
(`tests/unit/analyzers/typescript/structure.spec.ts`), so the expected symbols (`method run` 9–9,
`function outer` 10–10) keep their lines; the test also asserts `diagnostics` is empty (as the
spec scenario says). With the current code it fails by an extra `function f` 12–12 (`using g` already
yields nothing, since `Using` = 4 has no `Const` bit; it is added so the rule covers both forms). The
spec delta MODIFIES the
whole requirement "TypeScript symbol extraction" (OpenSpec needs the full block) with two textual
additions and the extended scenario. *Alternative rejected:* a separate scenario with its own file —
one more test for the same rule.

**D3 — Regenerate both golden files in full (ticket E3, E4).** The analyzer fingerprint is shared, so
regenerating only task-api would leave `seeds/cache/acme-shop.json` with the old fingerprint and
`verify` would fail on it. Both files are regenerated with `npm run cache:build` without arguments
(partial regeneration is refused with a new fingerprint), with `LLM_MODEL=qwen2.5-coder` (the DIS-32
generator). This extends the letter of the author's instruction ("golden de task-api") out of
technical necessity. If one project fails after `cache:build`'s own three attempts, it is rerun once
with `npm run cache:build -- --project <name>`; a second failure stops the ticket (clean stop: no
golden answer can be produced, the author decides), because a seed without matching golden files
cannot pass `verify`.

**D4 — Commit order (ticket E4, AC 3).** (1) the round's report with only `## Criterion` and
`## Panel`, committed before any regenerated answer exists; (2) the failing test and the one-line fix
in one commit (the code commit, so the fingerprint changes once); (3) `npm run seed:build`, commit
`seeds/graph-dump.sql` (and `packages/web/src/data/sample-projects.ts` only if it changed; it is
expected unchanged because no fixture uses `using`, and `git diff seeds/graph-dump.sql` is expected to
touch only the fingerprint header); (4) `npm run cache:build`, then `npm run db:seed` and
`npm run verify`, commit both golden files; (5) the panel input. CI is not run in between (no PR is
open until the after-panel tasks).

**D5 — Panel (ticket E5).** Same roles, criterion and output shapes as DIS-33: panelist 1 Opus,
panelist 2 Sonnet, blind to each other, a resolver Opus with a fresh context over the disagreements
only; n = 7 (the six golden answers and the behaviour item task-api Q4). The Criterion block of this
change's Panel group is copied verbatim from `openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md`
and a test checks the equality (spec "Criterion first and immutable panel record").

**D6 — Blindness of this round.** Allowed to a panelist: the Panel group of this `tasks.md`, the
`## Criterion` and `## Panel` sections of this round's report, this round's input,
`docs/base-standards.md`, and the fixture code (every file under `fixtures/task-api/` and
`fixtures/acme-shop/` except their `README.md`, `docs/**` and `node_modules/**`). Unlike DIS-33, **no
Linear description** is allowed: the description of DIS-107 names the previous verdicts (acme-shop Q1
and Q4 `incorrect`) and DIS-33's describes the previous answers; the Panel group is self-contained.
Forbidden, in addition to DIS-33's list: every file of the DIS-33 round, the DIS-34 and DIS-104
reports, `openspec/changes/archive/**`, and any Linear content (DIS-33, DIS-107, DIS-108, DIS-109).
The resolver may also read the two panelist outputs of this round and `docs/AUTONOMOUS-RUN.md`.
The per-item verdicts of the previous round and their pending tickets are written only in this design
(Context, D9), never in `tasks.md` outside the Panel group, because a panelist reads the whole
`tasks.md` (task 5.1 checks it).

**D7 — Round files and the coherence test (ticket E6).** New files with the suffix `-dis-107`
(precedent: `2026-10-acme-shop-golden-review-dis-104.md`); the DIS-33 files stay unchanged as history.
`tests/unit/seed/golden-reviews.spec.ts` is retargeted: its path constants (`INPUT_PATH`,
`PANELIST_PATHS`, `RESOLUTION_PATH`, `REPORT_PATH`), the allowlists (`PANELIST_FILES`,
`RESOLVER_FILES`, without the `linear:` entry), the synthetic outputs that cite the tasks file, the
tasks-file resolution (`ts-await-using-golden-regen`, active or archived) and the forbidden paths
checked in `## Panel`; and it gains the comparison of this round's Criterion block with the DIS-33
one. The DIS-33 round is no longer checked by a test: its files cannot match the regenerated golden
files, and their immutability is checked by `git diff` in the step 10 report (D10). *Alternative
rejected:* parametrising the test over both rounds — the DIS-33 projection would need the old golden
files from git history, which a shallow CI clone may not have.

**D8 — The test is red between the preparation and the after-panel tasks.** The retargeting of the
input `it` happens in the preparation (task 4), but the `it`s over panel outputs, signatures and the
report can only pass once the panel has run. Between the preparation commit and task 8.5 (task 7.1 for the panel-output `it`s) those `it`s
fail; no PR exists in that window, so no CI run is affected, and the preparation step runs only the
targeted `it` (`-t`). *Alternatives rejected:* `it.skip` or an existence guard — either could leave
the checks silently off.

**D9 — Signatures and incorrect answers (ticket E7, E8).** As in DIS-33: every `correct`/`partial`
entry gets `[{"by":"agent:<model of panelist 1>","date":…},{"by":"agent:<model of panelist 2>","date":…}]`;
an `incorrect` one keeps `reviews: []` and is listed in `## Pending` with its ticket: DIS-108 for
acme-shop Q1, DIS-109 for acme-shop Q4, a new successor issue created by the agent for any other. If
acme-shop Q1 or Q4 is now `correct`/`partial`, a Spanish comment on DIS-108/DIS-109 says this change
resolves it and the author confirms and closes it (destination B).

**D10 — Order and immutability checked from git, not by a test.** As DIS-33 D9: CI clones may be
shallow, so the ancestor relations (report → regeneration → input), the single commit of each panel
file, the empty diff of the DIS-33 files and the `reviews`-only diff of the golden files after the
regeneration commit are verified with git in the step 10 report (task 10.3).

**D11 — Running a one-hour `cache:build` in an agent step.** A foreground Bash call lasts at most 10
minutes, and the workflow forbids the tool's background mode and `Monitor`. As in DIS-32 (its task
6.2): one Bash call starts `cache:build` detached with its output redirected to a log in the
scratchpad, and later foreground calls read the log until its final line or an error. Ollama must
serve with `OLLAMA_CONTEXT_LENGTH=16384` (`docs/project-context.md` → Gotchas, DIS-72); an
`invalid-model-output` on every attempt of the first question means the context is truncated and
Ollama is restarted with it before retrying.

## Risks / Trade-offs

- [The regenerated answers are worse than the current ones (more `incorrect`)] → They are judged by
  the same criterion; an `incorrect` answer stays unsigned with a ticket (D9); the demo keeps serving
  it as today (verify compares structure only).
- [The 7B model fails a question three times] → One rerun per project, then a clean stop (D3).
- [`seed:build` changes more than the header (another salt, untracked file)] → `git diff` of the seed
  is checked to touch only the fingerprint header and `sample-projects.ts` to be unchanged; any other
  change stops the task until explained (`AUTHOR_HASH_SALT` from `.env`, D4).
- [A panelist reads a forbidden source] → `sourcesRead` is checked against the allowlist by the
  test; it is self-declared (stated in `## Limitations`).
- [Red `it`s between preparation and panel] → D8.

## Migration Plan

No deployment. Rollback is reverting the branch: the previous seed and golden files come back with the
analyzer, and `verify` passes again with them.

## Open Questions

None.

## Follow-ups

Decisions of the enrich step (Linear DIS-107, E1–E10) and of this proposal (D1–D11), with their
destination (`docs/project-context.md` → Tracking deferred findings). *Agent's text: decided as lead
engineer in an autonomous run (docs/AUTONOMOUS-RUN.md §6), without the author.* The spec audit and
the pre-merge reviews add their findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 / D1 | Fix: `(list.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const` | **A** — this change |
| E2 / D2 | `await using` and `using` appended at the end of the existing `src/v.ts` case; spec delta MODIFIES the whole requirement | **A** — this change |
| E3 / D3 | Both golden files regenerated in full (shared fingerprint); one rerun per failing project, then clean stop | **A** — this change |
| E4 / D4 | Commit order: criterion report → test and fix → seed → golden files → input | **A** — this change |
| E5 / D5 | Panel roles, n = 7, criterion copied verbatim from DIS-33 and checked by a test | **A** — this change (Panel group) |
| D6 | No Linear source allowed to the panel; DIS-33 round files and earlier reports forbidden | **A** — this change (Panel group, spec, test) |
| E6 / D7 | Round files with suffix `-dis-107`; DIS-33 files unchanged; coherence test retargeted | **A** — this change |
| D8 | Red window of the panel `it`s between preparation and after-panel tasks, no PR in it | **A** — this change |
| E7 / D9 | acme-shop Q1/Q4 `correct`/`partial` → signed here, comment on DIS-108/DIS-109 for the author to close; else they stay pending there | **B** — existing tickets, to be confirmed by the author |
| E8 / D9 | Any other `incorrect` answer → unsigned, successor issue created by the agent | **B** — successor issue of the agent, to be confirmed by the author |
| E9 | No PowerShell check is planned. The guide transcripts that quote the regenerated answers are updated in task 13.2 (Paso 6 recaptured in Git Bash; dated note for the `demo:ask` figures and the web confidence); a web screenshot, if it has to be retaken, is left to the author (spec audit run 1, B2) | **A** (transcripts) / **C** (screenshots, author, only if needed) |
| E10 | Golden format, `cache:build`, `verify`, `seed:build` and the criterion are out of scope | **D** — out of scope |
| D10 | Order and immutability verified with git in the step 10 report (task 10.3) | **A** — this change |
| D11 | Detached `cache:build` with a log polled in the foreground; Ollama with 16384 context | **A** — this change |
| Audit 1 Q1 | *Agent's text.* Question for the author answered by the agent as lead engineer: (a) the regeneration covers both golden files (task-api and acme-shop), because the analyzer fingerprint is shared and `verify` would fail on an acme-shop file left with the old one; regenerating only task-api cannot meet AC3; (b) the regenerated acme-shop Q1 and Q4 go through the same panel, and if judged `correct`/`partial` they are signed here and their existing tickets (D9) get a Spanish comment for the author to confirm and close them; the agent closes no ticket | **A** — this change (regeneration, panel) / **B** — existing tickets, closure confirmed by the author |
| Audit 1 B1 | Per-item verdicts, signature states and pending tickets removed from `tasks.md` outside the Panel group (tasks 0.4, 8.3); task 5.1 checks it; D6 states it | **A** — this change |
| Audit 1 I1–I3, I5 | Step 10 report named consistently (spec, D7, D10); D8 red window ends at 7.1 / 8.5; `reviews`-only diff of `seeds/cache/` added to the git scenario; `ALLOWED_REPOS_DIR` set per command in task 11.1 | **A** — this change |
| I4 | `LLM_MODEL_VERIFY=qwen2.5-coder` set for `cache:build`, `generatedWith.verifyModel` checked | **A** — this change |
| I6 | TSDoc of `golden-file.ts` names the current round (task 13.3) | **A** — this change |
| Apply 1 | *Agent's text.* The Ollama that was already running had the default context: the first `cache:build` stopped on `Q1` with `GOLDEN_NOT_CACHEABLE` (`invalid-model-output` three times, seeds untouched). As D11 says, the agent stopped the tray app and `ollama.exe` and served `qwen2.5-coder` with `OLLAMA_CONTEXT_LENGTH=16384`; the second run answered all six questions at the first attempt (acme-shop Q1 249 s, Q3 116 s, Q4 171 s; task-api Q1 188 s, Q2 55 s, Q3 60 s). Ollama was stopped afterwards, so the author's tray app is not running | **A** — this change (D11) |
| Apply 2 | *Agent's text.* Baseline of task 0.4 and result of the apply-prepare step: analyzer fingerprint `sha256:a0262b…` before, `sha256:46a570…` after, equal in `seeds/graph-dump.sql` and both golden files; the seed diff touches only the header; `verify` `3/3` for both projects; the five DIS-33 round files keep their SHA-256 | **A** — this change (recorded in the step 10 report) |
| Apply 3 | *Agent's text.* Panel result: no final verdict is `incorrect`; task-api Q3 and acme-shop Q3 are `partial` (one unverifiable statement each), the other five items `correct`. The panelists disagreed only on acme-shop Q3 (resolver: `partial`); agreement 85.7 %, kappa 0.588 (indicative). All six golden answers are signed with `agent:claude-opus-5-5` and `agent:claude-sonnet-5-5`, 2026-10-28. No pending item, so no `## Pending` section and no successor issue | **A** — this change |
| Apply 4 | *Agent's text.* acme-shop Q1 and Q4 are now `correct`, so DIS-108 and DIS-109 are resolved by this change. The auto mode classifier denied the agent's Spanish comments on those two tickets (external write outside DIS-107), so the agent did not work around it: the author comments, confirms and closes DIS-108 and DIS-109, citing `docs/golden-review/2026-10-golden-review-dis-107.md`. The DIS-107 comment records this | **C** — author (confirm and close DIS-108 and DIS-109) |
