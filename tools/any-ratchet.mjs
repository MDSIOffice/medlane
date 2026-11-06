#!/usr/bin/env node
// Stops new `any` from creeping in. Counts explicit `any` in JSDoc types and .d.ts files, plus
// @ts-ignore / @ts-expect-error / @ts-nocheck, per file, and fails if a file goes above its baseline.
// A file missing from the baseline has a baseline of 0, so new files must start clean.
//   node tools/any-ratchet.mjs            check
//   node tools/any-ratchet.mjs --update   lock in reductions (refuses to raise a count)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "tools/any-baseline.json");
const DIRS = [["public/scripts", ".js"], ["src", ".js"], ["types", ".d.ts"]];

const anyIn = (text) => (text.match(/\bany\b/g) || []).length;

/** Counts `any` inside the {type} of each JSDoc tag, so prose like "any line" is ignored. */
export function countJs(source) {
  let count = (source.match(/@ts-(ignore|expect-error|nocheck)\b/g) || []).length;
  for (const [comment] of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    for (const tag of comment.matchAll(/@[a-zA-Z]+\s*\{/g)) {
      let depth = 1;
      let i = tag.index + tag[0].length;
      const start = i;
      while (i < comment.length && depth > 0) {
        if (comment[i] === "{") depth += 1;
        else if (comment[i] === "}") depth -= 1;
        i += 1;
      }
      count += anyIn(comment.slice(start, i - 1));
    }
  }
  return count;
}

export function countDts(source) {
  return anyIn(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""));
}

function measure() {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const [dir, ext] of DIRS) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (!name.endsWith(ext)) continue;
      const path = join(ROOT, dir, name);
      const source = readFileSync(path, "utf8");
      counts[relative(ROOT, path)] = ext === ".d.ts" ? countDts(source) : countJs(source);
    }
  }
  return counts;
}

const counts = measure();
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
const total = (map) => Object.values(map).reduce((sum, n) => sum + n, 0);
const raised = baseline ? Object.keys(counts).filter((file) => counts[file] > (baseline[file] ?? 0)) : [];

if (process.argv.includes("--update")) {
  if (raised.length) {
    for (const file of raised) console.error(`REFUSED ${file}: ${baseline[file] ?? 0} -> ${counts[file]}. Remove the new any instead of raising the baseline.`);
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify(Object.fromEntries(Object.entries(counts).sort()), null, 2)}\n`);
  console.log(`any baseline written: ${total(counts)} total`);
  process.exit(0);
}

if (!baseline) {
  console.error("No tools/any-baseline.json. Create it with: node tools/any-ratchet.mjs --update");
  process.exit(1);
}
if (raised.length) {
  for (const file of raised) console.error(`${file}: any count went up, ${baseline[file] ?? 0} -> ${counts[file]}. Use a real type.`);
  process.exit(1);
}
const lowered = Object.keys(counts).filter((file) => counts[file] < (baseline[file] ?? 0));
for (const file of lowered) console.log(`${file}: down ${baseline[file]} -> ${counts[file]}. Lock it in with: npm run check:any -- --update`);
console.log(`any ratchet: OK (${total(counts)} total)`);
