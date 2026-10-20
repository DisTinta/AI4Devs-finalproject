#!/usr/bin/env bash
# PreToolUse (Bash) — merge gate (openspec change autonomous-run-switch, design D4).
# In an autonomous run (KIT_AUTONOMOUS_RUN="1") the agent may merge its pull request only when
# deterministic conditions read from GitHub hold: base, checks, mergeable, complete file list,
# archived change, no kit configuration, protected base. In unattended mode without the switch (a
# Cursor background agent) every merge is denied. Outside unattended mode it stays silent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
hook_input_init "$INPUT"
unattended || done_ok
fail_closed

COMMAND=$(field "$INPUT" '.tool_input.command')
[[ -n "$COMMAND" ]] || done_ok
CWD=$(field "$INPUT" '.cwd')
CWD="${CWD:-$PROJECT_DIR}"

PARSE=$(parse_command "$COMMAND" "$CWD" "")
# Unparsable lines are denied by block-dangerous-bash in unattended mode.
[[ "$(printf '%s' "$PARSE" | jq -r '.ok')" == "true" ]] || done_ok

# gh api / GraphQL merges, on the raw line and on every interpreter text; and the raw `gh … pr …
# merge` pattern on interpreter text only (design D6, finding B2).
API_MERGE=0
RAW_MERGE=0
printf '%s' "$COMMAND" | grep -qE '/pulls/[0-9]+/merge|mergePullRequest|enablePullRequestAutoMerge' && API_MERGE=1
while IFS= read -r t; do
  [[ -n "$t" ]] || continue
  text=$(printf '%s' "$t" | base64 -d 2>/dev/null || true)
  printf '%s' "$text" | grep -qE '/pulls/[0-9]+/merge|mergePullRequest|enablePullRequestAutoMerge' && API_MERGE=1
  printf '%s' "$text" | grep -qE '\bgh(\.exe)?\b.*\bpr\b.*\bmerge\b' && RAW_MERGE=1
done < <(printf '%s' "$PARSE" | jq -r '.rawInterpreterText[]? | @base64')
MERGES=$(printf '%s' "$PARSE" | jq -r '.facts.merges | length')

[[ "$API_MERGE" == "1" || "$RAW_MERGE" == "1" || "$MERGES" != "0" ]] || done_ok

autonomous_run || deny "Merge gate: merges need an autonomous run (KIT_AUTONOMOUS_RUN=\"1\"), set by the author. A background agent with the switch \"0\" does not merge."
[[ "$API_MERGE" == "0" ]] || deny "Merge gate: merging through gh api is not allowed. Use gh pr merge <n> --merge, alone."
[[ "$RAW_MERGE" == "0" ]] || deny "Merge gate: a merge inside interpreter text is not allowed. Run gh pr merge <n> --merge as a plain command."

