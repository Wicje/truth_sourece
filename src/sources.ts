/**
 * Curated authentic-source registry.
 * Philosophy: prefer primary / peer-reviewed / official over blogs, SEO farms, social.
 * Tiers:
 *  1 (95-100): peer-reviewed + primary official (.gov, WHO, UN, standards)
 *  2 (80-94):  .edu, encyclopedic, reputable scholarly publishers, official docs
 *  3 (65-79):  wire / reputable press + established fact-checkers (corroboration only)
 * blocked:    social, forums, content farms — never returned as evidence
 */

import { loadSourcesConfig } from "./config.js";

export type Tier = 1 | 2 | 3;

export interface SourceRule {
  match: string; // hostname suffix (contains '.') or bare TLD ('gov','edu','int')
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
  { match: "fda.gov", tier: 1, baseScore: 99, category: "official", reason: "US FDA primary regulatory source" },
  { match: "epa.gov", tier: 1, baseScore: 98, category: "official", reason: "US EPA primary environmental source" },
  { match: "pubmed.ncbi.nlm.nih.gov", tier: 1, baseScore: 99, category: "peer-reviewed", reason: "PubMed indexed biomedical literature" },
  { match: "clinicaltrials.gov", tier: 1, baseScore: 98, category: "official", reason: "Registered clinical trials registry" },
  { match: "europa.eu", tier: 1, baseScore: 98, category: "official", reason: "EU official source" },
  { match: "oecd.org", tier: 1, baseScore: 97, category: "official", reason: "OECD official statistics and policy" },
  { match: "worldbank.org", tier: 1, baseScore: 97, category: "official", reason: "World Bank official data" },
  { match: "imf.org", tier: 1, baseScore: 97, category: "official", reason: "IMF official data" },
  { match: "nature.com", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "Nature peer-reviewed journal" },
  { match: "science.org", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "Science peer-reviewed journal" },
  { match: "nejm.org", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "NEJM peer-reviewed journal" },
  { match: "thelancet.com", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "Lancet peer-reviewed journal" },
  { match: "bmj.com", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "BMJ peer-reviewed journal" },
  { match: "jamanetwork.com", tier: 1, baseScore: 98, category: "peer-reviewed", reason: "JAMA peer-reviewed journal" },
  { match: "plos.org", tier: 1, baseScore: 97, category: "peer-reviewed", reason: "PLOS peer-reviewed journals" },
  { match: "iso.org", tier: 1, baseScore: 97, category: "standards", reason: "ISO standards body" },
  { match: "ietf.org", tier: 1, baseScore: 97, category: "standards", reason: "IETF standards body" },
  { match: "w3.org", tier: 1, baseScore: 97, category: "standards", reason: "W3C standards body" },

  // Tier 2 — edu / encyclopedic / scholarly infra
  { match: "wikipedia.org", tier: 2, baseScore: 86, category: "encyclopedic", reason: "Wikipedia — good starting point, requires primary citation" },
  { match: "britannica.com", tier: 2, baseScore: 88, category: "encyclopedic", reason: "Britannica editorially reviewed" },
  { match: "arxiv.org", tier: 2, baseScore: 87, category: "preprint", reason: "arXiv preprint — not yet peer-reviewed, check version" },
  { match: "openalex.org", tier: 2, baseScore: 86, category: "scholarly-index", reason: "OpenAlex scholarly index" },
  { match: "crossref.org", tier: 2, baseScore: 86, category: "scholarly-index", reason: "Crossref DOI registry" },
  { match: "semanticscholar.org", tier: 2, baseScore: 88, category: "scholarly-index", reason: "Semantic Scholar index — verify venue" },
  { match: "doi.org", tier: 2, baseScore: 90, category: "peer-reviewed", reason: "DOI-resolved scholarly work" },
  { match: "edu", tier: 2, baseScore: 84, category: "academic", reason: ".edu academic institution" },
  { match: "ac.uk", tier: 2, baseScore: 84, category: "academic", reason: "UK academic institution" },
  { match: "gov", tier: 1, baseScore: 96, category: "official", reason: ".gov official government source" },
  { match: "gov.uk", tier: 1, baseScore: 96, category: "official", reason: "UK government official source" },
  { match: "gc.ca", tier: 1, baseScore: 96, category: "official", reason: "Canadian government official source" },
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

/** Host-only blocklist (exact host or subdomain). Path-based UGC handled in isBlocked.
 * Built-in defaults — overridden by sources.yaml when present (see config.ts). */
const BLOCKED_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "quora.com",
  "medium.com",
  "blogspot.com",
  "wordpress.com",
  "pinterest.com",
  "threads.net",
  "linkedin.com",
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
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

/**
 * Exact-host or subdomain match for dotted patterns;
 * bare-TLD match (gov/edu/int) only on the final label.
 * Fixes old substring bug where 'x.com' matched 'linux.com' and 'int' matched 'print.com'.
 */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const p = pattern.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
  if (!h || !p) return false;
  if (p.includes(".")) return h === p || h.endsWith(`.${p}`);
  return h.split(".").pop() === p;
}

export function isBlocked(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const path = u.pathname.toLowerCase();
  if (activeBlockedHosts().some((b) => hostMatches(host, b))) return true;
  if (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")) {
    // Allow official channel pages, block watch/shorts UGC video URLs as evidence
    if (path.startsWith("/watch") || path.startsWith("/shorts") || path.startsWith("/live")) return true;
    return true; // YouTube is never citable as primary fact source
  }
  return false;
}

export function getSourceTrust(url: string): TrustVerdict {
  const host = hostnameOf(url);
  if (!host) return { trusted: false, score: 0, tier: 0, category: "invalid", reason: "Unparseable URL" };
  if (isBlocked(url))
    return { trusted: false, score: 0, tier: 0, category: "blocked", reason: "Social/forum/UGC — not citable as fact" };

  let best: SourceRule | null = null;
  for (const r of activeRules()) {
    if (hostMatches(host, r.match)) {
      if (!best || r.baseScore > best.baseScore) best = r;
    }
  }
  if (best) {
    return { trusted: true, score: best.baseScore, tier: best.tier, category: best.category, reason: best.reason };
  }
  // Unknown domain: untrusted by default — agent must not cite it as fact
  return { trusted: false, score: 20, tier: 0, category: "unknown", reason: "Not on authentic-source allowlist — do not cite as fact" };
}

/** Active rules: sources.yaml wins when present, else built-in SOURCE_RULES. */
export function activeRules(): SourceRule[] {
  return loadSourcesConfig()?.rules ?? SOURCE_RULES;
}

export function activeBlockedHosts(): string[] {
  return loadSourcesConfig()?.blockedHosts ?? BLOCKED_HOSTS;
}
