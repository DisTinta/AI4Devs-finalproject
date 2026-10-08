---
description: Enforce mandatory steps when creating tasks.md artifacts in OpenSpec changes, and ensure the agent executes all verification itself.
alwaysApply: true
---

# OpenSpec Tasks: Mandatory Steps

When creating or updating a `tasks.md` artifact in an OpenSpec change, you MUST follow this document.

## 1. Read the project context first

**BEFORE** creating or updating any `tasks.md`, read `docs/project-context.md` and
`.claude/sdd-harness.env` to learn:

- The real commands of this project (tests, lint, static analysis, migrations)
- The layer order a vertical slice must follow
- Branch naming conventions
- Which verification steps apply to this stack

Never invent a command. If a command you need is not there, stop and ask.

## 2. Mandatory steps and their order

All implementation task lists MUST include these, in this order:

### Step 0: Create Feature Branch (MUST BE FIRST)

- **Location**: the very first step, numbered 0.
- **Naming**: when a ticket exists, `{BRANCH_PREFIX}<TICKET-ID>-<slug>` (default
  `feature/KAN-184-filter-listing`). A ticket id is `[A-Z][A-Z0-9]+-[0-9]+`. If there is no
  ticket, `{BRANCH_PREFIX}<change-name>`. Record the prefix in the project context.
- **Action**: create and switch to the branch before any code change.

### Mandatory steps, to be included in every task list

- **Review and Update Existing Tests** (MANDATORY)
- **Run Tests and Verify Data State** (MANDATORY)
- **Manual Interface Testing** (MANDATORY) — **AGENT MUST EXECUTE**
- **End-to-End Testing** (MANDATORY if the change reaches a user interface) — **AGENT MUST EXECUTE**
- **Update Technical Documentation** (MANDATORY)
- **Pre-merge Review** (MANDATORY) — **AGENT MUST EXECUTE** — always the **last** step, run once the
  pull request is open (see section 3)

## 3. Verification requirements: the agent executes

**The agent MUST perform all verification itself. NEVER delegate testing to the user.** These steps
must be executed by the agent for a task to be marked complete.

### Run Tests and Verify Data State

1. **Prepare the environment**: ensure required services are available. Capture the pre-test state of
   the data relevant to the change (counts, key records, checksums). Document the exact commands you
   will run.
2. **Run targeted tests first**: the focused tests for the modified modules. Confirm the previous
   failure is resolved and no regression appears in scope. Capture the output summary.
3. **Run the broader suite** required by the project context. Record totals, failures, runtime and any
   flaky behaviour.
4. **Verify the post-test state**: re-check the same indicators. Confirm no unintended mutation
   remains. If any occurred, restore it and document the restoration.
5. **Write the verification report** under `openspec/changes/<change-name>/reports/`, named
   `YYYY-MM-DD-<step>-test-and-state-verification.md`, using the template in section 6.
6. **Mark the task complete** only after tests pass, state is verified or restored, and the report
   exists.

### Manual Interface Testing

For every interface the change adds or modifies — HTTP endpoint, CLI command, queue consumer,
scheduled job — the agent must exercise it directly and verify the real response, not assume it.

1. **Prepare the environment**: start the service if needed, verify connectivity, note the current
   data state for anything that creates, updates or deletes.
2. **Exercise the success path** and verify the status or exit code, and the shape and content of the
   response.
3. **Exercise every mutating operation** and then **restore the state**: delete what was created,
   revert what was updated, recreate what was deleted.
4. **Exercise the error cases**: invalid input, missing resource, unauthorised access. Verify the error
   shape matches the API specification.
5. **Document** every command executed and the response received.
6. **Mark the task complete** only after all of them pass and the state is restored.

### End-to-End Testing

Applies when the change affects a user workflow, the integration between interface layers, or any
user-facing behaviour that needs a real client.

1. Prepare the environment: all services running, data in a known state.
2. Drive the real client through the complete workflow.
3. Test the error scenarios: validation messages and recovery paths.
4. Verify persistence: what the interface shows matches what is stored.
5. Restore the environment: clean up test data, close sessions.
6. Document scenarios and outcomes in a report under `openspec/changes/<change-name>/reports/`, and
   only then mark the task complete. If Playwright (or any browser tool) takes screenshots, save them
   in that same `reports/` directory (e.g. `YYYY-MM-DD-<scenario-slug>.png`) and link them from the
   report. Never leave screenshot files at the repository root.

### Pre-merge Review

Every change closes with the same sequence. The order is fixed:

```
apply done → PR opened → /show-spec-working → /verify-against-spec → /adversarial-review
  → fixes committed to the same PR → /opsx:archive → archive commit on the same PR → merge
```

1. **Precondition**: the pull request of the change is open. Pushing and opening it are outward-facing:
   confirm with the author first.
2. **Run the three checks in this order**: `/show-spec-working`, `/verify-against-spec`,
   `/adversarial-review`. Each one writes its report under `openspec/changes/<change-name>/reports/`:
   `YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`,
   `YYYY-MM-DD-adversarial-review.md`. For a change with `skip_specs: true`, verify against
   `proposal.md`, `design.md` and the acceptance criteria of the ticket. `/show-spec-working` may reuse
   the evidence already produced by the manual and end-to-end steps (run links, transcripts) instead of
   repeating it, unless a finding requires it.
