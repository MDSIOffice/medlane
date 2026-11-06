#!/usr/bin/env bash
# Shows how many type errors each still-disabled strict flag would produce, so the next flag to
# turn on is easy to pick. Usage: bash tools/strict-progress.sh
cd "$(dirname "$0")/.."
printf "%-28s %8s %8s\n" flag browser worker
for f in useUnknownInCatchVariables noImplicitAny; do
  b=$(npx tsc -p tsconfig.json --$f 2>&1 | grep -c 'error TS')
  w=$(npx tsc -p tsconfig.worker.json --$f 2>&1 | grep -c 'error TS')
  printf "%-28s %8s %8s\n" "$f" "$b" "$w"
done
