# Spec audit: `untrusted-content-sanitization` (DIS-41, parent DIS-29)

- Date: 2026-10-14
- Auditor: `spec-auditor` subagent (docs/base-standards.md §7.1)
- Round 1 verdict: **CHANGES REQUIRED** (0 Blocker, 2 Major, 15 Minor)

## Questions for the author

- **Q1 (M1).** A change to the omitted lines can move the cut. Shortening the first omitted line enough
  makes it fit, so the kept text, `endLine` and hash change. Should the rule be "a change in the
  omitted lines that leaves the kept lines the same keeps the prompt and hash"? The same wording is in
  DIS-41 AC3.
- **Q2.** The mark is literal: `[TRUNCATED: k lines omitted]`, so k = 1 prints "1 lines omitted".
  Keep it as is, or add a singular form? A test will pin it.
- **Q3.** D7 changes a fifth requirement, "Precedence and UNKNOWN answers", which the ticket does not
  list. The justification is sound. Please confirm it and record it in DIS-41.
- **Q4.** D8 puts the explain-level scenarios in a new `tests/unit/explain/explain-sanitization.spec.ts`.
  The ticket says to put them in `tests/unit/explain/explain.spec.ts`. Please confirm.

Inputs read: Linear DIS-41 (`[enhanced]` P1–P7, AC1–AC5, the comment from DIS-39), DIS-29 and its
comment; the change's `proposal.md`, `design.md`, `specs/explain/spec.md`, `tasks.md`;
`openspec/specs/explain/spec.md`, `openspec/specs/cli-ask/spec.md`, `docs/project-context.md`,
`docs/backend-standards.md` §8–9, `docs/openspec-tasks-mandatory-steps.md`, the ADR list; the code and
tests listed by the caller plus `packages/cli/src/logger.ts`, `vitest.stryker.config.ts`,
`.dependency-cruiser.cjs`, `tests/support/acme-shop-graph.ts`.

## 1. Scope against the ticket

Clean, with two deviations to record:

- **m1 — fifth modified requirement.** "Precedence and UNKNOWN answers" is modified although DIS-41
  lists four (`design.md` D7). Needed: without it, step 6 of the main spec and its UNKNOWN events would
  contradict the new requirement. Not invented scope; record it in DIS-41.
- **m2 — new test file.** `explain-sanitization.spec.ts` (D8) is a placement choice; `proposal.md` →
  Impact does not list it, while D8 and task 10.2 do.

Nothing else goes beyond DIS-41.

## 2. Inherited acceptance criteria

