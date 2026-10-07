import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSourcesConfig, resetSourcesConfigCache } from "../src/config.js";

afterEach(() => {
  delete process.env.SOURCES_CONFIG;
  resetSourcesConfigCache();
});

describe("loadSourcesConfig", () => {
  it("falls back to repo sources.yaml when custom path is missing", () => {
    process.env.SOURCES_CONFIG = join(tmpdir(), `truth-missing-${Date.now()}.yaml`);
    const cfg = loadSourcesConfig();
    expect(cfg?.rules?.length).toBeGreaterThan(10);
  });
  it("loads a custom allowlist file", () => {
    const dir = mkdtempSync(join(tmpdir(), "truth-src-"));
    try {
      const p = join(dir, "custom.yaml");
      writeFileSync(
        p,
        "version: 1\nrules:\n  - { match: example-health.gov, tier: 1, baseScore: 99, category: official, reason: custom }\nblockedHosts:\n  - evil-social.com\n"
      );
      process.env.SOURCES_CONFIG = p;
      const cfg = loadSourcesConfig();
      expect(cfg?.rules?.length).toBe(1);
      expect(cfg?.rules?.[0].match).toBe("example-health.gov");
      expect(cfg?.blockedHosts).toContain("evil-social.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("ignores invalid rule entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "truth-src-"));
    try {
      const p = join(dir, "bad.yaml");
      writeFileSync(p, "version: 1\nrules:\n  - { match: good.gov, tier: 1, baseScore: 90, category: official, reason: ok }\n  - { match: 123, tier: 9 }\n");
      process.env.SOURCES_CONFIG = p;
      const cfg = loadSourcesConfig();
      expect(cfg?.rules?.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
