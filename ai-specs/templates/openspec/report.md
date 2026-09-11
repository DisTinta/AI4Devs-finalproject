# Test and State Verification Report

- Date: YYYY-MM-DD
- Change: <change-name>
- Step: <step number and title>

## Commands executed
- `<command 1>`
- `<command 2>`

## Test results
- Targeted tests: X passed, Y failed, Z skipped
- Required suite: X passed, Y failed, Z skipped
- Runtime: <duration>
- Notes: <flaky tests, retries, documented exceptions>

## Data state verification
- Pre-test baseline:
  - <indicator>: <value>
- Post-test validation:
  - <indicator>: <value>
- State restored: Yes/No
- Restoration actions: <actions or none>

## UI evidence (if applicable)
Screenshots and related files live in this same `reports/` folder. Link them with relative paths.
Do not leave captures at the repository root.

- `./YYYY-MM-DD-<scenario-slug>.png` — <what it shows>
- (none if the change has no browser UI)

## Outcome
- Status: PASS/FAIL
- Blocking issues: <none or list>
