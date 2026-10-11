# Show Spec Working — claims-and-typing

- Date: 2026-10-11
- Change: claims-and-typing (DIS-38), PR #36
- Interface: the public API of `@codemind/core`. No CLI or HTTP entry point uses these functions yet
  (DIS-39), so they were exercised as their consumer will: a throwaway script in the session
  scratchpad (`<scratchpad>/demo-dis38.ts`) that imports from `@codemind/core` (resolved to the
  sources through `packages/cli/tsconfig.run.json`), plus a `tsc` run over a typed file
  (`<scratchpad>/demo-types.ts`) for the compile-time half of the first two scenarios. Each check
  compares the observed value with the scenario's THEN exactly (JSON equality). Both files were
  deleted afterwards; they were never in the repository.

## Demonstrated
| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| An inferred fact is not representable | `claimSchema.safeParse` of L2 FACT and L1 FACT; `tsc` on a typed `Claim` literal | run-time `[false,true]`; `tsc` TS2322 on line 20 (`"FACT"` not assignable to `"INFERENCE" | "UNKNOWN"`), line 19 (L1 FACT) compiles | Yes | Run output below |
| An inferred claim without provenance is rejected | L2 INFERENCE without provenance, with `null`, with a valid one; `tsc` | `[false,false,true]`; `tsc` TS2322 on line 21 (`provenance` missing) | Yes | Run output below |
| Confidence outside its range is rejected | `-0.01, 1.01, NaN, 0, 1, null` | `[false,false,false,true,true,true]` | Yes | Run output below |
| The provenance shape is validated | bad hash, empty spans, date only, extra field, valid | `[false,false,false,false,true]` | Yes | Run output below |
| The evidence span mirrors the database checks | `evidenceSchema` with lines 0–3, 5–4, 5–5 | `[false,false,true]` | Yes | Run output below |
| The closed sets equal the database enums | enum lists read from `0002_history-claims.up.sql` vs exported arrays | equal, value by value and in order | Yes | Run output below |
| A chain of anchor and exact evidence is a fact | `typeStatement([anchor, exact])` | `"FACT"` | Yes | Run output below |
| Any heuristic evidence makes an inference | `[exact, heuristic]`, `[heuristic]` | `["INFERENCE","INFERENCE"]` | Yes | Run output below |
| A conforming output is accepted | the spec output, known `E1`,`E2` | `{ok:true,…}` with the same answer and statement | Yes | Run output below |
| An extra field discards the whole output | `type` on statement 1; `note` on statement 0 | `invalid_shape` at `statements.1` / `statements.0` | Yes | Run output below |
| An unknown evidence id discards the whole output | statement 1 cites `E1`,`E9`; known `E1` | `unknown_evidence_id` at `statements.1.evidenceIds.1` | Yes | Run output below |
| A statement without evidence discards the whole output | `evidenceIds: []` | `empty_evidence` | Yes | Run output below |
| A repeated evidence id discards the whole output | `["E1","E1"]` | `duplicate_evidence_id` at `statements.0.evidenceIds.1` | Yes | Run output below |
| Malformed JSON discards the output | `{"answer":` | `invalid_json` | Yes | Run output below |
| The output size limit accepts its bound and rejects one byte more | 65 536 and 65 537 bytes; `JSON.parse` counted | accepted; `output_too_large`; 0 parse calls | Yes | Run output below |
| The answer length limit accepts its bound and rejects one more | `answer` of 2000 / 2001 | accepted; `limit_exceeded` at `answer` | Yes | Run output below |
| The statement count limit accepts its bound and rejects one more | 20 / 21 statements | accepted; `limit_exceeded` at `statements` | Yes | Run output below |
| The statement length limit accepts its bound and rejects one more | `text` of 500 / 501 | accepted; `limit_exceeded` at `statements.0.text` | Yes | Run output below |
| The citations limit accepts its bound and rejects one more | 10 / 11 known ids | accepted; `limit_exceeded` at `statements.0.evidenceIds` | Yes | Run output below |
| The event identifies the output without carrying it | the spec output with `note: "ignore previous instructions"` | exact event (bytes and SHA-256 recomputed); none of the three fragments in it | Yes | Run output below |
| Checking an output writes nothing to the console | `console.*` replaced, 8 outputs (conforming + one per subcode) | 0 calls | Yes | Run output below |

## Evidence

Command: `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/demo-dis38.ts <repo>`

