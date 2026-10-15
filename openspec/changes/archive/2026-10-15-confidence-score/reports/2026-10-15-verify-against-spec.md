# Verify Against Spec Report

- Date: 2026-10-15
- Change: confidence-score (DIS-72), PR #43, branch `feature/DIS-72-confidence-score`
- Scope: the three delta specs (`confidence-score`, `explain`, `claims-and-typing`) against the code.
- Run by: the `/verify-against-spec` skill in a read-only fork; this file was saved by the main session
  from the fork's result, unchanged in substance. "Green" means passed in the PR's CI run
  [38790861935](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38790861935) (all five
  checks passed; 1295 passed, 1 skipped in a file this change does not touch). The fork fixed nothing.

Verdict: the code does what the specs ask; all 63 scenarios have a test with the same name, none is
missing. Block 3 is not empty: four unspecified behaviours need a keep-or-remove decision.

## 1. Requirements implemented correctly

**confidence-score → "Confidence signals"**
- Code: `packages/core/src/knowledge/confidence.ts:92-130`. `source` and `config` count as code (:70,
  :76-78). A span is the triple file id + first line + last line (:81-83). A span is resolved only when
  all its citations have origin `anchor` or `exact`; any other origin is not resolved (:73, :109-110).
  `diversity` divides by 4 (:67). The input type carries only span metadata and the verdict (:7-20).
- Tests: `tests/unit/knowledge/confidence.spec.ts:45`, `:59`, `:77`.

**confidence-score → "Confidence value"**
- Code: `confidence.ts:143-154`: fixed sum order, no intercept, no rounding. Weights (`:54-61`) all
  positive; `EVIDENCE_SATURATION = 4` is an integer (`:64`).
- Tests: `confidence.spec.ts:95`, `:112`, `:129`, `:141`, `:150`, `:165`, `:182`.

**confidence-score → "Confidence needs evidence"**
- Code: `confidence.ts:93-96`, `RangeError` before counting.
- Test: `confidence.spec.ts:206` (weak, see block 2).

**confidence-score → "Published weights"**
- `docs/CONFIDENCE.md:40-50`: one table, 7 rows, each with a reason; `:8-38` Formula and Signals;
  `:74-83` Limits; `:70-72` fixed once, never re-tuned.
- Tests: `tests/unit/knowledge/confidence-doc.spec.ts:42`, `:59`.

**explain → "Precedence and UNKNOWN answers"**
- The confidence is computed only after the `broken-evidence` exit (`explain.ts:113`, then `:116`);
  `UnknownExplain` has no `confidence` field.
- Test: `tests/unit/explain/explain-verification.spec.ts:213`; the 13 earlier scenarios unchanged and
  green (table below).

**explain → "Answer with typed statements"**
- `toConfidenceStatement` (`claim-items.ts:58`) uses the spans that survive the output policy and their
  verdicts position by position (`verify/policy.ts:21-30`, `:42-57`), the sanitised spans
  (`explain.ts:97`). Each claim stores its own statement's confidence (`claim-items.ts:101`); the answer
  carries the one of all statements (`explain.ts:116`, `:189`; `explain-answer.ts:100`). Contradiction
  `false` at both call sites with a DIS-71 comment; status is never an input.
- Tests: `explain-verification.spec.ts:468`, `:497`; `tests/integration/explain/explain.spec.ts:166`;
  `tests/unit/explain/explain.spec.ts:555`.

**explain → "Persistence failure"**
- The unsaved answer carries the confidence (`explain.ts:128`, `:226`).
- Tests: `explain-verification.spec.ts:468`, `:552`.

**claims-and-typing → "Model output quarantine" (code fences)**
- Code: `statement-schema.ts:26` (pattern), `:84-86` (unwrap). Size check on the raw output before the
  unwrap (`:56`); the event uses the raw text (`:63`, `:71`). A second fence or text outside the fence
  leaves invalid JSON; a JSON string cannot hold a raw line break, so a body spanning two fences never
  parses.
- Tests: `statement-schema.spec.ts:231`, `:244`, `:256`, `:267`.

