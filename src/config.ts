/**
 * Loads sources.yaml (allowlist) so domains can change without code edits.
 * Falls back to built-in defaults in sources.ts when the file is missing/invalid.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { SourceRule } from "./sources.js";

export interface SourcesFile {
  version?: number;
  rules?: SourceRule[];
  blockedHosts?: string[];
}

let cached: SourcesFile | null | undefined;

function candidatePaths(): string[] {
  const fromEnv = process.env.SOURCES_CONFIG?.trim();
  const here = dirname(fileURLToPath(import.meta.url)); // dist/ or src/
  const cwd = process.cwd();
  return [
    ...(fromEnv ? [resolve(cwd, fromEnv)] : []),
    resolve(cwd, "sources.yaml"),
    resolve(here, "../sources.yaml"),
    resolve(here, "../../sources.yaml"),
  ];
}

function isValidRule(r: any): r is SourceRule {
  return (
    r &&
    typeof r.match === "string" &&
    [1, 2, 3].includes(r.tier) &&
    typeof r.baseScore === "number" &&
    typeof r.category === "string" &&
    typeof r.reason === "string"
  );
}

export function loadSourcesConfig(): SourcesFile | null {
  if (cached !== undefined) return cached;
  for (const p of candidatePaths()) {
    try {
      if (!existsSync(p)) continue;
      const raw = readFileSync(p, "utf8");
      const parsed = yaml.load(raw) as SourcesFile;
      if (!parsed || !Array.isArray(parsed.rules)) continue;
      const rules = parsed.rules.filter(isValidRule);
      if (rules.length === 0) continue;
      const blockedHosts = Array.isArray(parsed.blockedHosts)
        ? parsed.blockedHosts.filter((h): h is string => typeof h === "string")
        : undefined;
      cached = { version: parsed.version ?? 1, rules, blockedHosts };
      console.error(`[truth_source] loaded sources config from ${p} (${rules.length} rules)`);
      return cached;
    } catch (err) {
      console.error(`[truth_source] ignoring bad sources config at ${p}:`, (err as Error).message);
    }
  }
  cached = null;
  return null;
}

/** Test hook: clear memoised config (e.g. after setting SOURCES_CONFIG). */
export function resetSourcesConfigCache(): void {
  cached = undefined;
}
