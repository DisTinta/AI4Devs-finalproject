---
name: privacy-ethics-check
description: Use when the change touches personal data, auth, sessions, logging, telemetry, analytics, file uploads, or third-party APIs that receive user content; when about to install a dependency suggested by AI; when opening a PR that may carry sample data, dumps, fixtures with real emails, or secrets; or when the user mentions GDPR, AI Act, PII, privacy, ethics, or "datos personales". Runs a privacy/ethics checklist before proceeding.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [path, change-id, or short description of the risk surface]
allowed-tools: Read Grep Glob Bash(grep *) Bash(git *)
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

Run this checklist on `$ARGUMENTS` (or on the current diff / open change if empty). **Do not invent
compliance verdicts.** Report risks with evidence from the code or the diff. Prefer blocking a
dangerous step over hoping the human notices later.

This skill is the transversal privacy/ethics pass for the harness. It complements hooks
(`block-secrets`, package confirmation) — it does not replace them.

### Step 0 — Scope the risk surface

Identify which of these apply:

| Surface | Examples |
|---|---|
| Personal data / PII | names, emails, phones, IPs, IDs, health/finance, biometric |
| Auth / sessions | login, tokens, cookies, password reset, OAuth |
| Logging / observability | request logs, error trackers, analytics events |
| AI context | prompts, agent transcripts, pasted dumps, fixtures fed to models |
| Dependencies | `npm i`, `composer require`, `pip install` from an AI suggestion |
| Delivery | PR, commit, shared docs with sample payloads |

If none apply, say so in one line and stop. Do not run a full theatre checklist on a CSS tweak.

### Step 1 — Tooling plan (consumer vs enterprise / API)

- Confirm work on company or client code uses **Business / Enterprise / API** plans, not consumer
  chat UIs (ChatGPT Free/Plus consumer, claude.ai consumer without enterprise controls, etc.).
- Consumer plans may train on or retain prompts differently. API and enterprise contracts are the
  default for proprietary code and any PII.
- If the session appears to be on a consumer surface with sensitive material in context: **stop and
  warn** before continuing analysis that would re-send that material.

### Step 2 — PII and secrets out of model context

- No real PII in prompts, tickets pasted into chat, agent memory, or committed fixtures.
- Prefer synthetic data, tokens (`PER_00234`), or a privacy vault pattern: real PII never reaches the
  LLM.
- Grep the change for emails, phone-like strings, national IDs, `Authorization:` headers, and
  known secret shapes. Report hits with path and line.
- Logging must not dump raw request bodies, tokens, or password fields. Flag `console.log(user)`,
  debug middleware that prints headers, and error trackers that attach full payloads by default.

### Step 3 — GDPR-oriented checks (data, not vibes)

For features that collect, process, store, or transfer personal data, verify the change does not
ignore:

| Principle | What to look for in the diff |
|---|---|
| Lawful basis / purpose | Processing purpose documented or already established; no silent new use of existing data |
| Data minimisation | Only fields needed for the feature; no "log everything just in case" |
| Retention | No unbounded storage of personal payloads without a stated retention path |
| Security | Access control on the resource, not only authentication; no string-interpolated queries |
| Transparency | User-facing AI features need disclosure when the AI Act / product policy requires it |

You are not a DPO. Flag gaps; do not invent legal bases.

### Step 4 — EU AI Act awareness

- Most coding assistants used as tools are **limited risk** (transparency). Do not claim "AI Act
  certified" without evidence.
- If the product itself is an AI system (decision support, ranking, automated rejection, biometric):
  note the likely risk tier and that high-risk duties are out of scope for a quick checklist —
  escalate to the human.
- Unacceptable-risk patterns (social scoring, real-time remote biometric ID in public spaces as
  banned uses, etc.): **hard stop** and escalate.

### Step 5 — Slopsquatting and dependency hygiene

Before any install or lockfile change suggested by an agent:

1. Confirm the package name exists on the official registry (`npmjs.com`, `pypi.org`, Packagist…).
2. Check spelling against popular packages (typosquatting / slopsquatting).
3. Prefer pinned versions already used in the monorepo when possible.
4. Never install a package that only appeared in model output and was never verified.

If the user is about to install: present the verification result and wait for explicit approval when
the risk is non-trivial.

### Step 6 — PR and delivery hygiene

Before `/pr-describe` or opening a PR:

- No `.env`, dumps, production exports, or real user rows in the diff.
- Sample payloads in docs/tests are synthetic.
- Changelog / PR body does not paste secrets "for convenience".

### Step 7 — Report format

```
## Privacy / ethics check: <scope>

### Verdict
PASS | PASS WITH GAPS | BLOCK

### Findings
| Severity | Area | Finding | Evidence | Required action |
|---|---|---|---|---|

Severity: Critical (block), High, Medium, Low.

### Allowed to proceed?
Yes / Only after <actions> / No

### Not assessed
<what you could not verify and why>
```

**Critical → BLOCK:** real PII or secrets in context or diff; consumer plan with sensitive company
data; unverified dependency install; high/unacceptable AI Act pattern without human ownership.

Do not modify production code in this skill unless the user explicitly asks to remediate a finding.
The default output is the report.
