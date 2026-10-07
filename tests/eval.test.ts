import { describe, expect, it } from "vitest";
import { corroborationBonus, scoreEvidence, verdictFor, type Evidence } from "../src/trust.js";

function ev(url: string, score: number, tier: number, extra: Partial<Evidence> = {}): Evidence {
  return { title: url, url, snippet: "", source: "test", trustScore: score, tier, trustReason: "", ...extra };
}

describe("verdict eval matrix (mirrors evals/claims.json intent)", () => {
  it("1. two independent Tier-1 hosts verify", () => {
    expect(verdictFor([ev("https://www.cdc.gov/a", 96, 1), ev("https://www.nih.gov/b", 99, 1)]).verdict).toBe("verified");
  });
  it("2. same host twice is not independent", () => {
    expect(verdictFor([ev("https://pubmed.ncbi.nlm.nih.gov/1/", 90, 1), ev("https://pubmed.ncbi.nlm.nih.gov/2/", 91, 1)]).verdict).toBe("partially-supported");
  });
  it("3. single exceptional Tier-1 source verifies via top-score rule", () => {
    expect(verdictFor([ev("https://www.cdc.gov/a", 99, 1)]).verdict).toBe("verified");
  });
  it("4. single ordinary Tier-1 is partial", () => {
    expect(verdictFor([ev("https://www.cdc.gov/a", 96, 1)]).verdict).toBe("partially-supported");
  });
  it("5. Tier-1 plus Tier-2 mix stays partial without strong scores", () => {
    const v = verdictFor([ev("https://example.gov/a", 88, 1), ev("https://en.wikipedia.org/wiki/X", 86, 2)]);
    expect(v.verdict).toBe("partially-supported");
  });
  it("6. encyclopedic Tier-2 alone is partial, never verified", () => {
    expect(verdictFor([ev("https://en.wikipedia.org/wiki/X", 86, 2)]).verdict).toBe("partially-supported");
  });
  it("7. weak Tier-2 alone is disputed", () => {
    expect(verdictFor([ev("https://example.edu/x", 70, 2)]).verdict).toBe("disputed");
  });
  it("8. wire Tier-3 alone is disputed", () => {
    expect(verdictFor([ev("https://www.reuters.com/x", 76, 3)]).verdict).toBe("disputed");
  });
  it("9. no evidence is unverified", () => {
    expect(verdictFor([]).verdict).toBe("unverified");
  });
  it("10. unknown domains are unverified", () => {
    expect(verdictFor([ev("https://randomblog123.com/x", 20, 0)]).verdict).toBe("unverified");
  });
  it("11. blocked social is unverified", () => {
    expect(verdictFor([ev("https://x.com/u/1", 0, 0)]).verdict).toBe("unverified");
  });
  it("12. quotes are mentioned in verified explanations", () => {
    const v = verdictFor([
      ev("https://www.cdc.gov/a", 96, 1, { quote: "Vaccines train the immune system against pathogens effectively in trials." }),
      ev("https://www.nih.gov/b", 99, 1, { quote: "Clinical data show strong efficacy across diverse populations studied." }),
    ]);
    expect(v.verdict).toBe("verified");
    expect(v.explanation).toContain("direct quotes");
  });
  it("13. citations boost scholarly scores", () => {
    expect(scoreEvidence("https://doi.org/10.1/x", 1000).score).toBeGreaterThan(90);
  });
  it("14. very old papers take a recency penalty", () => {
    expect(scoreEvidence("https://doi.org/10.1/x", 0, 1900).score).toBe(87);
  });
  it("15. corroboration bonus scales with independence", () => {
    expect(corroborationBonus([ev("https://a.gov/1", 96, 1), ev("https://b.gov/2", 96, 1)])).toBe(8);
    expect(corroborationBonus([ev("https://a.gov/1", 96, 1), ev("https://en.wikipedia.org/x", 86, 2)])).toBe(4);
    expect(corroborationBonus([ev("https://en.wikipedia.org/x", 86, 2)])).toBe(0);
  });
  it("16. verified confidence never exceeds 95", () => {
    const v = verdictFor([ev("https://a.gov/1", 100, 1), ev("https://b.gov/2", 100, 1)]);
    expect(v.verdict).toBe("verified");
    expect(v.confidence).toBeLessThanOrEqual(95);
  });
  it("17. two weak Tier-1 hosts stay partial", () => {
    expect(verdictFor([ev("https://a.gov/1", 80, 1), ev("https://b.gov/2", 81, 1)]).verdict).toBe("partially-supported");
  });
  it("18. two strong Tier-1 hosts verify at max confidence", () => {
    const v = verdictFor([ev("https://a.gov/1", 95, 1), ev("https://b.gov/2", 95, 1)]);
    expect(v.verdict).toBe("verified");
    expect(v.confidence).toBe(95);
  });
  it("19. Tier-1 plus wire is partial", () => {
    expect(verdictFor([ev("https://www.cdc.gov/a", 96, 1), ev("https://www.reuters.com/x", 76, 3)]).verdict).toBe("partially-supported");
  });
  it("20. secondary-only mix is disputed", () => {
    expect(verdictFor([ev("https://www.reuters.com/x", 76, 3), ev("https://example.edu/y", 70, 2)]).verdict).toBe("disputed");
  });
});
