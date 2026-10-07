import { describe, expect, it } from "vitest";
import { independentTier1Hosts, verdictFor, type Evidence } from "../src/trust.js";
import { cacheGet, cacheKey, cacheSet, extractQuotes, sanitizeQuery } from "../src/providers.js";

function ev(url: string, score: number, tier: number): Evidence {
  return { title: url, url, snippet: "", source: "test", trustScore: score, tier, trustReason: "" };
}

describe("independentTier1Hosts", () => {
  it("counts hosts, not URLs", () => {
    const list = [ev("https://pubmed.ncbi.nlm.nih.gov/1/", 90, 1), ev("https://pubmed.ncbi.nlm.nih.gov/2/", 91, 1)];
    expect(independentTier1Hosts(list).size).toBe(1);
    expect(verdictFor(list).verdict).not.toBe("verified");
  });
  it("verifies with two independent Tier-1 hosts", () => {
    const list = [ev("https://www.cdc.gov/a", 96, 1), ev("https://www.nih.gov/b", 99, 1)];
    expect(independentTier1Hosts(list).size).toBe(2);
    expect(verdictFor(list).verdict).toBe("verified");
  });
  it("marks empty evidence unverified", () => {
    expect(verdictFor([]).verdict).toBe("unverified");
  });
});

describe("sanitizeQuery + cache + quotes", () => {
  it("caps query length", () => {
    expect(sanitizeQuery("  hello   world  ").length).toBeLessThanOrEqual(300);
    expect(sanitizeQuery("a".repeat(500)).length).toBe(300);
  });
  it("round-trips cache", () => {
    const k = cacheKey("Test Query Cache", 5, false);
    expect(cacheGet(k)).toBeNull();
    cacheSet(k, [ev("https://www.cdc.gov/a", 96, 1)]);
    expect(cacheGet(k)?.length).toBe(1);
  });
  it("extracts quotes containing keywords", () => {
    const html = "<html><body><p>Malaria vaccines train the immune system against parasites. ".repeat(5) + "Malaria vaccine efficacy was shown in clinical trials.</p></body></html>";
    const q = extractQuotes(html, "malaria vaccine efficacy");
    expect(q.length).toBeGreaterThan(0);
    expect(q[0].toLowerCase()).toContain("malaria");
  });
});
