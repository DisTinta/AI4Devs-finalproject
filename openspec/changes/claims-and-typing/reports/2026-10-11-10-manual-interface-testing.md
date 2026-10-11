# Manual Interface Testing Report

- Date: 2026-10-11
- Change: claims-and-typing
- Step: 10 — Backend: Manual Interface Testing (agent executed)

## Interface exercised
No CLI or HTTP entry point uses these functions yet (DIS-39). They were exercised as a consumer
would: a throwaway TypeScript script in the session scratchpad (`<scratchpad>/manual-dis38.ts`,
never committed, deleted afterwards) importing `parseModelOutput`, `typeStatement`, `claimSchema`
and the limit constants from `@codemind/core`, resolved to the sources through the CLI's run config.

## Commands executed
- `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/manual-dis38.ts` (exit 0)
- `rm <scratchpad>/manual-dis38.ts`; `git status --short`

## What the script did
- 10.2 success path: a conforming output with two statements and known ids `E1`, `E2`;
  `typeStatement` over `anchor`+`exact` and over `exact`+`heuristic`; a valid `L2` `INFERENCE` claim
  with provenance through `claimSchema`.
- 10.3 error paths: one discarded output per subcode. Each output carried a marker string
  (`SECRET-FRAGMENT-n`, and `ignore previous instructions` under an unexpected `note` key), and the
  script checked that the serialised event contains none of them. Then an `L2` `FACT` claim.

## Output (verbatim)

```
--- 10.2 success path
parse conforming: {"ok":true,"output":{"answer":"El precio se calcula en compute.","statements":[{"text":"compute aplica el descuento","evidenceIds":["E1"]},{"text":"el impuesto va después","evidenceIds":["E2"]}]}}
typeStatement anchor+exact: FACT
typeStatement exact+heuristic: INFERENCE
L2 INFERENCE with provenance: true
--- 10.3 error paths (one per subcode)
output_too_large: subcode=output_too_large match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"output_too_large","outputBytes":65656,"outputSha256":"f5de24dd1f93f881536633e33769bef8aed9e050480bdb1e2c355268db99979b","issues":[]}
invalid_json: subcode=invalid_json match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"invalid_json","outputBytes":29,"outputSha256":"952919e7f52e342d46731557b1f993d69f9600c356e6b7503444e5f1178c20a1","issues":[]}
invalid_shape: subcode=invalid_shape match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"invalid_shape","outputBytes":150,"outputSha256":"870d6f0ca78b823b87a1a61858a5d448b8411640cf16f73f370d7b564bd10217","issues":[{"path":"statements.0","code":"unrecognized_keys"}]}
limit_exceeded: subcode=limit_exceeded match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"limit_exceeded","outputBytes":2089,"outputSha256":"ce6b765ebde03730449e9758a549ec664afb42e790c607b27c84f702c34ddf68","issues":[{"path":"answer","code":"too_big"}]}
empty_evidence: subcode=empty_evidence match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"empty_evidence","outputBytes":106,"outputSha256":"ed98f56f25447a658252934cbeca595273c486b30911214ddfdb4f17f9b8ee2a","issues":[{"path":"statements.0.evidenceIds","code":"too_small"}]}
duplicate_evidence_id: subcode=duplicate_evidence_id match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"duplicate_evidence_id","outputBytes":115,"outputSha256":"246d80cbde6b1303f4204962447d733730e3a2a0348ffb28e45d6254bb5515ad","issues":[{"path":"statements.0.evidenceIds.1","code":"duplicate_evidence_id"}]}
unknown_evidence_id: subcode=unknown_evidence_id match=true leaks=false
  event: {"type":"schema_violation","stage":"l2_inference","subcode":"unknown_evidence_id","outputBytes":115,"outputSha256":"f7a466a3c51ecf966002696210591ed93197a4ab1f90f52300d9fd29d79ad4f3","issues":[{"path":"statements.0.evidenceIds.1","code":"unknown_evidence_id"}]}
L2 FACT rejected: true
```

## Result
- Success path: accepted output returned unchanged; `FACT` / `INFERENCE` as specified; valid `L2`
  inference accepted.
- Error paths: 7 of 7 subcodes as expected (`match=true`), no event leaked any fragment of its
  output (`leaks=false`), issues hold only `path` and `code`; `invalid_json` and `output_too_large`
  carry no issues; the `L2` `FACT` claim is rejected.
- Nothing mutating: no database, file or network access. State: `git status --short` shows only the
  author's local kit configuration change, as before the step.

## Outcome
- Status: PASS
- Blocking issues: none