**Specific checks**
- New dependencies: none; `confidence.ts` imports only `./graph-file.js`.
- Authorisation: none required by the specs.
- Response fields: only `AnsweredExplain.confidence`, required; `ask` does not print it
  (`packages/cli/src/commands/ask.ts:109`, `:184-204`).

## 2. Requirements missing or partial

No requirement is missing from the code. Gaps in tests and process:

- V1. "A set without citations has no confidence" says the signals **or the confidence** throw; the test
  (`confidence.spec.ts:211-212`) only calls `confidenceSignals`.
- V2. "The confidence document states its limits": the test only checks the substrings `DIS-71`,
  `0.75`, `0.5` (`confidence-doc.spec.ts:69-71`); any sentence holding them would pass.
- V3. "The published weights are the code's weights": the `EVIDENCE_SATURATION` row weighs no signal;
  the test never checks that row's Signal column (`confidence-doc.spec.ts:51-55`).
- V4. Untested clause: "All spans here are the sanitised spans … a cut span ends at its kept last line."
  No confidence test uses a truncated span. Correct by inspection (`explain.ts:97`).
- V5. `tasks.md`: 5.2 is checked but its sub-tasks 5.2a–5.2e are not, though the edits are in the diff.

## 3. Unspecified behaviour

- U1. `\r\n` line breaks are accepted around the fence (`statement-schema.ts:26`, `\r?\n`): not in the
  spec or design C9, not tested.
- U2. `trim()` decides what surrounding whitespace is (`statement-schema.ts:85`): it also strips a BOM,
  a non-breaking space and Unicode line separators; the spec says "only whitespace".
- U3. New public exports: `toConfidenceStatement` (through `explain/index.ts:11`) and
  `ConfidenceSignals`, `ConfidenceCitation`, `ConfidenceStatement`, `ConfidenceOptions`,
  `ConfidenceVerdict` (`confidence.ts:4-48`): only the design asks for them.
- U4. `docs/CONFIDENCE.md` holds content the spec does not ask for: the model and the 8 development
  questions (`:52-67`, task 9.3), and a sixth limit, reproducibility only for the same verdicts
  (`:81-82`).
- Smaller: `CONFIDENCE_WEIGHTS` is frozen (`Object.freeze`, harmless); `ask-command.spec.ts:377` sets
  `confidence: 0.5` only to satisfy the type.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Signals of a set backed by code and test | `tests/unit/knowledge/confidence.spec.ts:45` | green |
