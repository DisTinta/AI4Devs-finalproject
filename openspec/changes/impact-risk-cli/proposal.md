## Why

The `impact` use case of DIS-89 tells a developer what depends on a change and which tests cover it,
but it stops there: it gives no risk level, no command can run it, and no call is recorded. The
parent story (DIS-83, CM-HU-16a; readme §1.3 Pantalla 3 and Historia de Usuario 3) asks for "un nivel
de riesgo **con su justificación**, no solo la etiqueta", reachable as
`npm run cli -- impact <proyecto> "<cambio>"`, and every query of the product is metered in
`query_log` (capability `impact` already exists in the enum since DIS-74). This is DIS-90
(CM-HU-16a.2), the second half of CM-HU-16a. Its blockers DIS-89 and DIS-74 are done.

## What Changes

- **Risk level with its rationale** in the core report (`packages/core/src/impact/risk.ts`, pure):
  - a `direct` component is *covered* when a `tested_by` edge leaves one of its own seeds of the
    DIS-89 `tested_by` step (its nodes in the report, its file, its class);
  - a `direct` component has a *heuristic-only chain* when it is not of the anchor and none of its
    nodes reached by the reverse traversal is `exact`;
  - `HIGH` when some `direct` component is not covered or has a heuristic-only chain; `LOW` when
    every one is covered and `exact`; `MEDIUM` otherwise (the rule fixed at the PH-15 gate, as
    written; design D1, decision R1 of the spec audit);
  - a one-sentence Spanish rationale with four counts: affected files, covering tests, direct
    components without a test, direct components with a heuristic-only chain, singular for 1, the
    last two counted over the report's `direct`;
  - only on `answered` reports; an `unknown` report has no `risk`.
- **`query_log` row** written by the core use case for every returned report (`answered` and
  `unknown`): capability `impact`, the change as the question, zero tokens and cost, `latencyMs ≥ 1`
  from an injectable clock. A row that cannot be written does not lose the report: it carries a
  `query_not_logged` event with its code, as `explain` does. An invalid request or a failed call
  writes no row.
- **CLI `impact <project> <change> [--max-hops <n>]`** (`packages/cli/src/commands/impact.ts`),
  built as `ask`: the request is checked before the environment is read; `DATABASE_URL` only (no
  `LLM_*`); exact project name; sections `DIRECTO`, `INDIRECTO`, `TESTS`, each entry marked
  `[grafo]`, then `RIESGO <level>` and the rationale; `UNKNOWN (no-anchor)` with exit 0; errors as
  one JSON line on stderr that never holds the change. The stub in `packages/cli/src/index.ts` goes.
- **Docs**: `readme.md` §1.4 (the CLI flow and the stub sentences), the tree in §2, `docs/DEMO.md`
  Paso 4 with the real output, `docs/project-context.md` (the two stub sentences and the impact module).

## Capabilities

### New Capabilities

- `cli-impact`: the `impact` command of the CLI: arguments, configuration and connections, project
  resolution, the printed report with its risk, `UNKNOWN`, events, failures and terminal safety.

### Modified Capabilities

- `impact`: an answered report gains `risk` (level and rationale), and every returned report writes
  one `query_log` row (or carries a `query_not_logged` event). The requirements "Anchoring the
  change" and "Report by component" are modified for the new report fields; "Risk level of a
  report", "Risk over the indexed acme-shop seed" and "Query log of an impact call" are added.

## Non-goals

- The `[git]` co-change signal, stale documentation and the "documento desalineado" term of the
  rationale (DIS-94, CM-HU-16b.1, which widens the risk); enrich decision D8.
- `POST /api/projects/{projectId}/impact` and its HTTP projection (DIS-95, CM-HU-16b.2).
- A web impact screen.
- Translating or expanding the change text: the lexical limit of DIS-89 stays.
- Any LLM call or daily-budget check: the impact is deterministic and costs 0.
- Changing `fixtures/README.md` (the Q2 oracle).

## Scope notes (sub-issue vs parent)

- The parent's Q2 criterion uses «cambiar el cálculo de descuentos», which does not anchor
  `DiscountService` (DIS-89 design D7). DIS-90 owns the demo text (enrich D2): `readme.md` and
  `docs/DEMO.md` show «cambiar los descuentos de DiscountService» and a note explains the literal
  text's lexical limit.
- The enriched ticket's AC3 expected `LOW` for Q2 over the seed. Checked against the seed before
  writing the spec (design Context), the Q2 report has six `direct` components and four of them
  (`DiscountApplied`, `RecordDiscountAudit` and the two service-provider files) have no `tested_by`,
  so the rule answers `HIGH`. The agent, as lead engineer, keeps the rule and corrects the expected
  level (design decision P1), and accepts that every acme-shop demo shows `RIESGO HIGH` (decision
  R2).
- The risk rule is the PH-15 rule as the author wrote it, not the operative reading of enrich D1:
  the spec audit (run 1, B1) showed that `MEDIUM` is not empty under the literal reading, and the
  sub-issue forbids redefining the rule. Decided by the agent as lead engineer in correction round 1
  (design decision R1), without the author, as `docs/AUTONOMOUS-RUN.md` §6 sets.

## Impact

- **Core**: `packages/core/src/impact/` (`risk.ts` and `query-log.ts` new; `impact-report.ts`,
  `impact.ts`, `relevance.ts` (the internal `Component.exactChain`), `reverse-walk.ts` and
  `index.ts` changed). No port, adapter, migration or schema change:
  `StorePort.saveQueryLog` and the `impact` value of `query_capability` exist.
- **CLI**: `packages/cli/src/commands/impact.ts` new, with its own pooled store opener;
  `packages/cli/src/index.ts` delegates `impact`. `packages/cli/src/commands/ask.ts` is not edited.
- **Seed and golden file**: no fingerprint input changes (design P9), so no `seed:build` or
  `cache:build`.
- **Tests**: new `tests/unit/impact/risk.spec.ts`, `tests/unit/impact/query-log.spec.ts`,
  `tests/unit/cli/impact-command.spec.ts`, `tests/integration/cli/impact-command.spec.ts`; two
  existing tests of `tests/unit/impact/impact.spec.ts` change (tasks 7.1), and
  `tests/integration/impact/acme-shop.spec.ts` gains two tests.
- **Docs**: `readme.md`, `docs/DEMO.md`, `docs/project-context.md`. Commands as in
  `docs/project-context.md` → Commands.
- **Privacy / logging**: no personal data. The change text is user text: it is stored only in
  `query_log.text` (as `ask` stores its question) and never appears in an error, event or log line.
- **Dependencies**: none new.
