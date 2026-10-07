import { getSourceTrust } from "./sources.js";

export interface Evidence {
  title: string;
  url: string;
  snippet: string;
  source: string; // provider: wikipedia | openalex | crossref | pubmed | arxiv | semanticscholar | tavily | brave
  trustScore: number;
  tier: number;
  trustReason: string;
  citations?: number;
  year?: number;
  quote?: string; // verbatim quote extracted from the source page (when available)
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return url;
  }
}

/** Distinct independent hosts at Tier 1 (two URLs on one host count once). */
export function independentTier1Hosts(evidences: Evidence[]): Set<string> {
  return new Set(evidences.filter((e) => e.tier === 1).map((e) => hostOf(e.url)));
}

export function scoreEvidence(url: string, citations = 0, year?: number): { score: number; tier: number; reason: string } {
  const t = getSourceTrust(url);
  if (!t.trusted) return { score: t.score, tier: 0, reason: t.reason };
  let score = t.score;
  // citation boost (scholarly): log scale, max +5
  if (citations > 0) score += Math.min(5, Math.log10(citations + 1) * 2);
  // recency: slight penalty for >15y old science claims, but not for history
  const now = new Date().getFullYear();
  if (year && now - year > 15) score -= 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tier: t.tier, reason: t.reason };
}

/** Corroboration: +8 if 2+ independent Tier-1 hosts agree, +4 for Tier1+Tier2 mix. */
export function corroborationBonus(evidences: Evidence[]): number {
  const t1Hosts = independentTier1Hosts(evidences);
  const hasT2 = evidences.some((e) => e.tier === 2);
  if (t1Hosts.size >= 2) return 8;
  if (t1Hosts.size >= 1 && hasT2) return 4;
  return 0;
}

export type Verdict = "verified" | "partially-supported" | "disputed" | "unverified";

export function verdictFor(evidences: Evidence[]): { verdict: Verdict; confidence: number; explanation: string } {
  const trusted = evidences.filter((e) => e.trustScore >= 65);
  if (trusted.length === 0)
    return { verdict: "unverified", confidence: 10, explanation: "No authentic (Tier 1/2/3) source found. Do not state as fact." };
  const bonus = corroborationBonus(trusted);
  const top = Math.max(...trusted.map((e) => e.trustScore)) + bonus;
  const t1Hosts = independentTier1Hosts(trusted);
  const quoted = trusted.filter((e) => e.quote && e.quote.length > 40).length;

  if ((t1Hosts.size >= 2 && top >= 90) || top >= 98)
    return {
      verdict: "verified",
      confidence: Math.min(95, top),
      explanation: `${t1Hosts.size} independent Tier-1 hosts corroborate${quoted > 0 ? ` (${quoted} with direct quotes)` : ""}. Citable as fact with citations.`,
    };
  if (t1Hosts.size >= 1 || top >= 80)
    return { verdict: "partially-supported", confidence: Math.min(80, top), explanation: "Supported by at least one authentic source but needs a second independent Tier-1 host for full verification." };
  return { verdict: "disputed", confidence: 40, explanation: "Only weak/secondary sources found. Treat as disputed; find Tier-1 primary source." };
}
