# Instructions for GitHub Copilot

The source of truth for this repository's commands, conventions and constraints is `AGENTS.md`.
The concrete stack values live in `.claude/sdd-harness.env`. Consult them before suggesting anything.

Rules that always apply:

- **TDD.** Propose the test before the implementation and do not modify existing tests.
- **Layers.** Business logic does not live in the transport layer or in the route files. The
  business layer does not know about HTTP.
- **Validation.** All external input passes through the project's validation layer.
- **Output.** Never return a persistence entity directly: serialise explicitly the fields that go
  out.
- **Dependencies.** Do not suggest packages that are not already in the manifest without warning
  about it explicitly: nearly one in five packages that models recommend does not exist.
- **Secrets.** Never write credentials in the code, not even example ones.
