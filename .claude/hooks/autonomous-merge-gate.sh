#!/usr/bin/env bash
# PreToolUse (Bash) — merge gate (openspec change autonomous-run-switch, design D4).
# In an autonomous run (KIT_AUTONOMOUS_RUN="1") the agent may merge its pull request only when
# deterministic conditions read from GitHub hold: base, checks, mergeable, complete file list,
# archived change, no kit configuration, protected base. In unattended mode without the switch (a
# Cursor background agent) every merge is denied. Outside unattended mode it stays silent.
# A denial names every condition that failed: the form, the configuration and GitHub's state are
# all evaluated, and when a stage makes a later one impossible the reason says so.
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
# merge` pattern on interpreter text only (design D6, finding B2). The raw pattern runs per line
# (unbounded, as before) and over the whole text with line breaks joined, so a merge split across
# lines is caught; there the gaps between the words are bounded so distant prose does not match.
# Every text is matched in one jq process (finding: one process per text let a long line outlast the
# 60 s hook timeout). Above MAX_TEXTS texts or MAX_TEXT_CHARS characters the line is denied unread.
MAX_TEXTS=100
MAX_TEXT_CHARS=200000
# The hook timeout is 60 s: past this many seconds the gate denies instead of starting more work.
TIME_GUARD=40
too_slow() {
  (( SECONDS < TIME_GUARD )) || deny "Merge gate: the line is too costly to check (${SECONDS} s spent, the hook timeout is 60 s), so it is denied; run gh pr merge <n> --merge alone."
}
MATCH=$(printf '%s' "$PARSE" | jq -r --argjson maxn "$MAX_TEXTS" --argjson maxc "$MAX_TEXT_CHARS" '
  def api: test("/pulls/[0-9]+/merge|mergePullRequest|enablePullRequestAutoMerge");
  [.rawInterpreterText[]? | strings] as $t |
  if ($t | length) > $maxn or ($t | map(length) | add // 0) > $maxc then
    "costly \($t | length) \($t | map(length) | add // 0)"
  else
    [ ((.facts.merges // []) | length),
      (if ($t | any(api)) then 1 else 0 end),
      (if ($t | any(test("\\bgh(\\.exe)?\\b.*\\bpr\\b.*\\bmerge\\b") or (gsub("[\r\n]"; " ") | test("\\bgh(\\.exe)?\\b.{0,120}\\bpr\\b.{0,120}\\bmerge\\b")))) then 1 else 0 end)
    ] | "ok \(join(" "))"
  end')
if [[ "$MATCH" == costly* ]]; then
  read -r _ n c <<< "$MATCH"
  deny "Merge gate: the line is too costly to check (${n} interpreter texts, ${c} characters; at most ${MAX_TEXTS} texts and ${MAX_TEXT_CHARS} characters), so it is denied in unattended mode; split it into shorter commands."
fi
read -r _ MERGES API_MERGE RAW_MERGE <<< "$MATCH"
[[ "$MERGES" =~ ^[0-9]+$ && "$API_MERGE" =~ ^[01]$ && "$RAW_MERGE" =~ ^[01]$ ]] || deny "Merge gate: the line could not be checked for merges, so it is denied."
printf '%s' "$COMMAND" | grep -qE '/pulls/[0-9]+/merge|mergePullRequest|enablePullRequestAutoMerge' && API_MERGE=1
too_slow

[[ "$API_MERGE" == "1" || "$RAW_MERGE" == "1" || "$MERGES" != "0" ]] || done_ok

autonomous_run || deny "Merge gate: merges need an autonomous run (KIT_AUTONOMOUS_RUN=\"1\"), set by the author. A background agent with the switch \"0\" does not merge."

FAILED=()
deny_failed() {
  local joined="" f
  for f in "${FAILED[@]}"; do joined="${joined:+$joined; }$f"; done
  deny "Merge gate: ${joined}."
}
[[ "$API_MERGE" == "0" ]] || FAILED+=("merging through gh api is not allowed (use gh pr merge <n> --merge, alone)")
[[ "$RAW_MERGE" == "0" ]] || FAILED+=("a merge inside interpreter text is not allowed (run gh pr merge <n> --merge as a plain command)")
[[ "$MERGES" != "0" ]] || deny_failed

# Command form. A long flag is compared by its name before `=` (`--admin=true` is `--admin`);
# `--merge=<v>` counts as --merge only when gh reads <v> as true. Short flags may carry `=value`.
FORM=$(printf '%s' "$PARSE" | jq -r '
  def fname: sub("=.*$"; "");
  def truthy: (contains("=") | not) or (sub("^[^=]*="; "") | test("^(1|t|T|true|TRUE|True)$"));
  def short_has($c): any(.[]; test("^-[A-Za-z]+(=.*)?$") and (fname | .[1:] | contains($c)));
  .facts.merges as $m |
  [ (if ($m | length) > 1 then "more than one merge in the line" else empty end),
    (if (.commands | length) > 1 then "gh pr merge must be the only command (nothing chained, piped, backgrounded or on another line)" else empty end),
    (if ((.separators // []) | map(select(. != null)) | length) > 0 then "the line has a separator" else empty end),
    (if $m[0].inSubst or $m[0].inInterp then "the merge is inside a substitution or interpreter text" else empty end),
    (if $m[0].ghAssign then "a GH_* assignment before gh could point the merge elsewhere" else empty end),
    (if ($m[0].positional | length) > 1 then "more than one pull request named" else empty end),
    (if (any($m[0].flags[]; fname == "--merge" and truthy) | not) and (($m[0].flags | short_has("m")) | not) then "use --merge (merge commit)" else empty end),
    ($m[0].flags[] | fname | select(. == "--admin" or . == "--auto" or . == "--squash" or . == "--rebase" or . == "--delete-branch") | "flag \(.) is not allowed"),
    (if $m[0].flags | short_has("s") then "flag -s (squash) is not allowed" else empty end),
    (if $m[0].flags | short_has("r") then "flag -r (rebase) is not allowed" else empty end),
    (if $m[0].flags | short_has("d") then "flag -d (delete branch) is not allowed" else empty end)
  ] | join("; ")')
[[ -z "$FORM" ]] || FAILED+=("$FORM")

[[ -n "$AUTONOMOUS_MERGE_BASE" ]] || FAILED+=("AUTONOMOUS_MERGE_BASE is empty in .claude/sdd-harness.env, so no merge is allowed and the base branch and its protection are not checked")

# Several merges or several pull requests: there is no single pull request to read from GitHub.
if [[ "$(printf '%s' "$PARSE" | jq -r '(.facts.merges | length) > 1 or (.facts.merges[0].positional | length) > 1')" == "true" ]]; then
  FAILED+=("GitHub's state was not checked because the target pull request is unclear")
  deny_failed
fi

SELECTOR=$(printf '%s' "$PARSE" | jq -r '.facts.merges[0].positional[0] // ""')
REPO=$(printf '%s' "$PARSE" | jq -r '.facts.merges[0].repo // ""')
QCWD=$(printf '%s' "$PARSE" | jq -r '.facts.merges[0].cwd // ""')
QCWD="${QCWD:-$CWD}"

# The protection checked is that of the pull request's own base (spec: "the base branch is
# protected on GitHub" for that pull request). A URL selector names its repository, and gh pr view /
# gh pr merge follow the URL whatever the cwd or -R, so the protection query follows it too.
PROT_REPO="$REPO"
if [[ "$SELECTOR" =~ ^https?://([^/]+)/([^/]+)/([^/]+)/pull/[0-9]+ ]]; then
  url_host="${BASH_REMATCH[1],,}"
  if [[ "$url_host" == "github.com" || "$url_host" == "www.github.com" ]]; then
    PROT_REPO="${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
  else
    PROT_REPO="${url_host}/${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
  fi
fi

VIEW_ARGS=(pr view)
[[ -n "$SELECTOR" ]] && VIEW_ARGS+=("$SELECTOR")
[[ -n "$REPO" ]] && VIEW_ARGS+=(-R "$REPO")
VIEW_ARGS+=(--json baseRefName,mergeable,changedFiles,files,statusCheckRollup)

# gh pr view lists files by their new path only, so a rename out of (or a removal from) the kit
# configuration is invisible there. The REST file list gives previous_filename and status; its --jq
# filter, applied by gh to every page, prints "true" for a page that touches no kit path, or the kit
# paths it touches (old and new names, case-insensitive).
FILES_JQ='[.[] | (.filename, (.previous_filename // empty)) | strings | select(ascii_downcase | test("^\\.(claude|cursor)/"))] | if length == 0 then "true" else "kit " + join(", ") end'
PR_NUMBER=""
if [[ "$SELECTOR" =~ ^#?([0-9]+)$ ]]; then
  PR_NUMBER="${BASH_REMATCH[1]}"
elif [[ "$SELECTOR" =~ ^https?://[^/]+/[^/]+/[^/]+/pull/([0-9]+) ]]; then
  PR_NUMBER="${BASH_REMATCH[1]}"
fi
NUMBER_ARGS=(pr view)
[[ -n "$SELECTOR" ]] && NUMBER_ARGS+=("$SELECTOR")
[[ -n "$REPO" ]] && NUMBER_ARGS+=(-R "$REPO")
NUMBER_ARGS+=(--json number --jq .number)

too_slow
TMP=$(mktemp -d)
trap_cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
# The three queries in parallel, in the command's working directory, under one 15 s budget. Without
# a base there is no branch whose protection could be read, so that query is skipped. A branch or
# empty selector needs the pull request's number first, inside the same budget.
QSTART=$SECONDS
(
  cd "$QCWD" 2>/dev/null || exit 3
  n="$PR_NUMBER"
  if [[ -z "$n" ]]; then
    n=$(timeout 15 gh "${NUMBER_ARGS[@]}" 2>/dev/null | tr -d '\r\n ') || n=""
  fi
  left=$(( 15 - (SECONDS - QSTART) ))
  if [[ ! "$n" =~ ^[0-9]+$ ]]; then
    echo 4 > "$TMP/files.rc"
  elif (( left < 1 )); then
    echo 124 > "$TMP/files.rc"
  elif [[ -n "$PROT_REPO" ]]; then
    GH_REPO="$PROT_REPO" timeout "$left" gh api "repos/{owner}/{repo}/pulls/${n}/files" --paginate --jq "$FILES_JQ" > "$TMP/files" 2>/dev/null
    echo $? > "$TMP/files.rc"
  else
    timeout "$left" gh api "repos/{owner}/{repo}/pulls/${n}/files" --paginate --jq "$FILES_JQ" > "$TMP/files" 2>/dev/null
    echo $? > "$TMP/files.rc"
  fi
) &
(
  cd "$QCWD" 2>/dev/null || exit 3
  timeout 15 gh "${VIEW_ARGS[@]}" > "$TMP/view" 2>/dev/null; echo $? > "$TMP/view.rc"
) &
(
  cd "$QCWD" 2>/dev/null || exit 3
  if [[ -z "$AUTONOMOUS_MERGE_BASE" ]]; then
    : > "$TMP/prot"
  elif [[ -n "$PROT_REPO" ]]; then
    GH_REPO="$PROT_REPO" timeout 15 gh api "repos/{owner}/{repo}/branches/${AUTONOMOUS_MERGE_BASE}" --jq .protected > "$TMP/prot" 2>/dev/null
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
FILES_RC=$(cat "$TMP/files.rc" 2>/dev/null || echo 1)
FILES=$(tr -d '\r' < "$TMP/files" 2>/dev/null || true)
trap_cleanup

if [[ "$VIEW_RC" != "0" || "$PROT_RC" != "0" || "$FILES_RC" != "0" ]]; then
  FAILED+=("GitHub could not be queried within 15 s (pr view exit ${VIEW_RC}, protection exit ${PROT_RC}, file list exit ${FILES_RC}), so the pull request's state was not checked")
  deny_failed
fi
too_slow
# Every page answered "true" or named the kit paths it touches; anything else (or no page) is unread.
KIT_TOUCHED=$(printf '%s\n' "$FILES" | jq -R -s -r '
  [split("\n")[] | select(. != "")] as $l |
  if ($l | length) == 0 or ($l | any(. != "true" and (startswith("kit ") | not))) then "unread"
  else [$l[] | select(startswith("kit ")) | .[4:]] | join(", ") end')
if [[ "$KIT_TOUCHED" == "unread" ]]; then
  FAILED+=("GitHub's file list (renames and removals) could not be read, so the pull request's kit configuration was not checked")
elif [[ -n "$KIT_TOUCHED" ]]; then
  FAILED+=("the pull request renames, removes or changes kit configuration (${KIT_TOUCHED})")
fi
if ! printf '%s' "$VIEW" | jq -e 'type == "object" and (.baseRefName | type == "string") and (.files | type == "array") and (.statusCheckRollup | type == "array")' >/dev/null 2>&1; then
  FAILED+=("GitHub's answer could not be read, so the pull request's state was not checked")
  deny_failed
fi

STATE=$(printf '%s' "$VIEW" | jq -r --arg base "$AUTONOMOUS_MERGE_BASE" --arg prot "$PROTECTED" '
  [ (if $base != "" and .baseRefName != $base then "the pull request targets \(.baseRefName), not \($base)" else empty end),
    (if (.statusCheckRollup | length) == 0 then "the pull request has no checks" else empty end),
    (.statusCheckRollup[] |
      if has("state") and (.state != null) and ((.status // null) == null) then
        (if .state != "SUCCESS" then "a status check is \(.state)" else empty end)
      elif .status != "COMPLETED" then "a check is still running (\(.status // "unknown"))"
      elif ([.conclusion] | inside(["SUCCESS", "NEUTRAL", "SKIPPED"]) | not) then "a check concluded \(.conclusion)"
      else empty end),
    (if .mergeable != "MERGEABLE" then "GitHub reports the pull request as \(.mergeable)" else empty end),
    (if (.changedFiles | type) != "number" then "the file list cannot be checked (GitHub gave no changed-files count)"
     elif (.files | length) < .changedFiles then "the file list is incomplete (\(.files | length) of \(.changedFiles))"
     else empty end),
    (if ([.files[].path | select(startswith("openspec/changes/archive/"))] | length) == 0 then "no archived OpenSpec change in the pull request" else empty end),
    ([.files[].path | select(ascii_downcase | test("^\\.(claude|cursor)/"))] | if length > 0 then "the pull request changes kit configuration (\(join(", ")))" else empty end),
    (if $base != "" and $prot != "true" then "the base branch is not protected on GitHub" else empty end)
  ] | unique | join("; ")')
[[ -z "$STATE" ]] || FAILED+=("$STATE")

[[ ${#FAILED[@]} -eq 0 ]] || deny_failed
TARGET="${SELECTOR:-the pull request of the current branch}"
allow "Merge gate: every condition holds for ${TARGET} into ${AUTONOMOUS_MERGE_BASE}."