# Command form.
FORM=$(printf '%s' "$PARSE" | jq -r '
  def short_has($c): any(.[]; test("^-[A-Za-z]+$") and (.[1:] | contains($c)));
  .facts.merges as $m |
  [ (if ($m | length) > 1 then "more than one merge in the line" else empty end),
    (if (.commands | length) > 1 then "gh pr merge must be the only command (nothing chained, piped, backgrounded or on another line)" else empty end),
    (if ((.separators // []) | map(select(. != null)) | length) > 0 then "the line has a separator" else empty end),
    (if $m[0].inSubst or $m[0].inInterp then "the merge is inside a substitution or interpreter text" else empty end),
    (if $m[0].ghAssign then "a GH_* assignment before gh could point the merge elsewhere" else empty end),
    (if ($m[0].positional | length) > 1 then "more than one pull request named" else empty end),
    (if (($m[0].flags | index("--merge")) == null) and (($m[0].flags | short_has("m")) | not) then "use --merge (merge commit)" else empty end),
    ($m[0].flags[] | select(. == "--admin" or . == "--auto" or . == "--squash" or . == "--rebase" or . == "--delete-branch") | "flag \(.) is not allowed"),
    (if $m[0].flags | short_has("s") then "flag -s (squash) is not allowed" else empty end),
    (if $m[0].flags | short_has("r") then "flag -r (rebase) is not allowed" else empty end),
    (if $m[0].flags | short_has("d") then "flag -d (delete branch) is not allowed" else empty end)
  ] | join("; ")')
[[ -z "$FORM" ]] || deny "Merge gate: ${FORM}."

[[ -n "$AUTONOMOUS_MERGE_BASE" ]] || deny "Merge gate: AUTONOMOUS_MERGE_BASE is empty in .claude/sdd-harness.env, so no merge is allowed."

SELECTOR=$(printf '%s' "$PARSE" | jq -r '.facts.merges[0].positional[0] // ""')
REPO=$(printf '%s' "$PARSE" | jq -r '.facts.merges[0].repo // ""')
QCWD=$(printf '%s' "$PARSE" | jq -r '.facts.merges[0].cwd // ""')
QCWD="${QCWD:-$CWD}"

VIEW_ARGS=(pr view)
[[ -n "$SELECTOR" ]] && VIEW_ARGS+=("$SELECTOR")
[[ -n "$REPO" ]] && VIEW_ARGS+=(-R "$REPO")
VIEW_ARGS+=(--json baseRefName,mergeable,changedFiles,files,statusCheckRollup)

TMP=$(mktemp -d)
trap_cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
# Both queries in parallel, in the command's working directory, under one 15 s budget.
(
  cd "$QCWD" 2>/dev/null || exit 3
  timeout 15 gh "${VIEW_ARGS[@]}" > "$TMP/view" 2>/dev/null; echo $? > "$TMP/view.rc"
) &
(
  cd "$QCWD" 2>/dev/null || exit 3
  if [[ -n "$REPO" ]]; then
    GH_REPO="$REPO" timeout 15 gh api "repos/{owner}/{repo}/branches/${AUTONOMOUS_MERGE_BASE}" --jq .protected > "$TMP/prot" 2>/dev/null
  else
    timeout 15 gh api "repos/{owner}/{repo}/branches/${AUTONOMOUS_MERGE_BASE}" --jq .protected > "$TMP/prot" 2>/dev/null
  fi
  echo $? > "$TMP/prot.rc"
) &
wait || true
VIEW_RC=$(cat "$TMP/view.rc" 2>/dev/null || echo 1)
PROT_RC=$(cat "$TMP/prot.rc" 2>/dev/null || echo 1)
VIEW=$(cat "$TMP/view" 2>/dev/null || true)
PROTECTED=$(tr -d '\r\n ' < "$TMP/prot" 2>/dev/null || true)
trap_cleanup

if [[ "$VIEW_RC" != "0" || "$PROT_RC" != "0" ]]; then
  deny "Merge gate: GitHub could not be queried within 15 s (pr view exit ${VIEW_RC}, protection exit ${PROT_RC}), so the merge is denied."
fi
if ! printf '%s' "$VIEW" | jq -e 'type == "object" and (.baseRefName | type == "string") and (.files | type == "array") and (.statusCheckRollup | type == "array")' >/dev/null 2>&1; then
  deny "Merge gate: GitHub's answer could not be read, so the merge is denied."
fi

FAILS=$(printf '%s' "$VIEW" | jq -r --arg base "$AUTONOMOUS_MERGE_BASE" --arg prot "$PROTECTED" '
  [ (if .baseRefName != $base then "the pull request targets \(.baseRefName), not \($base)" else empty end),
    (if (.statusCheckRollup | length) == 0 then "the pull request has no checks" else empty end),
    (.statusCheckRollup[] |
      if has("state") and (.state != null) and ((.status // null) == null) then
        (if .state != "SUCCESS" then "a status check is \(.state)" else empty end)
      elif .status != "COMPLETED" then "a check is still running (\(.status // "unknown"))"
      elif ([.conclusion] | inside(["SUCCESS", "NEUTRAL", "SKIPPED"]) | not) then "a check concluded \(.conclusion)"
      else empty end),
    (if .mergeable != "MERGEABLE" then "GitHub reports the pull request as \(.mergeable)" else empty end),
    (if (.files | length) < (.changedFiles // 0) then "the file list is incomplete (\(.files | length) of \(.changedFiles))" else empty end),
    (if ([.files[].path | select(startswith("openspec/changes/archive/"))] | length) == 0 then "no archived OpenSpec change in the pull request" else empty end),
    ([.files[].path | select(test("^\\.(claude|cursor)/"))] | if length > 0 then "the pull request changes kit configuration (\(join(", ")))" else empty end),
    (if $prot != "true" then "the base branch is not protected on GitHub" else empty end)
  ] | unique | join("; ")')

[[ -z "$FAILS" ]] || deny "Merge gate: ${FAILS}."
TARGET="${SELECTOR:-the pull request of the current branch}"
allow "Merge gate: every condition holds for ${TARGET} into ${AUTONOMOUS_MERGE_BASE}."
