#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-artifacts.sh — rebuilds the references from .claude and .cursor to ai-specs.
#
# ai-specs/ is the canonical source. This script tries to link with symlinks and,
# when the platform does not allow them (Windows without developer mode), copies.
#
#   bash .claude/sync-artifacts.sh            link or copy whatever is missing
#   bash .claude/sync-artifacts.sh --check    report only, change nothing
#   bash .claude/sync-artifacts.sh --force    overwrite copies that diverge
#
# Entries under .claude/.cursor that are not in ai-specs/:
#   KEEP    — OpenSpec native skills (openspec-*), from `openspec init`. Do not delete.
#   ORPHAN  — anything else. Real drift; the human decides.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

CHECK=0; FORCE=0
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;;
    --force) FORCE=1 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

[[ -d ai-specs ]] || { echo "No ai-specs/ directory: nothing to sync." >&2; exit 1; }

linked=0; copied=0; ok=0; conflicts=0; orphans=0; keep=0

is_os_junk() {
  case "$(basename "$1")" in
    [Dd][Ee][Ss][Kk][Tt][Oo][Pp].[Ii][Nn][Ii]|[Tt][Hh][Uu][Mm][Bb][Ss].[Dd][Bb]|.DS_Store|.ds_store) return 0 ;;
    *) return 1 ;;
  esac
}

strip_os_junk() {
  [[ -e "$1" ]] || return 0
  find "$1" -type f \( -iname 'desktop.ini' -o -iname 'Thumbs.db' -o -name '.DS_Store' \) -delete 2>/dev/null || true
}

# OpenSpec init writes openspec-* skills into .claude/skills and .cursor/skills.
# The kit's openspec-implement lives in ai-specs, so it never hits this branch.
is_expected_foreign() {
  local kind="$1" name="$2"
  [[ "$kind" == "skills" ]] || return 1
  case "$name" in
    openspec-*) return 0 ;;
  esac
  return 1
}

report() { printf '  %-8s %s\n' "$1" "$2"; }

sync_one() {
  local src="$1" dst="$2"
  # Existing symlink
  if [[ -L "$dst" ]]; then
    if [[ -e "$dst" ]]; then ok=$((ok+1)); return; fi
    [[ $CHECK -eq 1 ]] && { report "BROKEN" "$dst"; return; }
    rm -f "$dst"
  fi
  # A materialised symlink: small text file containing a relative path (Windows checkout)
  if [[ -f "$dst" && ! -d "$src" ]] || { [[ -f "$dst" ]] && [[ -d "$src" ]]; }; then
    if [[ $(wc -c < "$dst" 2>/dev/null || echo 999) -lt 200 ]] && grep -qE '^\.\./' "$dst" 2>/dev/null; then
      [[ $CHECK -eq 1 ]] && { report "TEXT" "$dst (materialised symlink)"; return; }
      rm -f "$dst"
    fi
  fi
  # Real existing copy
  if [[ -e "$dst" && ! -L "$dst" ]]; then
    if diff -rq -x 'desktop.ini' -x 'Thumbs.db' -x '.DS_Store' "$src" "$dst" >/dev/null 2>&1; then ok=$((ok+1)); return; fi
    if [[ $FORCE -eq 0 ]]; then
      report "DIVERGES" "$dst — differs from ai-specs. Use --force to overwrite, or move your change into ai-specs/"
      conflicts=$((conflicts+1)); return
    fi
    [[ $CHECK -eq 1 ]] && { report "STALE" "$dst"; return; }
    rm -rf "$dst"
  fi
  [[ $CHECK -eq 1 ]] && { report "MISSING" "$dst"; return; }
  mkdir -p "$(dirname "$dst")"
  # Relative path from the link directory to ai-specs
  local depth rel
  depth=$(printf '%s' "${dst%/*}" | tr -cd '/' | wc -c)
  rel=$(printf '../%.0s' $(seq 1 $((depth+1))))
  if ln -s "${rel}${src}" "$dst" 2>/dev/null; then
    linked=$((linked+1))
  else
    cp -r "$src" "$dst"
    strip_os_junk "$dst"
    copied=$((copied+1))
  fi
}

echo "Syncing artifacts from ai-specs/"
for tool in .claude .cursor; do
  for kind in skills agents; do
    [[ -d "ai-specs/$kind" ]] || continue
    mkdir -p "$tool/$kind"
    for entry in ai-specs/"$kind"/*; do
      [[ -e "$entry" ]] || continue
      is_os_junk "$entry" && continue
      sync_one "$entry" "$tool/$kind/$(basename "$entry")"
    done
    # References whose source is not in ai-specs: KEEP (OpenSpec) or ORPHAN
    for ref in "$tool/$kind"/*; do
      [[ -e "$ref" || -L "$ref" ]] || continue
      is_os_junk "$ref" && continue
      name="$(basename "$ref")"
      if [[ ! -e "ai-specs/$kind/$name" ]]; then
        if is_expected_foreign "$kind" "$name"; then
          report "KEEP" "$ref — OpenSpec native skill (does not live in ai-specs/; do not delete)"
          keep=$((keep+1))
        else
          report "ORPHAN" "$ref — not present in ai-specs/$kind/"
          orphans=$((orphans+1))
        fi
      fi
    done
  done
done

printf '\n  linked %d · copied %d · ok %d · diverging %d · orphans %d · keep %d\n' \
  "$linked" "$copied" "$ok" "$conflicts" "$orphans" "$keep"

if [[ $copied -gt 0 ]]; then
  echo
  echo "  This platform does not allow symlinks, so copies were made."
  echo "  Always edit ai-specs/ and re-run this script to propagate."
fi
if [[ $keep -gt 0 ]]; then
  echo
  echo "  KEEP = OpenSpec native skills (openspec init). They do not live in ai-specs/. Do not delete them."
fi
[[ $conflicts -gt 0 || $orphans -gt 0 ]] && exit 1
exit 0
