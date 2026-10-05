# Manual Interface Testing Report

- Date: 2026-10-05
- Change: security-gateway
- Step: 7. Backend: Manual Interface Testing

## Interface

The core API `redactSecrets` / `confinePath` (exported from `@codemind/core`). No HTTP route or CLI
command uses it yet (DIS-85, DIS-86).

## Pre-test state

- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`
- No database entity impacted (pure functions).

## Commands executed

A scratch script `demo.mts` in the session scratchpad (outside the repository), run with
`npx --prefix <repo> tsx demo.mts`. It imports `packages/core/src/index.ts` and
`tests/support/read-fixture-files.ts` directly.

## Success path — redaction over both fixtures (`.git`, `node_modules` skipped)

```
acme-shop: 53 files, 1 redacted
  events [{"type":"secret_redacted","file":"config/services.php","line":21,"column":44,"rule":"aws-access-key-id"}]
  line 21 ->         'key' => env('AWS_ACCESS_KEY_ID', '[REDACTED: possible secret]'),
task-api: 39 files, 1 redacted
  events [{"type":"secret_redacted","file":"src/config/env.ts","line":7,"column":34,"rule":"aws-access-key-id"}]
  line 7 -> const DEV_FALLBACK_JWT_SECRET = '[REDACTED: possible secret]';
```

Matches the oracle of `fixtures/README.md` §"Planted secret": one secret per fixture, no false
positive, and the events carry no part of the key.

Extra observation: reading `fixtures/task-api` **with** its local-only `node_modules/` gives
`6715 files, 13 redacted; rules: [ 'generic-high-entropy', 'jwt', 'aws-access-key-id' ]`. That
confirms why the oracle test skips `node_modules` (design D7): the folder holds real
secret-shaped test data and is absent in CI.

## Success path — confinement (temporary root under the OS temp dir)

```
"acme-shop" -> C:\Users\<user>\AppData\Local\Temp\repos-fhyZmb\acme-shop
"C:\\Users\\<user>\\AppData\\Local\\Temp\\repos-fhyZmb\\acme-shop" -> C:\Users\<user>\AppData\Local\Temp\repos-fhyZmb\acme-shop
```

## Error cases

```
"C:\\Users\\<user>\\AppData\\Local\\Temp\\etc" root "…\\repos-fhyZmb" -> ForbiddenPathError FORBIDDEN_PATH "Forbidden path: C:\\Users\\<user>\\AppData\\Local\\Temp\\etc"
"C:\\Users\\<user>\\AppData\\Local\\Temp\\repos-fhyZmb-evil\\x" root "…\\repos-fhyZmb" -> ForbiddenPathError FORBIDDEN_PATH "Forbidden path: …\\repos-fhyZmb-evil\\x"
"acme-shop" root "" -> IndexingDisabled INDEXING_DISABLED "indexing disabled (fixtures-only mode)"
"acme-shop" root undefined -> IndexingDisabled INDEXING_DISABLED "indexing disabled (fixtures-only mode)"
```

The OS user name was replaced by `<user>` in this report. The raw output shows it inside the
`ForbiddenPathError` message, which is the Low finding of the privacy check (task 4.1, handed to
DIS-86). No message and no event contains a redacted value.

## Mutating operations

None: both functions are pure. The temporary root was created with `mkdtempSync` and removed by the
script (`rmSync`).

## Post-test state

- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8` (unchanged)

## Outcome

- Status: PASS
- The scratch script stays in the session scratchpad, outside the repository (the repository hook
  blocks `rm`); nothing was added to the repository.
