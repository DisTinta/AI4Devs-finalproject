# Verify against spec — impact-risk-cli (DIS-90)

- Date: 2026-10-30
- Change: impact-risk-cli, PR #91, reviewed at `dc55062`
- Specs: `openspec/changes/impact-risk-cli/specs/impact/spec.md`, `openspec/changes/impact-risk-cli/specs/cli-impact/spec.md`
- Mode: inline (`ai-specs/skills/verify-against-spec/SKILL.md` → Inline mode), in the review step of the autonomous run

Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6). The agent that wrote this report did not
implement the change; it read the specs, the diff against `origin/final-project-CRN` and the tests, and
ran the tests (unit: 81 passed; integration on `codemind_test`: 10 passed).

## 1. Requirements implemented correctly

### impact

- **Anchoring the change (modified)** — `packages/core/src/impact/impact.ts:51-53` (`answer`: test anchors
  dropped, `unknown`/`no-anchor` before any traversal); `events` only through the row write
  (`impact.ts:44-45`). Tests: `tests/unit/impact/impact.spec.ts:34`, `:46`, `:61`, `:71`.
- **Report by component (modified)** — the answered variant gains `risk` and optional `events`
  (`packages/core/src/impact/impact-report.ts:55-64`); component rules unchanged from DIS-89
  (`relevance.ts`). Tests: `tests/unit/impact/impact.spec.ts:124`, `tests/unit/impact/components.spec.ts:211`,
  `:239`, `:258`.
- **Risk level of a report** — coverage: `packages/core/src/impact/reverse-walk.ts:90-139` (each direct
  component owns its anchor symbols, reached nodes, file and class), `reverse-walk.ts:174-184`
  (`directCoverage`, one inward `tested_by` read, skipped without test nodes); heuristic-only chain:
  `relevance.ts:35-39`, `:73`, `:92`, `:101` (`exactChain`); counting over the report's `direct`:
  `impact.ts:59-70` (matched by file path and name, `:61`); level and rationale: `packages/core/src/impact/risk.ts` `assessRisk`. Tests: the 8
  scenarios of `tests/unit/impact/risk.spec.ts:53-266`, plus the extra cases `:67` (one read),
  `:270`, `:286`, `:316`, `:336`, `:347`, `:356`.
- **Risk over the indexed acme-shop seed** — `tests/integration/impact/acme-shop.spec.ts:76`, green on
  `codemind_test`; reproduced by hand in the show-spec-working report (E1).
- **Query log of an impact call** — `packages/core/src/impact/query-log.ts` (`impactQueryLogEntry`,
  `saveImpactRow`), `impact.ts:41-46` (clock read twice, row after the report, event on a tolerated
  failure). Tests: `tests/unit/impact/query-log.spec.ts:33`, `:64`, `:82`, `:103`, `:142`, `:151`;
  `tests/unit/impact/impact.spec.ts:71`; `tests/integration/impact/acme-shop.spec.ts:87`.

### cli-impact

- **Impact command arguments** — `packages/cli/src/commands/impact.ts:200-227` (`parseArguments`, fixed
  `USAGE` messages, `outputError` silenced), `:54` (request checked before the environment),
  `:175-178` (`hopsOf`, digits only). Tests: `tests/unit/cli/impact-command.spec.ts:110`, `:142`, `:159`;
  `tests/integration/cli/impact-command.spec.ts:87`.
- **Impact configuration and connection** — `impact.ts:55-56` (`DATABASE_URL` trimmed, only variable
  read), `:90-105` (`defaultOpenStore`: pool, probe, `application_name`, `DatabaseUnavailable` without
  the driver message), `:70-72` (close in `finally`, its failure swallowed). Tests:
  `tests/unit/cli/impact-command.spec.ts:180`, `:189`, `:375`, `:383`;
  `tests/integration/cli/impact-command.spec.ts:73`, `:127`.
- **Impact project resolution** — `impact.ts:59-60` (exact `===` on the name, before the use case).
  Test: `tests/unit/cli/impact-command.spec.ts:202`.
- **Impact report output** — `impact.ts:61-66` (one call, `maxHops` only when given), `:115-146`
  (`formatReport`, `entryLines`, `named`, `dependantLine`). Tests: `tests/unit/cli/impact-command.spec.ts:224`,
  `:248`, `:285`; `tests/integration/cli/impact-command.spec.ts:154`.
