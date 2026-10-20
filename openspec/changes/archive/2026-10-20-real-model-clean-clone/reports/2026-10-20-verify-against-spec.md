# Verify Against Spec — real-model-clean-clone (DIS-103)

- Date: 2026-10-20 (task 12.4)
- Branch: `feature/DIS-103-real-model-clean-clone`, HEAD `48d3578`, compared with
  `origin/feature/entrega-2-CRN` (21 files outside the change folder, no dependency added).
- Specs: `specs/llm-adapter/spec.md` (1 MODIFIED, 1 ADDED requirement) and
  `specs/local-startup/spec.md` (2 MODIFIED requirements).
- Run in the agent's own context (read-only audit of code, tests and docs, plus the two official
  Anthropic pages re-read today: `https://platform.claude.com/docs/en/api/openai-sdk`, which now
  redirects to `…/cli-sdks-libraries/libraries/openai-sdk`, and
  `https://platform.claude.com/docs/en/about-claude/models/overview`; and
  `https://platform.claude.com/docs/en/build-with-claude/embeddings`).

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| LLM configuration … validated when read (range 1–3600000) | `packages/adapters/llm/src/config.ts:118` (`MAX_TIMEOUT_MS = 3_600_000`, comment rewritten) | `tests/unit/llm/llm-config.spec.ts:81` (`3600001` rejected), `:119` ("A timeout above 300 s is accepted") |
| The client waits as long as the configured timeout | `packages/adapters/llm/src/openai-compatible-llm.ts:29` (`options.fetch ?? longFetch`); `packages/adapters/llm/src/long-fetch.ts` (moved byte for byte, TSDoc updated); `packages/adapters/llm/src/index.ts:15`; `packages/cli/src/cache/long-fetch.ts` (re-export) | `tests/unit/llm/default-transport.spec.ts` (both scenarios + mid-body cut + TLS); recorded check "A response after 300 s is accepted" (step 6.4 and again in `2026-10-20-show-spec-working.md` §4: 310.1 s) |
| The API and the CLI build the client without a `fetch` | `packages/api/src/composition.ts:126`, `packages/cli/src/commands/ask.ts:92` (unchanged: both get `longFetch` by default) | step 6.3b (CLI 508 s, API 300.9 s), 6.4b (API and web past 300 s) |
| `cache:build` keeps the same function | `packages/cli/src/cache-build.ts:27,308` | `tests/unit/cli/cache-build.spec.ts`, `tests/unit/cli/long-fetch.spec.ts` (untouched, green) |
| One command starts the system (six steps, preload, history step) | `scripts/up.mjs:70-77`, `scripts/defer-ctrl-c.mjs` | `tests/unit/scripts/up.spec.ts` ("Up runs the start sequence in order", "Ctrl+C stops up without a failure line"), `tests/unit/scripts/defer-ctrl-c.spec.ts`, `tests/unit/scripts/wiring.spec.ts` |
| History matches the seed; fingerprints and evaluation unchanged | `fixtures/build-history.mjs` not edited (`git diff` empty) | recorded checks: steps 6.2 and the new clone of `show-spec-working` §2 (`HEAD 4f028db…`, clean tree, `verify` 3/3, hashes equal) |
| The demo guide runs the same in PowerShell and Bash (new section, order, pair) | `docs/DEMO.md` → `Probar con un modelo real` | `tests/unit/docs/guides.spec.ts` (ordered headings, "The real-model section says how to try each model", no Bash-only command); step 8.2 (both shells) |
| Claude facts from Anthropic's documentation | `docs/DEMO.md` → Claude subsection | re-read today: base URL `https://api.anthropic.com/v1/`; "primarily intended to test and compare model capabilities, and is not considered a long-term or production-ready solution"; `anthropic-workspace-id` for multi-workspace keys; `response_format` "Ignored"; `temperature`/`top_p` 400 on 4.7+; system messages hoisted; `usage.prompt_tokens`/`completion_tokens` "Fully supported"; `authorization` "Fully supported"; ids `claude-sonnet-5-5`, `claude-haiku-5-5` listed; "Anthropic does not offer its own embedding model" |
| Mutation scope keeps `long-fetch.ts` | `stryker.config.json`, `.github/workflows/ci.yml` business filter, `vitest.stryker.config.ts` header | step 7 report (Stryker run on the file) |
| Docs: readme «cuatro comandos», range row, link to the guide; DEPLOYMENT row; fixtures/README; project-context | `readme.md:147,170,296,420`, `docs/DEPLOYMENT.md`, `fixtures/README.md`, `docs/project-context.md:660-663,929,1153-1156` | `tests/unit/docs` green; `git grep` of `300000`/`tres comandos` (below) |

## 2. Requirements missing or partial

- **V1 (Minor) — `.env.example` still states the old cap.** A repository-wide search
  (`git grep -n -E "300000|300 s"`) returns `.env.example:36-37`: «entero de 1 a 300000: por encima, el
  fetch de Node corta la petición por su cuenta a los 300 s». The spec now says «no greater than
  3600000», and `LLM_CONFIG_INVALID`'s message says «see .env.example». Design D9 planned a scripted,
  line-anchored edit if allowed; both the read of the context lines and the scripted `sed` edit were
  refused by the agent's permission rules on `.env*` files in this run, so the agent cannot fix it.
  The fix is two comment lines (no value changes).
- **V2 (Minor) — the Windows half of "The history step finishes its work before ending on Ctrl+C"
  is weaker than the scenario.** On win32 the test emits `SIGINT` to the listeners
  (`defer-ctrl-c.spec.ts:21`) instead of delivering a signal; a real signal runs only on POSIX (CI).
  Known and stated in design D3 / DR4.

No requirement is absent.

## 3. Unspecified behaviour

