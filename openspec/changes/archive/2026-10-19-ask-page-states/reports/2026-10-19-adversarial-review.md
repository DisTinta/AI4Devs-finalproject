# Adversarial Review — ask-page-states (DIS-66)

- Date: 2026-10-19
- Task: 15.4 (pre-merge review, autonomous run of Entrega 2, ADR `20261016-autonomous-workflow-run-entrega-2`)
- Run by the agent in its own context, after `/show-spec-working` and `/verify-against-spec` (branch at
  `49f96f4`). Read: `proposal.md`, `design.md`, `tasks.md`, the delta spec, the step 11, step 12 and
  spec-audit reports, and `git diff origin/feature/entrega-2-CRN...HEAD -- packages tests docs`. Hostile
  input was tried by reading the code paths below and, for layout, in headless Chromium against the Vite
  dev server with `POST …/ask` answered by `page.route` (scratchpad script `adv66-narrow.mjs`, not
  committed).

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/web/src/components/UsagePanel.tsx:43-53` (before the fix) | At 320 px the four figures of the usage strip wrapped one by one, so a line could end in a lone « · » («Confianza 0.78 · 0 tokens · $0 ·», then «36 ms»): each separator was its own flex item. Seen in the step 12 and `/show-spec-working` screenshots (`2026-10-19-ssw-narrow-320.png`) | A dangling separator reads as a cut-off figure on the narrowest supported width; the spec only asks that nothing is clipped, so the manual check passed it |
| Minor | `packages/web/src/components/usage-display.ts:95-98`, spec tables | (Shared with `/verify-against-spec` V1.) The badge decides on the rounded savings (D33) while the spec said «greater than 0»; nothing pinned a value in (−0.05, 0.05) | Spec and code disagreed; a regression to the raw comparison would show «ahorro 0 % vs bruto» and pass the suite |
| Minor | `packages/web/src/components/AskErrorNotice.tsx:25` | (Shared with `/verify-against-spec` V2.) No test pinned that the ⚠ of the alert is hidden from assistive technology | Dropping `aria-hidden` would make every alert start with «⚠» / «warning sign» in a screen reader, and the suite would stay green |
| Question | `packages/web/src/pages/AskPage.test.tsx:939-947` | "A cache hit shows its usage panel" finds «$0» and «0 tokens» by `indexOf`, so «$0.000» or «10 tokens» would also match | Answered: the exact forms are pinned by the Node scenarios "Cost is written in dollars" (`0` → «$0») and "Tokens are counted with grouped digits" (`(0, 0)` → «0 tokens»); the layering is deliberate (D19). Destination D |
| Question | — | Is the `security-reviewer` agent needed? The diff adds no server input, rate limit, secret or stored personal data: the web client only reads and renders the API's `message`, `code` and `details` of a response, and no request or body changes | Answered: no. Rendering untrusted API text is pinned by "Texts of the API in a state are shown as text" and the fifth run of "An API error names its code"; `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(" packages/web/src` is empty; the step 11 privacy check found no `VITE_*` in `dist`. Destination D |

What else was attacked and held:

- **Boundaries of the figures:** latency 999 / 1000 ms (`usage-display.ts:74-76`; the API's `latencyMs`
  is an integer of at least 1, `packages/core/src/explain/usage.ts:33-35`); cost 0, 0.0004 and 0.0005
  («$0.001», `toFixed` rounds the binary value up); confidence 1 and 0; token counts of 1 and 1 234 567.
  `savingsPct` from the API is whole tenths with −0 mapped to 0 (`usage.ts:18-23`), so V1 was a spec gap,
  not a visible bug.
- **Wrong-meaning details:** `resetsAt` as a bare date, a word, month 13, 30 February, `T24:00`, an epoch
  number and absent → no line (`notice-display.ts:35-49`, Node tests); `retryAfterSeconds` 0, −1, 1.5,
  «42» and absent → «Espera un momento…»; a `429` that is not the API's error format → «La API de
  CODEMIND no responde.» (`api-client.ts:192-193` rejects it as an `ApiError`).
- **Hostile texts:** `message` «<img src=x onerror=alert(1)>», code «<i>X</i>», a `reason` that is not one
  of the six → rendered as text through template strings; a non-string `reason`/`message` from a
  malformed `200` is coerced to text, never markup; an answered body without `usage` reaches the route's
  `errorElement` (`router.tsx:28`), outside the API's contract (`packages/api/src/schemas/ask.ts:113`).
- **The same request twice:** two identical results in a row are announced again because every send
  passes through «Buscando evidencia…» in the same status element (test "The status region announces every
  outcome", same-element assertion); two identical failures remount the alert (pending in between); the
  same invalid text twice inserts a new alert node (D29; browser check in `/show-spec-working`).
- **Two live regions at once:** an invalid send while a failure alert is shown leaves two `alert`
  elements (the form's and the notice's); the spec allows it ("Question box" leaves the result area as it
  was) and the status region does not change.
- **Blast radius:** `groupDigits` is now exported from `project-display.ts` (Screen 1 unchanged,
  `project-display.test.ts` untouched and green); `QueryBox` gained a required prop and has one caller;
  `AskFallbackNotice.tsx` is deleted and `npm run lint:architecture` reports no orphan under `packages/web/src` (its three warnings are the
  untracked `packages/web/dist` bundle and `packages/analyzers/typescript`, outside this change); no data written by
  the web, no migration, no API change.
- **Existing tests modified:** only the D24 edits — the three provisional-notice tests deleted with their
  REMOVED requirement, the `status` assertions of two scenarios the delta MODIFIES, the two «0.71» /
  «Confianza» negatives the usage panel invalidates, and the two waits plus new states of the a11y scan.
  Each was seen failing first and is listed in the step 11 report; the `Accessibility of Screen 2` block
  only moved in the file (identical text).
- **Spec history:** the delta spec was last edited at `55d908f` (spec audit run 2, 11:24), before the
  first code commit `6f7cc4a` (11:32); the only later edit is this review's `/opsx:update` (D37), with its
  tests changed first and seen failing.
- **Evidence quality:** "An answer from the model shows its usage panel" kills the mutant that writes
  input + output tokens in the baseline line (it expects «→ 4 000», the spec's D2, not «→ 4 812»); "The
  status region announces every outcome" kills a status element rendered inside `ResultArea` (the
  same-element assertion, observed in task 7.1).

### Fixes in this change

1. **Dangling separator → A** (design D38). `UsagePanel` renders each separator with the figure after it
   in one `whitespace-nowrap` span, so a line breaks before a « · », never after it. jsdom has no layout:
   re-probed at 320 px in Chromium with a cache hit and a model answer — lines «Confianza 0.78 · 0 tokens
   · $0» / «· 36 ms» and «Confianza 0.78 · 4 812 tokens» / «· $0.014 · 2.1 s»; `scrollWidth` 320; region
   right edge 287; region text unchanged; every « · » still `aria-hidden`
   ([`2026-10-19-adv-narrow-320-hit.png`](./2026-10-19-adv-narrow-320-hit.png),
   [`2026-10-19-adv-narrow-320-model.png`](./2026-10-19-adv-narrow-320-model.png)). The whole suite is
   green after it, the region's scenarios unchanged.
2. **Savings threshold → A** and **hidden ⚠ → A**: see `2026-10-19-verify-against-spec.md` → Addendum
   (spec revised through `/opsx:update`, design D37, both tests seen failing on a local break first).

### Verdict

PASS — no Blockers and no Majors; the three Minors are fixed in this change and the two Questions are
answered and accepted (design → Follow-ups, destination D).

### Recommended next steps before archiving

1. Open the pull request (task 15.1) and confirm CI green (`quality`, `frontend` with `test:a11y`,
   `mutation`, `secrets`, `verify`).
2. `/opsx:archive` (task 15.7); merge only after the archive commit with CI green.
