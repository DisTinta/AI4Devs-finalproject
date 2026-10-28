# Show Spec Working — callsite-annotations

- Date: 2026-10-28
- Change: callsite-annotations (DIS-80), PR #78, head `90db49b`
- Step: 13.3, pre-merge review (agent's text, autonomous run, `review` step)

The interface is the CLI `node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]`
plus the committed data it produces. Everything ran in Git Bash on a partial copy of the repository in
the scratchpad (`<copy>` below: `docs/measurements/annotation/`, `fixtures/acme-shop/{app,routes,config,database,composer.json}`,
`fixtures/task-api/{src,package.json,tsconfig.json}` and an empty `fixtures/annotations/`), never on the
frozen files. The copy has no `openspec/` and no `docs/base-standards.md`, so it also exercises the rule
that `sourcesRead` is checked by path string.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Agreement CLI, success; "Agreement measures" | `agreement --root <copy>` with the copy's `agreement.json` deleted first | exit 0, `wrote docs/measurements/annotation/agreement.json`; its SHA-256 equals the committed file's (`0716be23…`) | yes | `hashes` output below |
| "Deterministic merge into the annotation files" | `merge --root <copy>` with an empty `fixtures/annotations/` | exit 0, both `*.callsites.json` written; SHA-256 equal to the committed files | yes | `hashes` output below |
| "The merge is deterministic" | `merge --root <copy>` a second time | exit 0; SHA-256 of both files unchanged (`4389d1b6…`, `8364de46…`) | yes | `sha256sum` below |
| "hashes prints the nine files in order" | `hashes --root <copy>` and `hashes` on the repository | exit 0; nine lines, same order and hashes in both, equal to the report's `## Hashes SHA-256` table | yes | below |
| "An unknown command is a usage error" | no command; `hashes --verbose`; `hashes --root` without a value | exit 2 and the usage line each time | yes | below |
| "A resolution with a source outside the resolver allowlist is rejected" (CLI) | copy's `resolution.json` declares `docs/measurements/annotation/agreement.json` in `sourcesRead`; `merge --root <copy>` | exit 1, message names the entry; annotation files unchanged (same SHA-256 before and after) | yes | below |
| "An incomplete panel output is rejected" (mismatched `panelist`) and "A rejected panel output writes no agreement file" | copy's `panelist-2.json` says `"panelist": 1`, `agreement.json` deleted; `agreement --root <copy>` | exit 1, message names the mismatch; no `agreement.json` written | yes | below |
| The 28 scenarios of the delta | `npx vitest run` of the three test files | 3 files, 28 tests passed | yes | below |

## Evidence

```
$ node scripts/annotation-agreement.mjs agreement --root <copy>
wrote docs/measurements/annotation/agreement.json
exit=0
$ node scripts/annotation-agreement.mjs merge --root <copy>
wrote fixtures/annotations/acme-shop.callsites.json
wrote fixtures/annotations/task-api.callsites.json
exit=0
$ node scripts/annotation-agreement.mjs hashes --root <copy>      (identical output on the repository)
9a9cff1d48865501f2a9262b98ccc1779aab3f6c93a7b7c5eaa0023d4b411718  docs/measurements/annotation/acme-shop.sites.json
75088de5d76d473270fa0cebf5bf042b927005882392a5c831fe494cf6fc34c1  docs/measurements/annotation/task-api.sites.json
18b65aecfe6f35d204478f5e1d8a03769c5056639904dac6a11b908738da58e2  docs/measurements/annotation/control.json
15d5bfc15f2691e281b24c148a818d515e9a417e4e918edcf80fce15293cddbf  docs/measurements/annotation/panelist-1.json
1b06822fe13d1d387f5fd2b79eeb0fbf55e84dbfbbd35c70a4f8e6ef92aa8062  docs/measurements/annotation/panelist-2.json
e5021f1497b67eb0214d160a880f20cc65dd7b2da3773a67b773ede742667ec6  docs/measurements/annotation/resolution.json
0716be23ebfd2403df063d83150b66fa9871279de53bc314c5b320438423ba6a  docs/measurements/annotation/agreement.json
4389d1b64b45103cebaf680577f2b64fb2c729ff295a510394eddf75761a416f  fixtures/annotations/acme-shop.callsites.json
8364de464383f767a35b0942ed6ae84ccbc9720172dd9281d22e702903a17814  fixtures/annotations/task-api.callsites.json
exit=0

$ node scripts/annotation-agreement.mjs
Usage: node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]
exit=2
$ node scripts/annotation-agreement.mjs hashes --verbose
Usage: node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]
exit=2
$ node scripts/annotation-agreement.mjs hashes --root
Usage: node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]
exit=2

$ node scripts/annotation-agreement.mjs merge --root <copy>     (resolution declares agreement.json)
annotation-agreement: docs/measurements/annotation/resolution.json: sourcesRead entry docs/measurements/annotation/agreement.json is outside the allowlist
exit=1
(sha256sum of both annotation files in the copy: 4389d1b6… / 8364de46… before and after)

$ node scripts/annotation-agreement.mjs agreement --root <copy>  (panelist-2.json says "panelist": 1)
annotation-agreement: docs/measurements/annotation/panelist-2.json: panelist is 1 but the file is panelist-2.json
exit=1
(listing of the copy's annotation directory afterwards: no agreement.json)

$ npx vitest run tests/unit/scripts/annotation-agreement.spec.ts tests/unit/docs/annotation-sites.spec.ts tests/unit/docs/annotation-freeze.spec.ts
 Test Files  3 passed (3)
      Tests  28 passed (28)
```

No screenshot: the change has no browser interface.

## State

- Before: `git status --short` of the working copy empty; the nine frozen files with the hashes above.
- After: `git status --short` empty; `hashes` on the repository unchanged.
- Restored: yes. Every mutation happened on the scratchpad copy, which lives outside the repository and
  holds only copies (it is not deleted because the repository policy blocks recursive deletion; design
  Follow-ups AF-4).

## Not demonstrated

- The panel itself (two annotator agents and the resolver) is not re-run: it is a one-off judgement
  frozen by hash; re-running it would produce a different, unfrozen reference. Its outputs are
  re-validated by `agreement` and `merge` above.

## Outcome

The change is demonstrably working: the CLI regenerates byte-identical `agreement.json` and annotation
files from the committed inputs, the hash table matches, and the error paths exit with the specified
codes without writing files. No screenshot was left at the repository root.
