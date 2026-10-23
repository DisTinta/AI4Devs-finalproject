# Baseline — hook decisions before DIS-106 (2026-10-20)

Environment: Windows 11, Git Bash, jq 1.8.2, Node v24.11.1, Claude Code 2.1.282 (`scratchpad_dir` available, needs >= 2.1.257). Branch `feature/DIS-106-autonomous-run-switch` at `672b308`, `KIT_PROTECT_SPECS="1"`, `KIT_SPEC_AUDIT_GATE="1"`.

Suite: `npx vitest run` → 141 files passed, 20 skipped (161); 1463 tests passed, 221 skipped (1736); 83 s.

Decisions, piped by hand through `node .claude/hooks/invoke.cjs` with Claude Code input (scratchpad script `baseline.mjs`):

| Hook | Input | Decision |
|---|---|---|
| block-dangerous-bash.sh | `git reset --hard` | ask |
| block-dangerous-bash.sh | `npm install left-pad@1.3.0` | ask |
| block-dangerous-bash.sh | `psql -c "DROP TABLE x"` | ask |
| protect-specs-and-tests.sh | `<repo>/tests/unit/llm/llm-config.spec.ts` | ask |
| protect-specs-and-tests.sh | `<repo>/openspec/specs/llm-adapter/spec.md` | ask |
| protect-specs-and-tests.sh | `<repo>/docs/base-standards.md` | ask |
| block-dangerous-bash.sh | `rm -rf packages` | deny |
| block-dangerous-bash.sh | `git commit -m "$(rm -rf packages)"` | deny |
| block-dangerous-bash.sh | `git rm -r --cached x` | deny |
| block-dangerous-bash.sh | `docker rm -f c` | deny |
| block-dangerous-bash.sh | `git push --force` | deny |
| block-dangerous-bash.sh | `chmod 777 x` | deny |
| block-dangerous-bash.sh | `NODE_ENV=production npm run x` | deny |
| block-dangerous-bash.sh | `npm test` | none |
| block-dangerous-bash.sh | `npx vitest run` | none |
| block-dangerous-bash.sh | `npm install --omit dev` | none |

The docs-gate case of the first scenario ("a commit that stages a migration without docs") depends on the staged index, so it is pinned by the harness fixture in task 2.3 instead of the live repository (today: `ask`, per `docs-gate.sh:41`).