AC1–AC5 of DIS-41 and the sanitisation criterion of DIS-29 have scenarios, except the purity part of
AC5. DIS-29 names the event `untrusted-content-flagged`; the change uses `untrusted_content_flagged`
(resolved in DIS-41's reality map, snake_case like `schema_violation`).

- **M2 (Major, blocking).** AC5's "sanitize no lee ficheros, entorno ni reloj" has no scenario and no
  task; the SHALL is at `specs/explain/spec.md:37-38`. Fix: a scenario with spies on `Date`/`console`
  and a recording `process.env`, plus a dependency-cruiser rule forbidding I/O imports in
  `sanitize.ts` (mirroring `analyzers-no-io`), and a task for both.
- **m3.** AC2 says the events *are* the two events in order; spec line 64 says "start with". Use "are
  exactly, in this order".

## 3. Missing scenarios

- M2 above.
- **m4.** The system message SHALL state that `flags`/`questionFlags` mark instruction-like text; no
  THEN checks it.
- **m5.** Neutralisation of the question is a SHALL; every neutralisation scenario uses a span.

## 4. Ambiguity

- **m6.** "0 to 40 characters" should say "Unicode code points, within the line".
- **m7.** Truncation: does the trailing `\r` count toward the limit before removal? D2 measures before;
  the spec wording can be read either way. Same for "the first line alone".

## 5. Open decisions

Q2 (k = 1 wording) and m7. Nothing else is left to the implementer.

## 6. Contradictions inside the change

- **M1 (Major, blocking).** "A change only in the lines a cut omits SHALL leave the prompt and its hash
  unchanged" (spec:267, D4) is false under the change's own truncation rule: shortening the first
  omitted line can make it fit, moving `keptEndLine`, the kept text, `k` and the hash. Fix: qualify the
  rule ("that leaves the kept lines unchanged") and pin the scenario's change to the last line of a span
  cut at least two lines before its end. DIS-41 AC3 needs the same note.
- m2 above.

## 7. Contradictions with the project

D7 holds: "Persistence failure" stays true, its scenarios run on clean packs (acme-shop files ≤ 82
lines, no pattern match, sentinel matches nothing). `cli-ask`'s "stderr is empty" on acme-shop stays
true only because the fixtures are clean.

- **m8.** `proposal.md` Impact and task 7.1 should name `tests/unit/cli/ask-command.spec.ts` and
  `tests/integration/cli/ask-command.spec.ts` as re-checked.

No ADR conflicts; D9's "no ADR" is reasonable.

## 8. Contrast with the real code

Correct: the rewiring points in `explain.ts` (73–77, 85, 110), `storedAnswer`'s hard-coded
`events: []` (147) and `unsavedAnswer`'s event (177); `SanitizedSpan extends ContextSpan` fits every
consumer; no import cycle; `estimateTokens` counts code points; U+200B not escaped by `JSON.stringify`;
`scripted-llm.ts` keeps working; `explain.spec.ts:487-496` is the one assertion that breaks (task 7.2).

- **m9.** Duplications: `E{i+1}` in `sanitize.ts` and `prompt.ts`; the marker regex in `neutralise` and
  `delimiter-spoof`. Export one `evidenceIdAt(i)` and one marker pattern source from `sanitize.ts`.
- **m10.** Stale doc comments not in task 4.8: `explain-answer.ts:20` (`excerpt`), `explain-answer.ts:80`
  (`UnsavedExplain`), `claim-items.ts:22` (`packSpans`), `claim-items.ts:41`.

## 9. Task size

- **m11.** 3.2 changes `buildPrompt`'s signature, so `explain.ts` stops compiling unless it already calls
  `sanitizeForPrompt`; 3.3 asserts events wired only in 4.1. Fix: minimal wiring in 3.2; move 3.3 after
  4.1.

## 10. Mandatory steps

Present, labelled, ordered; restoration covered; step 13 last.

- **m12.** Manual testing needs an error case (e.g. a 1,001-code-point question: exit code, no
  sanitisation line).
- **m13.** Name the unchanged scenarios of the modified requirements as re-checked in 7.2.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Untrusted content sanitization | Untrusted text reaches the prompt wrapped and unchanged | 3.1–3.2 |
| | An instruction-like line is flagged and kept | 4.1 |
| | A span over the limit is cut at a line boundary | 4.2 (+2.3) |
| | A single line over the limit is cut in code points | 4.3 (+2.3) |
| | A pattern only in the omitted lines is not flagged | 4.4 (+2.4) |
| | A forged closing marker is neutralised and flagged | 3.3 (needs 4.1, m11) |
| | Each pattern matches its forms and not the excluded ones | 2.1–2.2 |
| | Sanitisation time grows linearly on adversarial text | 2.5 |
| | SHALL "no file system, environment or clock access" (AC5) | none (M2, blocking) |
| | SHALL neutralise the question | no scenario (m5) |
| Precedence and UNKNOWN answers | 9 unchanged scenarios | 7.4, 8.2 |
| Prompt and evidence ids | Each span of the pack gets one evidence id in rank order | 7.2 (m4) |
| | The prompt hash covers the whole prompt | 7.4/8.2 only (m13) |
| | A change only in the omitted lines keeps the prompt hash | 3.4 (M1) |
| Answer with typed statements | 5 unchanged scenarios | 7.4, 8.2 |
| Prior claims | Prior claims show their displayed type and stale warning | 7.4, 8.2 |
| | Prior claims are read over the kept lines of a cut span | 4.5 |
| Explain events and logging | Explaining writes nothing to the console | 7.2 |
| | Sanitisation events come first in every answer that reached the prompt | 4.6 |
| | No sanitisation event without a prompt | 4.7 |

## Regexes in D3, checked by hand

Every positive and negative of "Each pattern matches its forms and not the excluded ones" behaves as
the scenario says under flags `iu` (no `m`). No positive matches another code.

- **m14.** The 41-`x` negative does not pin the `{0,40}` bound (gap 42); a `{0,41}` mutant survives.
  Use 40 `x` (gap 41) as the negative and 39 `x` (gap 40) as a positive. Write `actúa` in NFC and list
  unaccented `actua` as an accepted false negative.

The forged-marker scenario's flags and the "exactly once" closing marker hold.

## Linear-time claims

D3's analysis is correct.

- **m15.** The cut runs first, so the n/4n check at 256 KiB vs 1 MiB measures the cut, not the matcher.
  Add an n/4n check below the cap (one-line spans of 2,000 and 8,000 code points, looped).

## Corrections proposed

See the auditor's list (spec, design, proposal, tasks, Linear comment on DIS-41, optional note on
DIS-29); applied as recorded in "Resolution" below.

