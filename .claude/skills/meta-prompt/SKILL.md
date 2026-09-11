---
name: meta-prompt
description: Use when the user asks to improve, rewrite, structure, or "meta-prompt" a prompt; when a vague request should become an executable prompt before launching an agent; or when they say "help me ask the AI for this properly". Rewrites into role / objective / context / constraints / success criteria / non-goals — without over-prompting reasoning models.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [the raw prompt to rewrite, or paste after the slash command]
allowed-tools: Read
---

## Instructions

You are rewriting the user's prompt so another agent (or the same session) can execute it with less
ambiguity. **Output only the improved prompt** (plus a short note if you had to ask one clarifying
question). Do not execute the task yourself unless the user explicitly asks for both.

### When to use this skill

- The request is underspecified ("haz lo de auth", "limpia esto").
- The user wants a reusable prompt for OpenSpec, a subagent, or a colleague.
- A previous run failed because the model invented scope or skipped constraints.
- Before a costly run (multi-file plan, production touch, long agent session).

### When NOT to use it

- The prompt is already clear and scoped (story + acceptance criteria + non-goals).
- The user only wants an answer, not a better prompt.
- You would be adding ceremony that a reasoning model will ignore or that burns tokens for no gain.

### Reasoning models — do not over-prompt

Models with built-in reasoning (extended thinking, o-series, etc.) already allocate internal
chain-of-thought. For those:

- **Do** give a crisp objective, constraints, success criteria, and non-goals.
- **Do not** add "think step by step", "show your reasoning", long persona essays, or duplicated
  checklists that restate what the tools/hooks already enforce.
- Prefer shorter prompts with hard boundaries over ornate instructional prose.
- Put the **goal and non-goals first**; bury reference material after.

For non-reasoning instruct models, slightly more structural scaffolding is fine — still avoid
redundant pep-talk.

### Rewrite structure

Produce the improved prompt in this shape (omit a section only if it would be empty noise):

```markdown
## Role
<one line: who the agent is for this task — skill-level, not a novel>

## Objective
<single primary outcome; one sentence>

## Context
- <only facts the model cannot infer from the repo>
- <paths, stack, change-id, relevant docs>

## Constraints
- <hard rules: layers, no touch list, security, branch, commands to use>
- <what hooks/standards already cover — mention once, do not re-explain the whole doctrine>

## Success criteria
- [ ] <observable, falsifiable checks>
- [ ] <commands or artefacts that prove done>

## Non-goals
- <explicit out-of-scope items the model must not "helpfully" add>
```

### Quality bar for the rewrite

1. **Level = story or task**, not epic. If the input is an epic, split or demand a thinner slice.
2. Success criteria must be verifiable (test, command, artefact path) — not "clean code" or "best
   practices".
3. Non-goals are mandatory when the original prompt invites gold-plating.
4. Do not invent project facts. If a fact is missing and blocks a safe rewrite, ask **one** question;
   otherwise leave a `{{PLACEHOLDER}}` and say what the human must fill.
5. Keep the user's language for the *content* they care about; keep technical artefact names as in
   the repo (`tasks.md`, `CMD_TEST`, etc.).
6. Prefer referencing `docs/project-context.md` / standards over pasting large excerpts into the
   prompt.

### Output format

```
### Improved prompt
<the structured prompt ready to paste>

### Notes
- <≤3 bullets: what you changed and why; any {{PLACEHOLDER}} to fill>
- Reasoning-model tip: <lean | structured> based on the target model if known
```

If `$ARGUMENTS` is empty, ask the user to paste the raw prompt.