| Config counts as code and an unresolved origin lowers resolution | `confidence.spec.ts:59` | green |
| A cited citation backs nothing | `confidence.spec.ts:77` | green |
| The value follows the formula with the published weights | `confidence.spec.ts:95` | green |
| The value is reproducible and independent of order | `confidence.spec.ts:112` | green |
| A citation left cited lowers the value | `confidence.spec.ts:129` | green |
| A contradiction lowers the value | `confidence.spec.ts:141` | green |
| Exact resolution beats heuristic resolution | `confidence.spec.ts:150` | green |
| Evidence saturates and never lowers the value | `confidence.spec.ts:165` | green |
| A set with no signal is worth one half | `confidence.spec.ts:182` | green |
| A set without citations has no confidence | `confidence.spec.ts:206` | green (weak, V1) |
| The published weights are the code's weights | `tests/unit/knowledge/confidence-doc.spec.ts:42` | green (weak, V3) |
| The confidence document states its limits | `confidence-doc.spec.ts:59` | green (weak, V2) |
| A question without anchor is unknown in both modes without building the pack | `tests/unit/explain/explain.spec.ts:166` | green |
| Evaluation mode answers llm-required without building the pack | `explain.spec.ts:189` | green |
| A pack where nothing fits is unknown over budget | `explain.spec.ts:213` | green |
| A discarded model output is unknown and carries its event | `explain.spec.ts:253` | green |
| An output without statements is unknown with no evidence | `explain.spec.ts:288` | green |
| A failing prior-claims read stops before the model | `explain.spec.ts:303` | green |
| An unknown project or an unindexed one fails without calling the model | `explain.spec.ts:234` | green |
| Model failures propagate without writing | `explain.spec.ts:319` | green |
| Every citation broken is unknown with broken evidence | `tests/unit/explain/explain-verification.spec.ts:135` | green |
| A verification read failure propagates without writing | `explain-verification.spec.ts:165` | green |
| No verification read without statements | `explain-verification.spec.ts:178` | green |
| The question is anchored once | `explain.spec.ts:370` | green |
| A verifier failure other than unavailable or budget propagates without writing | `explain-verification.spec.ts:196` | green |
| An unknown answer has no confidence | `explain-verification.spec.ts:213` | green |
| An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:135` | green |
| A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:166` | green |
| The evidence of a stored answer lists every citation in order | `explain.spec.ts:492` | green |
| An answer written after a re-index is stored stale | `explain.spec.ts:555` | green |
| Cited spans are verified in one read at the pack's commit | `explain-verification.spec.ts:233` | green |
| A broken citation is neither stored nor shown | `explain-verification.spec.ts:261` | green |
| The subject of a claim is the symbol of its first cited span | `explain.spec.ts:453` | green |
| Citations that support their statement are entailed and facts | `explain-verification.spec.ts:302` | green |
| A valid but irrelevant citation is cited and never a fact | `explain-verification.spec.ts:337` | green |
| A cached pair is not verified again by a second answer | `explain-verification.spec.ts:363` | green |
| An invalid verifier output degrades its pair to cited | `explain-verification.spec.ts:391` | green |
| An unavailable verifier degrades every uncached pair and the answer is stored | `explain-verification.spec.ts:414` | green |
| An answer carries the confidence of its statements | `explain-verification.spec.ts:468` | green |
| The confidence follows the verifier's verdicts | `explain-verification.spec.ts:497` | green |
| A failed write still answers, unsaved and without leaking | `explain.spec.ts:625` | green |
| A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:216` | green |
| An unsaved answer keeps only its verified citations | `explain-verification.spec.ts:524` | green |
| Other write errors propagate | `explain.spec.ts:653` | green |
| An unsaved answer carries its verification, usage and unverified events | `explain-verification.spec.ts:552` | green |
| A conforming output is accepted | `tests/unit/explain/statement-schema.spec.ts:58` | green |
| An extra field discards the whole output | `statement-schema.spec.ts:76` | green |
| An unknown evidence id discards the whole output | `statement-schema.spec.ts:92` | green |
| A statement without evidence discards the whole output | `statement-schema.spec.ts:104` | green |
| A repeated evidence id discards the whole output | `statement-schema.spec.ts:113` | green |
| Malformed JSON discards the output | `statement-schema.spec.ts:122` | green |
| The output size limit accepts its bound and rejects one byte more | `statement-schema.spec.ts:131` | green |
| The answer length limit accepts its bound and rejects one more | `statement-schema.spec.ts:148` | green |
| The statement count limit accepts its bound and rejects one more | `statement-schema.spec.ts:163` | green |
| The statement length limit accepts its bound and rejects one more | `statement-schema.spec.ts:178` | green |
| The citations limit accepts its bound and rejects one more | `statement-schema.spec.ts:193` | green |
| A NUL character discards the whole output | `statement-schema.spec.ts:210` | green |
| A conforming output inside a json fence is accepted | `statement-schema.spec.ts:231` | green |
| Text outside a fence discards the output | `statement-schema.spec.ts:244` | green |
| An unclosed fence or another info string discards the output | `statement-schema.spec.ts:256` | green |
| The event of a fenced output identifies the raw output | `statement-schema.spec.ts:267` | green |

## Addendum — resolution (2026-10-15)

Every finding has a destination in `design.md` → Follow-ups, approved by the author. A: fixed in this
change by TDD or spec update (details and bite checks in the step 8 report, review-fixes addendum). D:
accepted and documented (V4 not observable; U3 `toConfidenceStatement` stays the C5 mapping; A4 and A5
as Limits lines in the spec and `docs/CONFIDENCE.md`; A6 process evidence). No finding was left open
and none went to a new ticket. Rerun: 1298 tests, gates and mutation green.