## Resolution (round 1)

Author answers (2026-10-14):

- **Q1 / M1**: bound the rule, and fix the pack too: "con el mismo pack, un cambio en las líneas
  omitidas que deja iguales las líneas conservadas (mismo keptEndLine y texto) deja prompt y hash
  iguales". The scenario changes the last line of a span cut at least two lines before its end,
  replacing characters without changing the length, "porque context-pack.ts:244 estima tokens sobre
  el texto completo del span (antes del saneado) y un cambio de longitud puede alterar qué spans caben
  en el presupuesto".
- **Q2**: singular mark — `[TRUNCATED: 1 line omitted]` for k = 1, `[TRUNCATED: k lines omitted]` for
  k ≥ 2; design D2, the requirement and the tests (k = 1 and k = 2) updated.
- **Q3**: confirmed; "Precedence and UNKNOWN answers" stays `MODIFIED` (D7) with its scenarios
  unchanged; recorded in DIS-41.
- **Q4**: new file `tests/unit/explain/explain-sanitization.spec.ts`; the doubles defined inside
  `explain.spec.ts` are extracted to `tests/support/explain-doubles.ts`, not duplicated; listed in
  proposal → Impact and tasks; recorded in DIS-41.

| Finding | Resolution |
|---|---|
| M1 | Spec "Prompt and evidence ids": rule bounded to the same pack and the same kept lines; scenario "A change only in the omitted lines keeps the prompt hash" rewritten (span cut ≥ 2 lines before its end, last line changed in place with the same length and line count, same pack ranges). Design D4 explains the cut-moving case. Proposal records the author's decision. DIS-41 comment. |
| M2 | Spec: purity sentence widened (no file system, environment, clock or console; same result for same input) and new scenario "Sanitisation reads nothing but its input". Design D6b: dependency-cruiser rule `explain-sanitize-no-io`. Tasks 2.5 and 2.6. Proposal → Impact names `.dependency-cruiser.cjs`. |
| m1 | Q3 confirmed; D7 and DIS-41 comment. |
| m2 | Proposal → Impact lists `explain-sanitization.spec.ts` and `tests/support/explain-doubles.ts`. |
| m3 | Spec: "are exactly, in this order". |
| m4 | Spec "Each span of the pack gets one evidence id in rank order": THEN checks the `flags`/`questionFlags` sentence. |
| m5 | Spec forged-marker scenario: the question holds a forged closing marker, is neutralised, `questionFlags: ['delimiter-spoof']`. Task 4.2. |
| m6 | Spec: gaps in Unicode code points of the same line; D3 too. |
| m7 | Spec: every length counts `\r`; one trailing `\r` removed afterwards; D2 states it; task 2.3 tests a line of `MAX` + `\r`. |
| m8 | Proposal → Impact and task 7.1 name the two `ask-command` specs. |
| m9 | Design D3/D4/D6: `evidenceIdAt` and `MARKER_SEQUENCE_SOURCE` exported by `sanitize.ts` and used by `prompt.ts`; the "both agree" test dropped. Task 2.2, 3.3. |
| m10 | Task 4.9 lists `explain-answer.ts` (`AnswerEvidence.excerpt`, `UnsavedExplain`) and `claim-items.ts` (`packSpans`, excerpt sentence). |
| m11 | Task 3.3 adds the minimal wiring so `explain.ts` compiles; the forged-marker test moved after 4.1 (now 4.2). |
| m12 | Task 9.4: a 1,001-code-point question → `INVALID_EXPLAIN_REQUEST`, exit 2, no sanitisation line. |
| m13 | Task 7.2 names the unchanged scenarios re-run. |
| m14 | Spec: 39 `x` (gap 40) positive, 40 `x` (gap 41) negative; D3: NFC `actúa`, `actua` false negative, visual imitations accepted. |
| m15 | Spec linear scenario and task 2.7: n/4n check below the cap (2,000 vs 8,000 code points, looped). |

