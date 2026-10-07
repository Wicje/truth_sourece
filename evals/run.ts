#!/usr/bin/env tsx
/**
 * Live eval runner (manual, NOT CI-gated — hits real network APIs).
 * Usage: npm run eval:live [-- --json] [--threshold 0.7]
 * Scores verdictFor() against evals/claims.json expectations.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { searchAuthentic } from "../src/providers.js";
import { verdictFor } from "../src/trust.js";

interface ClaimCase {
  claim: string;
  expect: string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const cases: ClaimCase[] = JSON.parse(readFileSync(resolve(here, "claims.json"), "utf8"));
const asJson = process.argv.includes("--json");
const tIdx = process.argv.indexOf("--threshold");
const threshold = tIdx >= 0 ? Number(process.argv[tIdx + 1]) || 0.7 : 0.7;

let pass = 0;
const rows: Array<{ claim: string; verdict: string; confidence: number; expected: string[]; ok: boolean; top: string }> = [];

for (const c of cases) {
  const evidence = await searchAuthentic(c.claim, { limit: 6 });
  const v = verdictFor(evidence);
  const ok = c.expect.includes(v.verdict);
  if (ok) pass++;
  rows.push({
    claim: c.claim.slice(0, 70),
    verdict: v.verdict,
    confidence: v.confidence,
    expected: c.expect,
    ok,
    top: evidence[0]?.url ?? "none",
  });
}

const rate = rows.length ? pass / rows.length : 0;
if (asJson) {
  console.log(JSON.stringify({ pass, total: rows.length, rate, threshold, rows }, null, 2));
} else {
  for (const r of rows) {
    console.log(`${r.ok ? "PASS" : "FAIL"} [${r.verdict} ${r.confidence}%] ${r.claim}\n     top: ${r.top}`);
  }
  console.log(`\n${pass}/${rows.length} passed (rate ${(rate * 100).toFixed(0)}%, threshold ${(threshold * 100).toFixed(0)}%)`);
}
process.exit(rate >= threshold ? 0 : 1);
