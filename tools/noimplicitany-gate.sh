#!/usr/bin/env bash
# Per-file ratchet for noImplicitAny: the flag is off globally, but every file listed in
# tools/noimplicitany-files.txt must report zero implicit-any errors. Fails if any listed file regresses.
cd "$(dirname "$0")/.."
FILES=$(grep -v '^\s*#' tools/noimplicitany-files.txt | grep -v '^\s*$')
OUT=$( { npx tsc -p tsconfig.json --noImplicitAny; npx tsc -p tsconfig.worker.json --noImplicitAny; } 2>&1 | grep 'error TS' || true)
FAIL=0
for f in $FILES; do
  HITS=$(printf '%s\n' "$OUT" | grep -F "$f(" || true)
  if [ -n "$HITS" ]; then echo "$HITS"; FAIL=1; fi
done
[ $FAIL -eq 0 ] && echo "noImplicitAny gate: OK ($(echo "$FILES" | wc -l | tr -d ' ') files)"
exit $FAIL