- **Impact UNKNOWN output** — `impact.ts:116`. Tests: `tests/unit/cli/impact-command.spec.ts:277`;
  `tests/integration/cli/impact-command.spec.ts:176`.
- **Impact events and failures** — `impact.ts:67-68` (events after the report, `info`), `:155-163`
  (`toFailure`: built messages only). Tests: `tests/unit/cli/impact-command.spec.ts:340`, `:350`, `:363`.
- **Impact terminal safety** — `impact.ts:139-141` (`terminalSafeText` on every symbol and file). Test:
  `tests/unit/cli/impact-command.spec.ts:394`.

Line numbers are those of `dc55062` (before the review fix).

## 2. Requirements missing or partial

- None missing.
- Partial evidence (fixed in this step): the requirement "Impact configuration and connection" says
  "The command SHALL NOT read any `LLM_*` variable nor `DAILY_BUDGET_USD`". Its scenario "The model
  configuration is not read" (`tests/unit/cli/impact-command.spec.ts:189`) only proves that the values
  do not reach the output; nothing proved the variables are not read. The code reads only
  `deps.env.DATABASE_URL` (`impact.ts:55`). Fixed by the test "reads DATABASE_URL and no other
  variable of the environment" (task 12.6.1; adversarial review F2).
- Wording only, already recorded as A1 (design Follow-ups, D — accepted): the scenario "An impact call
  over the seed writes its row" names the column `text`; the table's column is `question`
  (`packages/adapters/store-postgres/migrations/0002_history-claims.up.sql:84`); the test reads
  `question` (`tests/integration/impact/acme-shop.spec.ts:105-109`).

## 3. Unspecified behaviour

- `packages/core/src/impact/index.ts` re-exports `query-log.ts` and `risk.ts` from the core's root
  (`packages/core/src/index.ts:7`): `impactQueryLogEntry`, `saveImpactRow`, `assessRisk`, `ReportBody`,
  `RiskFacts` and, before this step, the generic helper `plural`. Nothing outside `packages/core/src/impact/`
  imports them. Decision: keep the planned exports (task 1.2a asks for them; they are the module's
  seams) and make `plural` private, since a generic name on the root barrel is surface nobody
  asked for (adversarial review F1, fixed in this step).
- `ImpactCommandDeps.now` and the third parameter `options.now` of `impact`: required by the spec's
  "The clock SHALL be injectable"; specified.
- `formatReport`, `toFailure`, `defaultOpenStore` and `IMPACT_APPLICATION_NAME` exported from
  `packages/cli/src/commands/impact.ts`: the test seams of design D6/D7, as the `ask` command exports
  its own; no behaviour beyond the spec.
- `MISSING_CONFIG` message `DATABASE_URL is not set`: the spec fixes the code and `details`, not the
  message; same text as `ask`. Kept.
- `.gitleaks.toml` allowlist for the synthetic sentinel key of the scenario (regex anchored to the
  exact value). Kept: the scenario requires that literal.

Specific checks:

- Dependency not in the manifest: none (`pg`, `commander`, `@codemind/*` already declared by the CLI).
- Authorisation the spec requires and the code skips: none required (local CLI).
- Fields in the output the spec does not mention: none; `risk` and `events` are specified; per-component
  coverage stays internal (`Component.exactChain` never reaches `ImpactEntry`).
- Scenario tests weaker than the scenario: "The model configuration is not read" is as strong as its
  scenario but weaker than its requirement (see block 2, fixed). "The test of an indirect component does
  not cover a direct one" (`risk.spec.ts:234`) asserts the level and `1 elemento directo sin test` with
  `toContain`, which is what the scenario states.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| impact: A change that anchors nothing answers no-anchor | `tests/unit/impact/impact.spec.ts:34` | green |
