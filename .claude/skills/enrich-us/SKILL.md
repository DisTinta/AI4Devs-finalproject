---
name: enrich-us
description: Use when a ticket or user story arrives without enough detail to implement autonomously, or when the user says "enrich this", "prepare this story" or pastes a bare ticket title.
author: sdd-harness-kit
version: 1.1.0
argument-hint: [ticket text or ticket id]
allowed-tools: Read Grep Glob Bash(grep *)
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

Act as a product expert with technical knowledge of this codebase.

### Step 1 — Determine the source

- **Direct input mode** (default): the user pasted the ticket content. Work with it.
- **Ticket system mode**: the user gave an id or asked to fetch it. Use the configured MCP connector.
- If the input is an ambiguous reference with no content ("the one in progress"), **ask** whether to
  resolve it through the connector or to paste the full text. Do not guess.

Do not require a ticket system when the user already provided the content.

### Step 2 — Decide whether it is already complete

A story is implementation-ready only if it covers all of:

- Full functional description
- Every field or parameter that changes
- The interface it exposes: entry point, shape of input and output
- Which files or modules to modify, according to the layer order of this project
- Definition of done, including delivery steps
- Documentation and test updates required
- Non-functional requirements: security, performance, observability

Read `docs/project-context.md` and `docs/backend-standards.md` for the technical context.

### Step 3 — Build the Reality map (mandatory, before writing Enhanced)

Do **not** write `## Enhanced` until this map is complete. Search the repository with Grep/Glob/Read.
Ticket text is a **hypothesis**, never evidence that a route, file, trait or middleware exists.

Classify every relevant piece (routes, middleware, traits/concerns/helpers, controllers, services,
validators, models, closest tests) into exactly one bucket:

| Bucket | Meaning | How to write it |
|---|---|---|
| **Exists** | Found in the repo | Cite real path (and symbol/route if useful) |
| **To create** | Needed by the story and absent today | Propose the conventional path from project standards; label `to-create` |
| **Ticket examples checked** | Paths/URLs/names taken from the ticket | After search: `FOUND → Exists` or `NOT FOUND` (keep as hypothesis; move to **To create** only if the story truly requires it) |

Minimum search, adapted to this project's layout from `docs/project-context.md` / standards:

1. Route registration file(s) and matching HTTP verbs/paths for the capability.
2. Existing middleware / request pipeline hooks relevant to the change.
3. Reusable traits, concerns, base controllers, helpers — prefer them when they fit.
4. Controllers, services, validators, models in the same area.
5. Closest existing test as a template.

**Gate:** every path later cited under Technical context must appear in **Exists** or **To create**.
Citing a ticket example that was not searched is a failed run — redo the map.

### Step 4 — Produce the enriched version

Output **always** in this format, with all three sections:

```
## Original
<the ticket exactly as received>

## Reality map
### Exists
- ...

### To create
- ... (label each item to-create; path from project conventions)

### Ticket examples checked
- <example from ticket> — FOUND at <path> | NOT FOUND
```

```
## Enhanced
<the enriched story>
```

The enhanced story has these sections, in this order. The order matters: the agent that implements it
reads top to bottom, and if the technical context comes first it starts deciding about implementation
before understanding the product problem.

1. **User story** — `As a <role>, I want <capability>, so that <business outcome>`.
2. **Acceptance criteria** in Given/When/Then. Three to five scenarios: happy path, at least one edge
   case, at least one error case. Each must be translatable into an automated test: entry point,
   concrete input, expected result, observable effects. Never "the filter should work".
3. **Technical context** — only paths from the Reality map. For **Exists**: where it fits, what to
   extend, authorisation, closest test template. For **To create**: say it is new, why, and which
   existing pattern it should follow. Prefer existing traits/middleware over inventing parallel ones.
4. **Non-goals** — at least two explicit limits.
5. **Labels and estimate** — area and type labels, plus a t-shirt size with a one-sentence rationale.

### Step 5 — Apply the INVEST filter

Independent, Negotiable, Valuable, Estimable, Small, Testable. If the story fails two or more, or does
not fit in one to two human-equivalent days, mark it `needs-splitting` and propose a two or three way
decomposition that covers 100 % of the original scope.

### Step 6 — Write back (optional, only in ticket system mode)

Append the enriched content after the original, under `[original]`, `[reality-map]` and `[enhanced]`
headings. If the ticket state is a "to refine" state, move it to the corresponding validation state.

## Prohibitions

- Do not treat ticket examples ("e.g. `/api/courses/:id`") as real routes or files without searching.
- Do not put a path in Technical context unless it is in the Reality map as **Exists** or **To create**.
- Do not mark something **Exists** when it is only a convention you would create — that is **To create**.
- Do not refuse new routes/files when the story needs them; label them **To create** with a conventional path.
- Do not skip the Reality map because the ticket "already looks technical enough".

| Excuse | Reality |
|---|---|
| "The ticket already names the route" | Ticket = hypothesis. Search first. |
| "The example is close enough" | Close is not cited evidence. Map the real API surface. |
| "New feature, so there is nothing to search" | Still map insertion points that **Exist** (route file, middleware stack, traits, test template). |
| "Listing every route is overkill" | Map the capability's area completely enough that an implementer cannot invent entry points. |

## Mandatory closing note

> These acceptance criteria are a first draft generated by AI. Review them against the real system
> before accepting them: the model does not know the legacy integration that breaks on Mondays, nor the
> business rule that only one person remembers.