Round 2: the `spec-auditor` is re-run over the corrected change; its verdict is appended below.

## Round 2 (2026-10-14)

Verdict: **APPROVED** — 0 Blocker, 0 Major, 8 Minor. Every round-1 finding was checked as resolved
against the artifacts; the 39/40 `x` boundary and the forged-marker scenario with the forged question
were re-checked by hand; the real-code claims (`explain.spec.ts` helpers at lines 44–141,
`context-pack.ts:244`, `analyzers-no-io` in `.dependency-cruiser.cjs`) hold. No empty row in the
traceability table. No question for the author.

| Finding | Problem | Resolution |
|---|---|---|
| n1 | The minimal wiring of task 3.3 breaks `explain.spec.ts` "Each span of the pack gets one evidence id in rank order", only updated in 7.2, so the suite stays red until then | That update moved into 3.3; 7.2 keeps the console test and the re-runs and lists the 3.3 edit in the report |
| n2 | Forged-marker scenario: with the question also flagged there are two `delimiter-spoof` events | THEN reworded: after the question's `delimiter-spoof` event, one event of `E1` per code, in order |
| n3 | "With the same pack" contradicts a change to the span's text | Spec: "With a pack of the same spans and ranges"; proposal adds the gloss outside the quoted author text |
| n4 | D6b's "mirroring `analyzers-no-io`" was inaccurate (module list, `dependencyTypes`) | D6b gives the exact rule (the `analyzers-no-io` list plus `process`, `dependencyTypes: ['core']`) and notes that globals are guarded by the scenario |
| n5 | Proposal Impact and D5 listed fewer doc comments than task 4.9 | Both now name `AnswerEvidence.excerpt`, `UnsavedExplain` and `claim-items.ts` |
| n6 | Formatting slip in the pattern scenario | "and" added, line re-wrapped |
| n7 | Task 2.5 labelled RED → GREEN although it cannot fail | Relabelled a characterisation test, seen to fail once with a temporary `Date.now()` call |
| n8 | Timed and scaling checks in one file, unlike the template | Split into `sanitize.linear.spec.ts` and `sanitize.scaling.spec.ts`, both excluded from Stryker; D8, task 2.7, proposal Impact, task 10.2 ("four new spec files") updated |

Final status: **APPROVED**, all round-2 Minors applied. The change is ready for `/opsx:apply`.
