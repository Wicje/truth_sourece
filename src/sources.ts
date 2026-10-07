/**
 * Curated authentic-source registry.
 * Philosophy: prefer primary / peer-reviewed / official over blogs, SEO farms, social.
 * Tiers:
 *  1 (95-100): peer-reviewed + primary official (.gov, WHO, UN, standards)
 *  2 (80-94):  .edu, encyclopedic, reputable scholarly publishers, official docs
 *  3 (65-79):  wire / reputable press + established fact-checkers (corroboration only)
 *  blocked:    social, forums, content farms — never returned as evidence
 */

export type Tier = 1 | 2 | 3;

export interface SourceRule {
  match: string; // substring match on hostname, lowercased
  tier: Tier;
  baseScore: number;
  category: string;
  reason: string;
}

export const SOURCE_RULES: SourceRule[] = [
  // Tier 1 — official primary
  { match: "who.int", tier: 1, baseScore: 100, category: "global-health", reason: "WHO primary official guidance" },
  { match: "un.org", tier: 1, baseScore: 99, category: "official", reason: "United Nations primary source" },
  { match: "cdc.gov", tier: 1, baseScore: 99, category: "official", reason: "US CDC primary public-health source" },
  { match: "nih.gov", tier: 1, baseScore: 99, category: "official", reason: "US NIH primary research source" },
  { match: "pubmed.ncbi.nlm.nih.gov", tier: 1, baseScore: 99, category: "peer-reviewed", reason: "PubMed indexed biomedical literature" },
  { match: "clinicaltrials.gov", tier: 1, baseScore: 98, category: "official", reason: "Registered clinical trials registry" },
  { match: "europa.eu", tier: 1, baseScore: 98, category: "official", reason: "EU official source" },
  { match: "nature.com", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "Nature peer-reviewed journal" },
  { match: "science.org", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "Science peer-reviewed journal" },
  { match: "nejm.org", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "NEJM peer-reviewed journal" },
  { match: "thelancet.com", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "Lancet peer-reviewed journal" },
  { match: "iso.org", tier: 1, baseScore: 97, category: "standards", reason: "ISO standards body" },
  { match: "ietf.org", tier: 1, baseScore: 97, category: "standards", reason: "IETF standards body" },
  { match: "w3.org", tier: 1, baseScore: 97, category: "standards", reason: "W3C standards body" },

  // Tier 2 — edu / encyclopedic / scholarly infra
  { match: "wikipedia.org", tier: 2, baseScore: 86, category: "encyclopedic", reason: "Wikipedia — good starting point, requires primary citation" },
  { match: "britannica.com", tier: 2, baseScore: 88, category: "encyclopedic", reason: "Britannica editorially reviewed" },
  { match: "arxiv.org", tier: 2, baseScore: 87, category: "preprint", reason: "arXiv preprint — not yet peer-reviewed, check version" },
  { match: "openalex.org", tier: 2, baseScore: 86, category: "scholarly-index", reason: "OpenAlex scholarly index" },
  { match: "crossref.org", tier: 2, baseScore: 86, category: "scholarly-index", reason: "Crossref DOI registry" },
  { match: "doi.org", tier: 2, baseScore: 90, category: "peer-reviewed", reason: "DOI-resolved scholarly work" },
  { match: "edu", tier: 2, baseScore: 84, category: "academic", reason: ".edu academic institution" },
  { match: "ac.uk", tier: 2, baseScore: 84, category: "academic", reason: "UK academic institution" },
  { match: "gov", tier: 1, baseScore: 96, category: "official", reason: ".gov official government source" },
  { match: "gov.uk", tier: 1, baseScore: 96, category: "official", reason: "UK government official source" },
  { match: "gc.ca", tier: 1, baseScore: 96, category: "official", reason: "Canadian government official source" },
  { match: "europa.eu", tier: 1, baseScore: 96, category: "official", reason: "EU official source" },
  { match: "int", tier: 1, baseScore: 95, category: "official", reason: ".int intergovernmental org" },
  { match: "docs.python.org", tier: 2, baseScore: 92, category: "official-docs", reason: "Official language documentation" },
  { match: "developer.mozilla.org", tier: 2, baseScore: 90, category: "official-docs", reason: "MDN maintained web docs" },

  // Tier 3 — wire / reputable press / fact-check (corroboration only, never alone)
  { match: "apnews.com", tier: 3, baseScore: 76, category: "wire", reason: "AP wire — reputable but secondary" },
  { match: "reuters.com", tier: 3, baseScore: 76, category: "wire", reason: "Reuters wire — reputable but secondary" },
  { match: "bbc.com", tier: 3, baseScore: 74, category: "press", reason: "BBC — reputable but secondary" },
  { match: "snopes.com", tier: 3, baseScore: 72, category: "fact-check", reason: "Fact-checker — useful for debunks, verify primary" },
  { match: "factcheck.org", tier: 3, baseScore: 73, category: "fact-check", reason: "Fact-checker — useful for debunks" },
  { match: "politifact.com", tier: 3, baseScore: 71, category: "fact-check", reason: "Fact-checker — US politics focus" },
];

const BLOCKED_SUBSTRINGS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "quora.com",
  "medium.com",
  "blogspot.",
  "wordpress.com",
  "pinterest.",
  "youtube.com/watch",
];

export interface TrustVerdict {
  trusted: boolean;
  score: number; // 0-100
  tier: Tier | 0;
  category: string;
  reason: string;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isBlocked(url: string): boolean {
  const u = url.toLowerCase();
  return BLOCKED_SUBSTRINGS.some((b) => u.includes(b));
}

export function getSourceTrust(url: string): TrustVerdict {
  const host = hostnameOf(url);
  if (!host) return { trusted: false, score: 0, tier: 0, category: "invalid", reason: "Unparseable URL" };
  if (isBlocked(url))
    return { trusted: false, score: 0, tier: 0, category: "blocked", reason: "Social/forum/UGC — not citable as fact" };

  let best: SourceRule | null = null;
  for (const r of SOURCE_RULES) {
    if (host.includes(r.match) || host.endsWith(r.match)) {
      if (!best || r.baseScore > best.baseScore) best = r;
    }
  }
  if (best) {
    return { trusted: true, score: best.baseScore, tier: best.tier, category: best.category, reason: best.reason };
  }
  // Unknown domain: untrusted by default — agent must not cite it as fact
  return { trusted: false, score: 20, tier: 0, category: "unknown", reason: "Not on authentic-source allowlist — do not cite as fact" };
}
