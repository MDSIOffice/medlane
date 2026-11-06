#!/usr/bin/env bash
# Verifies that a JSDoc/type-annotation conversion did not change runtime behaviour.
# For every changed script (public/scripts/*.js, src/*.js) it compiles the git HEAD version and
# the working-tree version with comments stripped, then diffs them. JSDoc-only edits => IDENTICAL.
# Redundant parentheses (from `/** @type */ (x)` casts) and the known helper swaps below are ignored; every other difference is printed
# for review — those are the real code changes (e.g. closestEl(...) swaps, added declarations).
# Usage: npm run check:semantic [-- <git-ref>]   (default ref: HEAD)
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-HEAD}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/b_src" "$TMP/a_src"
FILES=$( { git diff --name-only "$REF" -- public/scripts src/*.js; git ls-files --others --exclude-standard -- public/scripts src/*.js; } | grep '\.js$' | grep -v '/vendor/' | sort -u || true)
[ -z "$FILES" ] && { echo "No changed scripts."; exit 0; }
for f in $FILES; do
  n="$(echo "$f" | tr / _)"
  git show "$REF:$f" > "$TMP/b_src/$n" 2>/dev/null || : > "$TMP/b_src/$n"
  cp "$f" "$TMP/a_src/$n"
done
emit() { npx tsc --ignoreConfig --allowJs --removeComments --target ESNext --skipLibCheck --outDir "$2" "$1"/*.js >/dev/null 2>&1 || true; }
emit "$TMP/b_src" "$TMP/b"; emit "$TMP/a_src" "$TMP/a"
# Known behaviour-preserving helper swaps are folded back to the original call shape before diffing:
#   closestEl(x, sel) == x.closest(sel);  qsIn(root, sel) == root.querySelector(sel);  .getTime() on Date math.
norm() { sed -E 's/closestEl\(([A-Za-z_.]+), /\1.closest(/g; s/qsIn\(([A-Za-z_.]+), /\1.querySelector(/g; s/qsaIn\(([A-Za-z_.]+), /\1.querySelectorAll(/g; s/\.getTime\(\)//g; s/[()]//g' "$1"; }
status=0
for f in $FILES; do
  n="$(echo "$f" | tr / _)"
  if [ ! -s "$TMP/a/$n" ]; then echo "ERROR    $f (failed to compile)"; status=1; continue; fi
  if cmp -s "$TMP/b/$n" "$TMP/a/$n"; then echo "IDENTICAL $f"; continue; fi
  d=$(diff -a <(norm "$TMP/b/$n") <(norm "$TMP/a/$n") || true)
  if [ -z "$d" ]; then echo "IDENTICAL $f (only redundant parentheses from casts)"; else
    echo "CHANGED   $f — review these runtime differences:"; echo "$d" | grep -a '^[<>]' | cut -c1-220 | sed 's/^/    /'; fi
done
exit $status