| impact: A change that anchors only tests answers no-anchor | `tests/unit/impact/impact.spec.ts:46` | green |
| impact: Impact in an unknown project fails | `tests/unit/impact/impact.spec.ts:61` | green |
| impact: Q2 is reproduced over the acme-shop subset | `tests/unit/impact/impact.spec.ts:124` | green |
| impact: A component appears once at its minimum distance | `tests/unit/impact/components.spec.ts:211` | green |
| impact: A reached file without symbols is reported by its path | `tests/unit/impact/components.spec.ts:239` | green |
| impact: The anchor's own file is not a dependant | `tests/unit/impact/components.spec.ts:258` | green |
| impact: A direct component without a test makes the risk high | `tests/unit/impact/risk.spec.ts:53` | green |
| impact: Every direct component tested and exact makes the risk low | `tests/unit/impact/risk.spec.ts:107` | green |
| impact: A covered direct component whose chains are all heuristic makes the risk high | `tests/unit/impact/risk.spec.ts:120` | green |
| impact: A covered direct component with an exact chain beyond its first hop makes the risk medium | `tests/unit/impact/risk.spec.ts:135` | green |
| impact: An untested heuristic direct component makes the risk high | `tests/unit/impact/risk.spec.ts:173` | green |
| impact: The rationale counts in the singular | `tests/unit/impact/risk.spec.ts:188` | green |
| impact: A test written file to file covers a direct component | `tests/unit/impact/risk.spec.ts:207` | green |
| impact: The test of an indirect component does not cover a direct one | `tests/unit/impact/risk.spec.ts:234` | green |
| impact: Q2 over the seed is high risk | `tests/integration/impact/acme-shop.spec.ts:76` | green (on `codemind_test`) |
| impact: An answered call writes one impact row | `tests/unit/impact/query-log.spec.ts:33` | green |
| impact: A no-anchor call writes one impact row | `tests/unit/impact/query-log.spec.ts:64` | green |
| impact: A failed call writes no row | `tests/unit/impact/query-log.spec.ts:82` | green |
| impact: A row that cannot be written leaves the report with an event | `tests/unit/impact/query-log.spec.ts:103` | green |
| impact: A change without search terms in an unknown project reports the unlogged row | `tests/unit/impact/impact.spec.ts:71` | green |
| impact: An impact call over the seed writes its row | `tests/integration/impact/acme-shop.spec.ts:87` | green (on `codemind_test`) |
| cli-impact: Impact help and version print without reading the environment | `tests/unit/cli/impact-command.spec.ts:110` | green |
| cli-impact: The global help lists impact once | `tests/integration/cli/impact-command.spec.ts:87` | green |
| cli-impact: Impact usage errors never quote the arguments | `tests/unit/cli/impact-command.spec.ts:142` | green |
| cli-impact: An invalid impact request is rejected before any connection | `tests/unit/cli/impact-command.spec.ts:159` | green |
| cli-impact: A missing database URL fails before any connection | `tests/unit/cli/impact-command.spec.ts:180` | green |
| cli-impact: The model configuration is not read | `tests/unit/cli/impact-command.spec.ts:189` (+ the new env-read test) | green |
| cli-impact: An unreachable database fails without leaking the URL for impact | `tests/integration/cli/impact-command.spec.ts:73` | green |
| cli-impact: The impact connections are closed after a run | `tests/integration/cli/impact-command.spec.ts:127` | green (on `codemind_test`) |
| cli-impact: Only the exact name resolves the impact project | `tests/unit/cli/impact-command.spec.ts:202` | green |
| cli-impact: An impact report is printed by section with its risk | `tests/unit/cli/impact-command.spec.ts:224` | green |
| cli-impact: Impact receives only the project id, the change and the hop count | `tests/unit/cli/impact-command.spec.ts:285` | green |
| cli-impact: Q2 over the seed is printed with its risk | `tests/integration/cli/impact-command.spec.ts:154` | green (on `codemind_test`) |
| cli-impact: A change without anchor answers no-anchor on the command line | `tests/integration/cli/impact-command.spec.ts:176` | green (on `codemind_test`) |
| cli-impact: A row that was not logged is reported on stderr | `tests/unit/cli/impact-command.spec.ts:340` | green |
| cli-impact: An unexpected impact failure is internal | `tests/unit/cli/impact-command.spec.ts:350` | green |
| cli-impact: A project removed during the run is not found | `tests/unit/cli/impact-command.spec.ts:363` | green |
| cli-impact: Control characters in a report are escaped | `tests/unit/cli/impact-command.spec.ts:394` | green |

Every scenario has a test that is green; none is absent or red.
