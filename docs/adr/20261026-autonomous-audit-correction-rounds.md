# A CHANGES REQUIRED spec audit opens correction rounds in an autonomous run instead of stopping the ticket

## Status
Accepted. Amends [`20261020-kit-autonomous-mode.md`](./20261020-kit-autonomous-mode.md): its sentence
"A `CHANGES REQUIRED` audit stops the ticket cleanly" now holds only after the last correction round.

## Context and problem
*Agent's text, written at the author's request (2026-10-26).*

The first autonomous run with the kit's switch (pilot on DIS-104 and DIS-105, 2026-10-26, workflow
`wf_ccbd8bf7-9a8`) stopped both tickets at the first `spec-auditor` verdict. Both were
`CHANGES REQUIRED`, and both for findings a correction round fixes: rules left open for the
implementer, a self-contradictory scenario, a missing commit task, questions for the author. No code
was written, about 36 minutes and 0.96 M subagent tokens were spent, and both tickets went back to
the author.

The cause is the rule of the 2026-10-20 record: in an autonomous run the change's artifacts can be
rewritten before the first audit and after an `APPROVED` one, never after `CHANGES REQUIRED`. The
interactive flow has no such stop: `docs/base-standards.md` §7.1, step 3, applies the corrections and
runs the auditor again, sending only product and scope decisions to the author. A first audit
rarely approves, so with that rule an autonomous run only gets past tickets that are already
polished, which defeats the point of the run. The author asked for the correction round to run
without her, "autonomous but with method".

## Options considered
* **Keep the stop** (the 2026-10-20 rule): safe, but nearly every ticket returns to the author after
  its first audit.
* **Unlimited correction rounds:** the agent corrects and re-audits until `APPROVED`. Nothing ends a
  change that keeps failing, and each round costs a fresh audit.
* **A bounded number of correction rounds**, counted by the hook from the `CHANGES REQUIRED`
  verdicts in the change's own reports, with the agent answering the author's questions as lead
  engineer and a fresh `spec-auditor` judging the result.

## Decision
We choose **a bounded number of correction rounds** because:
* It is the §7.1 loop the interactive flow already runs; only the author's part moves to the agent,
  and every decision it takes is marked as its own and recorded in `design.md` → Follow-ups and in
  the ticket, where the author reviews it after the run.
* The safeguard that matters is unchanged: the spec-audit gate lets no code or test through until a
  `spec-auditor` says `APPROVED`, and that auditor runs in a fresh context, without the round's
  reasoning.
* The bound is deterministic and visible: `AUTONOMOUS_AUDIT_ROUNDS` in `.claude/sdd-harness.env`
  (default 2, anything but a whole number is 0), counted from the reports the change commits. After
  the last round the ticket stops as before.

## Consequences
* `protect-specs-and-tests.sh` allows rewriting the active change's artifacts while its
  `CHANGES REQUIRED` verdicts are at most `AUTONOMOUS_AUDIT_ROUNDS`; `spec-audit-gate.sh` keeps
  denying code and names the correction round in its reason.
* `docs/base-standards.md` §7.1, step 3 ("a product or scope decision goes to the author") joins the
  doctrine relaxed in an autonomous run (`docs/AUTONOMOUS-RUN.md` §2). Those decisions now reach the
  author after the run, not before the code; the author must read the Follow-ups of each ticket.
* The count is only as honest as the reports: as with the `APPROVED` line, nothing cryptographic
  stops the agent from deleting a report to reset it. Reports are committed, so a reset shows in the
  branch history, and the base branch's protection still requires CI.
* A ticket can now spend up to three audits before its apply; the workflow pays that cost instead of
  the author's time.
