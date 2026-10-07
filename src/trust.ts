import { getSourceTrust } from "./sources.js";

export interface Evidence {
  title: string;
  url: string;
  snippet: string;
  source: string; // provider: wikipedia | openalex | crossref | pubmed | arxiv | tavily | brave
  trustScore: number;
  tier: number;
  trustReason: string;
  citations?: number;
  year?: number;
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

/** Corroboration: +8 if 2+ independent Tier-1 sources agree, +4 for Tier1+Tier2 mix. */
export function corroborationBonus(evidences: Evidence[]): number {
  const t1Hosts = new Set(
    evidences.filter((e) => e.tier === 1).map((e) => { try { return new URL(e.url).hostname; } catch { return e.url; } })
  );
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
  const t1Count = new Set(trusted.filter((e) => e.tier === 1).map((e) => e.url)).size;

  if ((t1Count >= 2 && top >= 90) || top >= 98)
    return { verdict: "verified", confidence: Math.min(95, top), explanation: `${t1Count} independent Tier-1 sources corroborate. Citable as fact with citations.` };
  if (t1Count >= 1 || top >= 80)
    return { verdict: "partially-supported", confidence: Math.min(80, top), explanation: "Supported by at least one authentic source but needs a second independent Tier-1 source for full verification." };
  return { verdict: "disputed", confidence: 40, explanation: "Only weak/secondary sources found. Treat as disputed; find Tier-1 primary source." };
}
