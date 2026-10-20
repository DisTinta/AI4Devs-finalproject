# Adversarial review — real-model-clean-clone (DIS-103)

- Date: 2026-10-20 (task 12.5)
- Branch: `feature/DIS-103-real-model-clean-clone`, HEAD `48d3578`, diff against
  `origin/feature/entrega-2-CRN`.
- Run in the agent's own context (the implementing session's blind spots apply; mitigated by reading
  every changed source and test line, the builder's cleanup path, the call sites of the client, and by
  the fresh clean-clone run of `2026-10-20-show-spec-working.md`).

## What was checked

1. **Spec and task alignment.** Every requirement of both deltas has scenarios; each non-recorded
   scenario has a test of the same name (`verify-against-spec` table). The spec files were last
   changed in `027f82e` (spec audit), before the first implementation commit `f16e02f`: no spec edit
   after the code. Tasks marked `[x]` were compared with the step 6, 7 and 8 reports.
2. **Hostile input.** `LLM_TIMEOUT_MS` at `3600000`, `3600001`, `300001` (tests and the real CLI);
   the default transport with a server that never answers, a refused port, a 302, a body cut mid-way,
   an `https` URL against a plain server (tests); a 310 s answer (recorded check, run twice today);
   `up` twice over an existing `.git`, `up` with Docker unreachable, Ctrl+C during the history step
   (code path read: `fixtures/build-history.mjs:108-171,190-199`).
3. **Blast radius.** `createLlm` callers: `packages/api/src/composition.ts:126`,
   `packages/cli/src/commands/ask.ts:92` (now `longFetch` by default), `packages/cli/src/cache-build.ts:308`
   (injects the same `longFetch`, identity kept by the re-export). Readers of `fixtures/acme-shop/.git`:
   the git source tree adapter (`packages/adapters/git/src/git-source-tree.ts:108,131`) and the
   suite (DIS-61 race, documented). No migration, no contract change. `@codemind/adapter-llm` resolves
   to `src/` through `tsconfig.run.json` paths in both the API and the CLI.
4. **Evidence quality.** Most important test: "Without an injected fetch the request does not use the
   global fetch". The mutation `options.fetch ?? longFetch` → `options.fetch ?? fetch` makes the spy
   record a call and return `undefined`, so the completion fails and `expect(fetchSpy).not.toHaveBeenCalled()`
   fails too. `MAX_TIMEOUT_MS` off by one in either direction fails "A malformed timeout…"
   (`3600001`) or "A timeout above 300 s is accepted" (`3600000`). Existing tests modified:
   `llm-config.spec.ts` (`300001` → `3600001`), `up.spec.ts` (five → six steps), `guides.spec.ts`
   (one more heading; a stale comment) — all three are requirement changes listed in design D10, not
   edits to make the suite pass.

## Adversarial review

### Findings