- **V3 (Question) — `longFetch` is part of `@codemind/adapter-llm`'s public exports**
  (`packages/adapters/llm/src/index.ts:15`). Not named by the spec; required by design D4 so that
  `packages/cli/src/cache/long-fetch.ts` re-exports the same function (the identity check of
  `cache-build.spec.ts`). Wanted, recorded in design.
- **V4 (Question) — a plain test "speaks TLS to an https base URL"** (`default-transport.spec.ts`)
  pins that an `https` base URL goes through `node:https`. The spec says «Node's `http`/`https`
  modules»; the test makes that half observable. Wanted.
- **V5 (Minor) — a claim in the guide that the measurements do not support.** `docs/DEMO.md` says a
  new question through the API «tarda lo mismo que por la CLI», then quotes 300,9 s for the API against
  8 min 28 s for the CLI (two different runs of a CPU model). The spec asks the guide to paste what was
  measured; «lo mismo» overstates it.
- **V6 (Minor) — the embeddings limit has no source link.** The spec lists «it has no embeddings»
  among the limits «from Anthropic's documentation»; the guide states it without the page that says so
  (`https://platform.claude.com/docs/en/build-with-claude/embeddings`: «Anthropic does not offer its
  own embedding model»).
- **V7 (Question) — the OpenAI SDK page moved.** `https://platform.claude.com/docs/en/api/openai-sdk`
  now redirects to `https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk`. The
  link the spec pins still works.

Specific checks:

- Dependency imported but not in a manifest: none (`node:` modules; `@codemind/adapter-llm` is
  already a dependency of `packages/cli` and `packages/api`).
- Authorisation check required and missing: none in scope.
- Response field the spec does not mention: none (no contract change).
- Scenario whose test is weaker than the scenario: V2 (documented scope). Every other automated
  scenario asserts what it states (headers, body, exactly one request, no `fetch` spy call, six calls
  with exact arguments, the line order, the strings of the guide).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| No URL and no key selects evaluation mode | `tests/unit/llm/llm-config.spec.ts` | green |
| A URL without a key selects live mode | `tests/unit/llm/llm-config.spec.ts` | green |
| A key without a URL fails without showing the key | `tests/unit/llm/llm-config.spec.ts` | green |
| A URL without a model fails | `tests/unit/llm/llm-config.spec.ts` | green |
| A malformed timeout or URL fails naming the variable | `tests/unit/llm/llm-config.spec.ts` | green |
| A valid timeout overrides the default | `tests/unit/llm/llm-config.spec.ts` | green |
| A timeout above 300 s is accepted | `tests/unit/llm/llm-config.spec.ts` | green |
| The daily budget is read in live mode only | `tests/unit/llm/llm-config.spec.ts` | green |
| A malformed daily budget fails naming the variable | `tests/unit/llm/llm-config.spec.ts` | green |
| With a ceiling every configured model needs a price | `tests/unit/llm/llm-config.spec.ts` | green |
| Without a ceiling a model needs no price | `tests/unit/llm/llm-config.spec.ts` | green |
| Without an injected fetch the request does not use the global fetch | `tests/unit/llm/default-transport.spec.ts` | green |
| Without an injected fetch timeouts, refusals and redirects keep their mapping | `tests/unit/llm/default-transport.spec.ts` | green |
| A response after 300 s is accepted | recorded check (step 6.4; `show-spec-working` §4) | passed (310.1 s) |
| Up runs the start sequence in order | `tests/unit/scripts/up.spec.ts` | green |
| Up ignores an npm_execpath of .env | `tests/unit/scripts/up.spec.ts` | green |
| Up stops at the first failing step | `tests/unit/scripts/up.spec.ts` | green |
| Ctrl+C stops up without a failure line | `tests/unit/scripts/up.spec.ts` | green |
| The history step finishes its work before ending on Ctrl+C | `tests/unit/scripts/defer-ctrl-c.spec.ts` | green (real signal on POSIX only, V2) |
| A step that cannot start stops up | `tests/unit/scripts/up.spec.ts` | green |
| Up needs npm to start it | `tests/unit/scripts/up.spec.ts` | green |
| The startup scripts need no installed dependency | `tests/unit/scripts/wiring.spec.ts` | green |
| Up with Docker unavailable fails naming its first step | recorded check (step 8.1 both shells; `show-spec-working` §5) | passed |
| Up builds the fixture history the seed indexed | recorded check (step 6.2; `show-spec-working` §2) | passed |
| The demo guide has no Bash-only command | `tests/unit/docs/guides.spec.ts` | green |
| The demo guide is ordered for a first-time reader | `tests/unit/docs/guides.spec.ts` | green |
| The web walkthrough names what each screen shows | `tests/unit/docs/guides.spec.ts` (+ review half not re-run: section unchanged) | green |
| The guide was followed on a clean clone in both shells | recorded check (step 8.2) | passed |
| The real-model section says how to try each model | `tests/unit/docs/guides.spec.ts` | green |
| The Ollama path was followed on a clean clone | recorded check (step 6.3a–6.3b) | passed |

Targeted run: `npx vitest run tests/unit/llm tests/unit/scripts tests/unit/docs tests/unit/cli/long-fetch.spec.ts tests/unit/cli/cache-build.spec.ts` → 16 files, 148 tests passed.

## Verdict

Conforms, with no Blocker or Major. Findings V1–V7 get their destinations in `design.md` →
Follow-ups (V5 and V6 are fixed in this change; see the addendum below once applied).

## Addendum — after the fixes (2026-10-20)

V5 and V6 fixed in `docs/DEMO.md` (prose only); `tests/unit/docs` green. V1 stays open for the
author (destination C: the agent cannot edit `.env*` files in this run). Destinations of V1–V7 in
`design.md` → Follow-ups.
