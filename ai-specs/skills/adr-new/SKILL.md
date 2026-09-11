---
name: adr-new
description: Use when the user says "document this decision", "write the ADR", or pastes the thread where something was decided. Transcribes a decision that has already been made, and says when a record is not warranted.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [title of the decision]
allowed-tools: Read Glob Write Bash(date *)
---

## Today
!`date +%Y%m%d`

## Existing records
!`ls -1 docs/adr/ 2>/dev/null`

## Instructions

### Step 1 — Apply the necessity test before writing anything

Three questions:

1. Would a developer arriving today, seeing this code, ask "why was it done this way"?
2. Does the decision affect more than one module, or the contract with another team?
3. Does reverting it cost more than a day?

If the answer to 2 or 3 is no, **do not write the record**: say so and propose a code comment instead.
Filler records are as harmful as missing ones — they train the team to stop reading the directory.

### Step 2 — If it is warranted, write it

Create `docs/adr/<YYYYMMDD>-<slug>.md` following `docs/adr/_template.md`, transcribing the decision
that is already recorded in `design.md` or in what the user told you.

### Rules

- File naming: compact ISO date plus slug. Never manual sequential numbering: it collides across
  concurrent branches.
- **Do not invent alternatives nobody considered.** If there was only one real option, say so — that is
  itself information about the constraints.
- The *why* comes from the human. If the context you were given does not explain it, **ask before
  writing**: your job here is to transcribe a decision, not to make one.
- Add the entry to the index at `docs/adr/README.md`.
- If this decision supersedes an earlier record, mark that one as superseded. Do not delete it: the
  discarded reasoning is the valuable part.
