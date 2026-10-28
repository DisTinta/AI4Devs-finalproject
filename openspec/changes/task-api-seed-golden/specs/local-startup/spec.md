## ADDED Requirements

### Requirement: Up also builds the task-api fixture history

`npm run up` SHALL run, right after the step `node fixtures/build-history.mjs acme-shop` and before
`npm run dev`, one more step with the same Node executable and the same `defer-ctrl-c` preload:
`--import ./scripts/defer-ctrl-c.mjs fixtures/build-history.mjs task-api`, printed as
`[up] node fixtures/build-history.mjs task-api`. The start sequence is therefore seven steps, and the
failure, SIGINT and exit-code rules of `up` apply to this step as to every other. Building the history
SHALL change neither the seed's fingerprints nor the answers of evaluation mode (the fixture's `.git` is
ignored by git and is not a fingerprint input).

#### Scenario: Up rebuilds the history of task-api after acme-shop's

- **GIVEN** a step runner double that records each call and returns exit code `0`, with the setting of
  "Up runs the start sequence in order"
- **WHEN** `up` runs
- **THEN** the runner received seven calls: the six of that scenario, with, between the acme-shop
  history call and `run dev`, the Node executable with the arguments `--import`,
  `./scripts/defer-ctrl-c.mjs`, `fixtures/build-history.mjs`, `task-api`
- **AND** stdout holds seven `[up] <command>` lines, the sixth being
  `[up] node fixtures/build-history.mjs task-api`, each printed before its step started, and `up` exits `0`