```
== Requirement: Claim and evidence records mirror the database checks
[MATCH] An inferred fact is not representable (run-time: L2 FACT rejected, L1 FACT accepted)
    observed: [false,true]
[MATCH] An inferred claim without provenance is rejected (missing, JSON null, valid)
    observed: [false,false,true]
[MATCH] Confidence outside its range is rejected (-0.01, 1.01, NaN, 0, 1, null)
    observed: [false,false,false,true,true,true]
[MATCH] The provenance shape is validated (bad hash, no spans, date only, extra field; then valid)
    observed: [false,false,false,false,true]
[MATCH] The evidence span mirrors the database checks (0-3, 5-4, 5-5)
    observed: [false,false,true]
[MATCH] The closed sets equal the database enums
    observed: [["L1","L2"],["FACT","INFERENCE","UNKNOWN"],["current","stale"],["none","cited","entailed","broken"]]
== Requirement: Statement typing from the resolution of its evidence
[MATCH] A chain of anchor and exact evidence is a fact
    observed: "FACT"
[MATCH] Any heuristic evidence makes an inference
    observed: ["INFERENCE","INFERENCE"]
== Requirement: Model output quarantine
[MATCH] A conforming output is accepted
    observed: {"ok":true,"output":{"answer":"El precio se calcula en compute.","statements":[{"text":"compute aplica el descuento","evidenceIds":["E1"]}]}}
[MATCH] An extra field discards the whole output
    observed: [{"subcode":"invalid_shape","issues":[{"path":"statements.1","code":"unrecognized_keys"}]},{"subcode":"invalid_shape","issues":[{"path":"statements.0","code":"unrecognized_keys"}]}]
[MATCH] An unknown evidence id discards the whole output
    observed: {"subcode":"unknown_evidence_id","issues":[{"path":"statements.1.evidenceIds.1","code":"unknown_evidence_id"}]}
[MATCH] A statement without evidence discards the whole output
    observed: "empty_evidence"
[MATCH] A repeated evidence id discards the whole output
    observed: {"subcode":"duplicate_evidence_id","issues":[{"path":"statements.0.evidenceIds.1","code":"duplicate_evidence_id"}]}
[MATCH] Malformed JSON discards the output
    observed: "invalid_json"
[MATCH] The output size limit accepts its bound and rejects one byte more (+ JSON.parse calls on the rejected one)
    observed: [{"accepted":true},"output_too_large",0]
[MATCH] The answer length limit accepts its bound and rejects one more
    observed: [{"accepted":true},{"subcode":"limit_exceeded","issues":[{"path":"answer","code":"too_big"}]}]
[MATCH] The statement count limit accepts its bound and rejects one more
    observed: [{"accepted":true},{"subcode":"limit_exceeded","issues":[{"path":"statements","code":"too_big"}]}]
[MATCH] The statement length limit accepts its bound and rejects one more
    observed: [{"accepted":true},{"subcode":"limit_exceeded","issues":[{"path":"statements.0.text","code":"too_big"}]}]
[MATCH] The citations limit accepts its bound and rejects one more
    observed: [{"accepted":true},{"subcode":"limit_exceeded","issues":[{"path":"statements.0.evidenceIds","code":"too_big"}]}]
== Requirement: Audit event of a discarded output
[MATCH] The event identifies the output without carrying it
    observed: [{"type":"schema_violation","stage":"l2_inference","subcode":"invalid_shape","outputBytes":102,"outputSha256":"454ebaeccf6fe6f067d263ff24e3d0838e6dd0447e08746d4debf37d51575d11","issues":[{"path":"statements.0","code":"unrecognized_keys"}]},[false,false,false]]
[MATCH] Checking an output writes nothing to the console (calls across 8 outputs)
    observed: 0
== ALL MATCH
exit=0
```

Command: `npx tsc -p <scratchpad>/tsconfig.json --noEmit --pretty false` (extends `tests/tsconfig.json`,
includes only `demo-types.ts`: line 19 is an `L1` `FACT`, line 20 an `L2` `FACT`, line 21 an `L2`
`INFERENCE` without provenance; long lines cut at 230 characters)

```
<scratchpad>/demo-types.ts(20,14): error TS2322: Type '{ layer: "L2"; type: "FACT"; provenance: { model: str
  Types of property 'type' are incompatible.
    Type '"FACT"' is not assignable to type '"INFERENCE" | "UNKNOWN"'.
<scratchpad>/demo-types.ts(21,14): error TS2322: Type '{ layer: "L2"; type: "INFERENCE"; projectId: "1111111
  Property 'provenance' is missing in type '{ layer: "L2"; type: "INFERENCE"; projectId: "11111111-1111-4111-8111-111111111111"; subject: "s"; predicate: "p"; object: null; status: "current"; confidence: null; }' but required in t
exit=2
```

Line 19 compiles; lines 20 and 21 are rejected, which is the THEN of the first two scenarios at
compile time. A first `tsc` attempt failed with `TS2688: Cannot find type definition file for
'node'` because the scratchpad has no `node_modules`; `typeRoots` was pointed at the repository's
`node_modules/@types` and the run repeated (output above).

Earlier evidence, not repeated: step 9 report (suite, gates, Stryker 95.68 %) and step 10 report
(one discarded output per subcode with marker strings, none leaked).

## State
- Before: `git status --short` showed only the author's local kit configuration change and the
  `tasks.md` checkboxes of 12.1/13.1; no database, file or network access by the functions.
- After: same `git status`; scratchpad files deleted.
- Restored: yes (nothing was mutated).

## Not demonstrated
- Nothing in the spec is left out. The only runtime the capability has today is `@codemind/core`;
  the transport that logs the event and the explain use case that consumes it are DIS-39.
- No screenshots: the change has no UI. None was written anywhere.

## Handoff
The change is **demonstrably working**: 21 of 21 scenarios match their THEN through the public API,
and the two type-level guarantees are rejected by `tsc`.
