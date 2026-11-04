# The unit suite checks the freshness of the golden drift report; the regeneration recipe adds `drift:build`

## Status
Accepted

## Context and problem
DIS-73 adds a versioned golden drift report, `seeds/drift/acme-shop.json`, which the `drift` command
serves in evaluation mode. Like the golden answers of `explain` (`seeds/cache/*.json`), it carries the
two fingerprints of the seed it was built on and a fingerprint of the code that produced it
(`driftFingerprint`, over ten files: the drift prompts, quarantine, claim extraction, confrontation and
report shapes, the stored report schema, the sanitiser and untrusted-text rules, the verification prompt
and policy).

The accepted ADR `20261017-stale-fingerprint-fails-verify` says that a stale fingerprint turns only the
`verify` job red: the unit and integration tests inject the fingerprints, so a stale one does not fail the
whole suite. But `npm run verify` only reads `seeds/cache/`, by the requirement "golden questions" of
`golden-answers`, and it does not read the golden drift report. Left alone, a change to a fingerprint
input would leave `seeds/drift/acme-shop.json` stale with every check green. Criterion 5(c) of DIS-73
asks for exactly that check: that the file's seed fingerprints are the ones of `seeds/graph-dump.sql` and
that its `driftFingerprint` is the one of the current code.

The spec audit of `add-cli-drift` (run 1, finding B1) pointed out that the design contradicted that
consequence of `20261017`, and asked the author to choose. This ADR is the agent's text: the autonomous
run (`docs/AUTONOMOUS-RUN.md` §6) has no author to ask, so the agent decided as lead engineer.

## Options considered
* **(a) A unit coherence test checks the freshness** of the golden drift report
  (`tests/unit/seed/drift-golden-coherence.spec.ts`): it fails when the seed fingerprints or the drift
  fingerprint are not the current ones.
* **(b) The unit test does not check the fingerprints**, as the coherence test of the `explain` golden
  answers does, and nothing checks the freshness (or `verify` is extended to read `seeds/drift/`).
* **(c) Extend `npm run verify`** to compare the golden drift report: it needs a live model, which the
  `verify` job does not have for this file, and it changes the contract of `verify-smoke`.

## Decision
We choose **(a)** because:
* It is criterion 5(c) of the ticket; option (b) would drop an acceptance criterion, and option (c)
  would widen `verify`, whose contract this change does not touch.
* The golden drift report has no other freshness check: `verify` does not read it and `db:seed` does not
  check fingerprints, so the unit suite is the only place where a stale one can be seen.
* The failure message names the command that fixes it, `npm run drift:build`.

The regeneration recipe becomes `seed:build`, then `cache:build`, then `drift:build`: a `seed:build`, or a
change to `explain/sanitize.ts`, `explain/untrusted-text.ts`, `verify/verify-prompt.ts`,
`verify/policy.ts` or any of the other fingerprint inputs of the drift report, needs `npm run
drift:build` in the same change.

## Consequences
* This amends one consequence of `20261017-stale-fingerprint-fails-verify`: for the golden drift report,
  the unit suite also goes red (`tests/unit/seed/drift-golden-coherence.spec.ts`), not only `verify`.
  Its decision for the golden answers of `explain` stands.
* A pull request that touches an input of `driftFingerprint` (ten files, three of them shared with the
  golden answers) or regenerates the seed turns the unit suite red until its author runs `npm run
  drift:build` and commits the regenerated file. The build needs a live model and takes tens of minutes
  on CPU with Ollama.
* The regenerated entry comes back with empty `reviews`; the golden drift report is unreviewed (design
  D10 of the change).
* Reverting it means dropping the two fingerprint assertions of the coherence test; the cost of the
  policy is paid by every later change to a shared input.
