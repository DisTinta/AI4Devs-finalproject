---
description: What this project is, the real commands, and the things an agent cannot infer from the code.
alwaysApply: true
---

# Project Context — {{PROJECT_NAME}}

> This is the ONE file you write by hand. Everything else in `docs/` is doctrine that the kit
> replaces on update; this file is yours and survives updates.
>
> **Size rule: under 200 lines.** If it grows, split it per subdirectory. Prune test for every line:
> "would removing this cause an error?" If not, remove it.
>
> Write it in English (see `base-standards.md` §2).

## What this is

{{TWO SENTENCES: what the product does and what stack it runs on}}

## Commands

Verified against this repository. If a command is not here, it does not exist — do not invent one.

- Development environment: `{{CMD_DEV}}`
- Tests: `{{CMD_TEST}}`
- A subset of tests: `{{CMD_TEST_FILTER}} <pattern>` — prefer this over the full suite
- Lint / format: `{{CMD_LINT}}`
- Static analysis: `{{CMD_STATIC}}`
- Migrations: `{{CMD_MIGRATE}}`

## Testing

{{Test framework, where tests live, how the test database is isolated, and how test data is built}}

## Branch and ticket conventions

- Branch naming: `feature/<ticket-id>`
- Ticket id format: {{e.g. ABC-123}}
- Base branch: {{main}}

## Operational constraints

- Never commit `.env` or any secret.
- Do not edit anything under `openspec/`: it is input to the flow, not output.
- Do not add dependencies without justifying them in the pull request.
- Do not force-push. Ever.
- Do not edit migrations already applied on the base branch: create a new one.
- {{Anything else specific to this project}}

## Gotchas

What the model does NOT know by default about this project: non-obvious behaviour, known traps,
services that must be started first, quirks of the local environment.

- {{gotcha}}
- {{gotcha}}