| Id | Severity | File:line | Finding | Why it matters |
|---|---|---|---|---|
| AR1 | Minor | `.env.example:36-37` | The comment still says `LLM_TIMEOUT_MS` is «entero de 1 a 300000» because Node's `fetch` cuts at 300 s (found by `git grep`; the agent's permission rules refused both reading the lines around it and the scripted edit of design D9). Same as V1. | `LLM_CONFIG_INVALID` says «see .env.example», and the guide recommends `1200000`: a reader who opens `.env.example` finds the opposite. Documentation only; the code, spec, readme and guide are right. |
| AR2 | Minor | `tasks.md` 4.2 | Task 4.2 (re-read the two Anthropic pages, dated) is `[x]`, but no report records the fetch; only the guide's «consultadas el 2026-10-20». | Evidence gap for a «no verificado» section whose facts must come from the official pages. |
| AR3 | Minor | `docs/DEMO.md` (Ollama, after the `demo:ask` output) | «Una pregunta nueva por la API … tarda lo mismo que por la CLI» while the same paragraph quotes 300,9 s against the CLI's 8 min 28 s. Same as V5. | Overstates what was measured (two runs of a CPU model differ by minutes). |
| AR4 | Minor | `docs/DEMO.md` (Claude limits) | «La capa no tiene embeddings» has no source, unlike the other limits. Same as V6. | The spec requires the limits to come from Anthropic's documentation. |
| AR5 | Minor | `tests/unit/scripts/defer-ctrl-c.spec.ts:21` | On Windows the test emits `SIGINT` to the listeners instead of delivering a real signal. Same as V2. | A real Ctrl+C on Windows is covered only by Node's documented behaviour. |
| AR6 | Question | `scripts/up.mjs:73-77` | `up` now needs `git` even in evaluation mode: from a source ZIP without Git, step 5 fails (`[up] "node fixtures/build-history.mjs acme-shop" failed with exit code 1`) where `up` used to reach `dev`. | A narrower start path. `git --version` is already a prerequisite of `Antes de empezar` and the readme's path starts with `git clone`. |
| AR7 | Question | `fixtures/build-history.mjs:115-171` | A Ctrl+C during the history step leaves a half-built `fixtures/acme-shop/.git` (tracked files restored). Started later with `npm run dev` instead of `up`, live answers fail until the next `up` or a manual build. | Only after an interrupted start and outside the documented path; the next `up` rebuilds it. |
| AR8 | Question | `docs/DEMO.md` (web paragraph) | Browsers other than Chromium may stop waiting before the model answers; only Chromium was measured past 300 s. | The guide already limits its claim to Chromium (design D6); nothing unverified is claimed. |
| AR9 | Question | `packages/adapters/llm/src/long-fetch.ts:50-53` | The body is buffered whole, with no size cap. | Same as before (`fetch` + `text()`); not a change in behaviour. |

### Verdict

**PASS WITH GAPS** — no Blockers and no Majors. Every finding has a destination in `design.md` →
Follow-ups.

### Recommended next steps before archiving

1. AR2: record the re-read of the Anthropic pages (done in `2026-10-20-verify-against-spec.md`, which
   quotes them as read today) — **A**.
2. AR3, AR4: fix the two sentences of `docs/DEMO.md` — **A**, then `npx vitest run tests/unit/docs`.
3. AR1: the agent cannot edit `.env.example` in this run; the exact two-line replacement goes to the
   author as **C** (one Spanish checklist comment on DIS-103, the same line in Follow-ups and in the PR
   body).
4. AR5–AR9: **D**, accepted with their reasons in Follow-ups.

## Appendix — security pass (security-reviewer checklist)

The diff changes how the model client sends requests that carry `LLM_API_KEY`, so the
`security-reviewer` checklist (`.claude/agents/security-reviewer.md`) was applied in this context:

| Severity | Check | Result |
|---|---|---|
| High | Secrets in plain text | None: `docs/DEMO.md` has no key (`guides.spec.ts` rejects `sk-…`); `.env` was never read or printed; the reports mask the OS user |
| High | New routes / authorisation / validation / queries / sensitive response data | Not touched: no route, query or response shape changes |
| Medium | Error messages leaking internals | Unchanged: every transport failure becomes `LlmUnavailable` with a closed reason and numbers only, no `cause` and no response body (`openai-compatible-llm.ts:46-53`); a non-2xx body is cancelled unread |
| Medium | Key forwarded to another host | No: `node:http` never follows redirects, and a 3xx is `http-status` after exactly one request (tested) |
| Medium | TLS | `https` base URLs go through `node:https` with Node's default certificate checks (tested against a plain server: the handshake fails) |
| Medium | New dependencies | None |
| Low | Logs with bodies | None added |

No finding.

## Addendum — fixes applied (2026-10-20)

- AR3, AR4 fixed in `docs/DEMO.md` (two sentences of `Probar con un modelo real`); AR2 closed by the
  verify-against-spec report. `npx vitest run tests/unit/docs` and the full suite re-run green (see the
  step 7 report addendum). The fixes are prose only, so the review was not re-run: they remove the two
  sentences the findings named and touch nothing else.
- AR1: recorded for the author (destination C), see `design.md` → Follow-ups.
