---
name: writing-skills
description: Use when creating a new skill, editing an existing one, or when the user notices they keep repeating the same instructions in chat. Also use when a skill exists but never triggers.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [name or purpose of the skill]
allowed-tools: Read Grep Glob Write Edit Bash(grep *) Bash(ls *)
---

## Existing skills
!`ls -1 ai-specs/skills`

## Instructions

### The rule that decides whether this should be a skill at all

- A **fact** about the project goes in `docs/project-context.md`. It is always loaded.
- A **procedure** goes in a skill. It is loaded only when invoked, so it costs nothing at rest.
- An **invariant that must never fail** goes in a hook. Text is interpreted; code is executed.

If you are about to write a skill whose content is three facts, you are writing it in the wrong place.
If you are about to write a skill that says "never do X", ask whether a hook can enforce it instead.

### Step 1 — The description is the most important line

The description is what the model reads to decide whether to load the skill. Everything else is
irrelevant if this fails.

- **Start with "Use when…"** and describe the *trigger*, not the capability. `Reviews code` is a
  capability; `Use when asked to review the pull request or do a code review` is a trigger.
- Include the real phrases a user would type, in the languages they would type them.
- Be specific enough that it does not fire on everything. A skill that loads on every code question is
  worse than no skill, because it displaces the ones that were relevant.
- It is truncated at 1536 characters. Put what matters first.

### Step 2 — Structure

```
ai-specs/skills/<name>/
├── SKILL.md          the procedure. Under 500 lines
├── references/*.md   detail loaded only when the procedure needs it
└── scripts/*         anything deterministic enough to be code
```

**The directory name is the command.** `ai-specs/skills/deploy/` is invoked as `/deploy`; the
frontmatter `name` field does not change that.

Keep `SKILL.md` under 500 lines. If it grows past that, the detail belongs in `references/` and the
procedure should say when to load it.

### Step 3 — Write the procedure, not the theory

- Numbered steps, in the order they happen.
- State the **output format** explicitly if the result feeds another step. Six of the skills in this kit
  do; it is the difference between a usable result and a paragraph.
- Put the prohibitions in their own section with a heading. Buried prohibitions are ignored.
- Say what to do when blocked: report what is missing, do not retry blindly.
- Prefer "ask" over "guess" wherever the cost of guessing wrong is more than a wasted turn.

### Step 4 — Pull the project's real values from configuration

Never hardcode a command. Use dynamic context so the skill reads the project's own configuration:

```
## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`
```

Use a single Bash command (no pipes). Add `Bash(grep *)` to `allowed-tools` so Claude Code
can inject the output without aborting the skill.

That single line is what makes a skill portable across projects and stacks.

### Step 5 — Test it, do not assume it

1. **Does it trigger?** Start a fresh session and type what a user would type — not the skill name.
   If it does not load, the description is wrong, not the user.
2. **Does it trigger too much?** Type three unrelated requests. If it loads on any of them, narrow it.
3. **Does it work when followed literally?** Have a subagent execute it with no other context. Anything
   it has to infer is a gap in the procedure.
4. **Does it hold under pressure?** Give the subagent a reason to take the shortcut the skill forbids.
   A prohibition that collapses the first time it is inconvenient is decoration.

### Step 6 — Register it

New skills in `ai-specs/` need references from `.claude/` and `.cursor/`. Run the
`sync-agent-artifacts` skill. A skill that only exists in `ai-specs` does not load anywhere.

## Red flags — stop and start over

- The description describes the capability instead of the trigger
- The skill contains project facts instead of a procedure
- The skill restates a guarantee a hook already enforces
- A command is hardcoded instead of read from configuration
- `SKILL.md` is over 500 lines with no `references/`
- You wrote it and never ran it
