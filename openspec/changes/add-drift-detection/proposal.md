## Why

Legacy documentation lies quietly: `docs/pricing.md` of acme-shop still says tax is applied before
the discount and that orders over €50 ship for free, while the code applies the discount first and
reads a €75 threshold from `config/shop.php` (`fixtures/README.md`, "Planted drift (F6)", case A).
The parent story (DIS-48, CM-HU-20; functionality F6) asks CODEMIND to point at the statements of a
document that the code, the tests or the configuration contradict, with a verified citation on each
side, so a developer knows which part of a document is no longer true without rereading it line by
line. The date signal of DIS-94 (`stale`) only says that a document is older than the code it
describes, and only through `describes` edges, which `docs/pricing.md` does not have. This is
DIS-71 (CM-HU-20.1), the core half of CM-HU-20; the `drift` CLI command, the golden Q5 answer and the
`query_log` row are DIS-73. Its blockers DIS-39, DIS-70 and DIS-94 are done.

## What Changes

- **New use case `drift`** in the core: given an indexed project (and optionally one document path),
  it reads every stored file of kind `doc`, asks the model for the checkable claims of each document,
  confronts each claim with the code, test and configuration spans that bear on it, and returns the
  claims the model judges contradicted, each with the citation of the document and the citations of
  the code, all verified.
- **Claim extraction** per document: one `answer` call over the document's redacted, numbered,
  untrusted-wrapped lines; the output quarantined by a strict schema; claims whose lines are not in
  the document are dropped; bounded per document and per call.
- **Confrontation** per claim: the context pack of the claim's text without document spans, plus the
  configuration files whose content shares a term with the claim (so a value with no symbol, such as
  `free_shipping_threshold`, reaches the model); one `answer` call with a strict
  `contradicted | consistent | unrelated` verdict; only `contradicted` with known evidence counts.
- **Verification**: the document citation is checked syntactically; the code side goes through the
  syntactic check and the semantic (entailment) check of DIS-68 and DIS-70; broken code citations are
  dropped and a contradiction left with none is not reported. Every contradiction is an `INFERENCE`
  with a provenance (model, prompt hash, input spans, instant).
- **Honest unknowns and isolation of failures**: evaluation mode answers `UNKNOWN` `llm-required`
  without a model call; a project (or `docPath`) without documents answers `UNKNOWN` `no-docs`; an
  invalid model output skips that document or that claim with an event and the rest goes on.
- **Usage**: tokens, cost and latency of the `answer` and `verify` calls of the run, as `explain`
  reports them.
- **Docs**: `docs/project-context.md` (the `core/drift` module), `fixtures/README.md` (the Q5 row says
  what DIS-71 covers and what DIS-73 adds), `prompts.md`.

Out of scope (non-goals): the `drift` CLI command, the golden Q5 answer in evaluation mode and the
`query_log` row with `capability = 'drift'` (DIS-73); case B of `fixtures/README.md` (a rule
implemented and tested but undocumented); storing contradictions as claims and evidence (the report
is recomputed on every call); an HTTP endpoint or a web screen; proposing corrections to the
document; changing the date signal `stale` of DIS-94 or the `describes` rule of DIS-49; feeding the
contradictions into the confidence of `explain` answers.

## Capabilities

### New Capabilities

- `drift-detection`: the core `drift` use case: which documents it reads, the extraction of their
  claims, the confrontation of each claim with code, tests and configuration, the verification and
  typing of each contradiction, the report and its usage, the `UNKNOWN` answers and the handling of
  invalid model output and of failures.

### Modified Capabilities

None. The use case reuses the context pack (`context-engine`), the sanitisation and quarantine of
`explain`, and the checks of `evidence-verification` without changing their requirements; no port,
store read or database table changes.

## Impact

- **Code**: new `packages/core/src/drift/` (`doc-claims.ts`, `contradiction.ts`, `drift.ts`,
  `drift-report.ts`, `drift-request.ts`, `drift-prompts.ts`, `index.ts`), re-exported from
  `packages/core/src/index.ts`. One comment in `packages/core/src/explain/explain.ts` that says no
  component produces contrary evidence "until DIS-71" is reworded (design D14); no behaviour of
  `explain` changes.
- **Tests**: new `tests/unit/drift/`, `tests/integration/drift/acme-shop.spec.ts` and the double
  `tests/support/drift-doubles.ts`. No existing test is expected to change (tasks step 8 lists the
  ones that must stay green unchanged).
- **Contract**: a new export surface of `@codemind/core` (`drift`, its request, report and events);
  nothing existing changes. No HTTP route, no CLI command.
- **Database**: no migration, no write. Reads only: `readIndexState`, `getProject`, the reads of the
  context pack.
- **Cost**: at most `MAX_DRIFT_DOCS × (1 + MAX_DOC_CLAIMS)` `answer` calls per run plus the `verify`
  calls of each reported contradiction; the daily ceiling (`withDailyBudget`) is applied by the
  composition root that wires the model, as for `explain` (DIS-73 for the CLI).
- **Privacy and security**: the document text and the spans are untrusted data (neutralised,
  wrapped, flagged); nothing logs the document text, the claims or the model output; secrets are
  redacted before any prompt, as in the context pack. No personal data is read.
- **Commands** (`docs/project-context.md`): tests with `npx vitest run`, `npm run lint`,
  `npm run typecheck`, `npx stryker run` (score ≥ 70).