3. **Fix the findings in this change**, never in a new ticket or task. Every finding gets an A/B/C/D
   destination in `design.md` → Follow-ups (`docs/project-context.md` → Tracking deferred findings).
   Fixes that change behaviour follow TDD. Re-run the verification each fix invalidates (tests, CI run,
   manual evidence) and add an addendum to the affected report.
4. **Commit the fixes to the same pull request** (push confirmed with the author). Re-run a check when
   its findings led to non-trivial fixes, until it returns no Blocker or Major.
5. **Archive, then merge**: `/opsx:archive` only after the three checks are clean; commit the archive
   to the same pull request. The author merges after the archive commit. The agent never merges.

## 4. Verification checklist

Before finalising any `tasks.md`, verify:

- [ ] Step 0 (create feature branch) is the FIRST step
- [ ] All mandatory steps for this stack are included
- [ ] Steps are numbered sequentially
- [ ] Mandatory steps carry the `(MANDATORY)` label
- [ ] Branch naming follows the project convention
- [ ] The test step names the report path and naming pattern
- [ ] Manual verification steps state `AGENT MUST EXECUTE` explicitly
- [ ] Tasks that mutate data include the restoration step
- [ ] The end-to-end step is present if a user interface is involved
- [ ] The last step is Pre-merge Review: the three checks in order, fixes on the same PR, archive
      commit before merge
- [ ] Every `#### Scenario:` in the delta spec maps to at least one task

## 5. When this applies

This document is enforced by the `validate-tasks` hook, which matches on the file path
(`*/tasks.md`). It does not know or care which command produced or edited the file, so it applies
identically on both paths available in this kit:

- Creating `tasks.md` via `/opsx:ff` or `/opsx:propose` (OpenSpec) or via prompt **P5** (kit)
- Creating or updating `tasks.md` via `/opsx:continue` (OpenSpec)
- Any manual edit of an existing `tasks.md`
- Implementing tasks via `/opsx:apply` (OpenSpec) or `/openspec-implement` (kit) — the agent must
  execute the verification steps either way
- Updating `tasks.md` as a side effect of `/opsx:sync` reconciling a delta spec into the main spec

## 6. Report template

Save under `openspec/changes/<change-name>/reports/`:

```markdown
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
```

## 7. Example structure

The mandatory steps are not contiguous: the change's own tasks interleave with them. The scope prefix
is part of the title.

```markdown
## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)
- [ ] 0.1 Create feature branch `feature/<TICKET-ID>-<change-name>` from the main branch (or `feature/<change-name>` if there is no ticket)
- [ ] 0.2 Verify branch creation and current branch status

## 1. Backend: Validation Tests (TDD)
- [ ] 1.1 Write the failing test for the invalid-input scenario
- [ ] 1.2 Implement the minimum to pass it

## 2. Backend: <the change's own work>
- [ ] 2.1 ...

## 6. Backend: Review and Update Existing Tests (MANDATORY)
- [ ] 6.1 Identify tests affected by the change
- [ ] 6.2 Update them without weakening their assertions

## 7. Backend: Run Tests and Verify Data State (MANDATORY)
- [ ] 7.1 Capture pre-test baseline for the impacted entities
- [ ] 7.2 Run targeted tests for the changed modules
- [ ] 7.3 Run the required broader suite
- [ ] 7.4 Verify post-test state and restore if needed
- [ ] 7.5 Create the report under `openspec/changes/<change-name>/reports/`
- [ ] 7.6 Mark complete only after tests pass and the report exists

## 8. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)
- [ ] 8.1 Ensure the service is running
- [ ] 8.2 Exercise the success path and verify the response
- [ ] 8.3 Exercise mutating operations and restore state afterwards
- [ ] 8.4 Exercise the error cases
- [ ] 8.5 Document every command and response
- [ ] 8.6 Verify the data state matches the pre-test state

## 9. Frontend: End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)
- [ ] 9.1 Ensure all services are running
- [ ] 9.2 Drive the complete user workflow
- [ ] 9.3 Test error scenarios and validation
- [ ] 9.4 Verify persistence and displayed state
- [ ] 9.5 Restore the environment
- [ ] 9.6 Document scenarios and outcomes

## 10. Update Technical Documentation (MANDATORY)
- [ ] 10.1 Update the API specification if the contract changed
- [ ] 10.2 Write an ADR if the change involved a non-trivial, hard-to-reverse decision
- [ ] 10.3 Update the project context if a new gotcha appeared

## 11. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)
- [ ] 11.1 Open the pull request (after confirming with the author)
- [ ] 11.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `reports/`
- [ ] 11.3 Fix every finding in this change and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates
- [ ] 11.4 Commit the fixes to the same pull request
- [ ] 11.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
```

## 8. Agent execution requirements

When implementing tasks from `tasks.md`, the agent MUST:

1. **Execute all verification.** Never ask the user to run commands, exercise endpoints, or run
   end-to-end tests. Start the services yourself if needed.
2. **Mark tasks complete only after** the verification has actually run, the results have been
   verified, the data state has been restored where applicable, and the outcome has been documented.
3. **Never delegate.** Do not ask the user to run tests. Do not mark a task complete without running
   them. Do not skip a verification step because the change looks small.
4. **Document execution**: commands run, responses received, scenarios exercised, restoration actions,
   and any issue encountered with its resolution.

## Failure to follow

If you create a task list without these mandatory steps, the user has to repair it by hand. If you
implement tasks without executing the verification yourself, you are violating this document: the
purpose of a task list is to be evidence that the work was verified, not a record that it was typed.
