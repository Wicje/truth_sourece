/**
 * Free, no-key scholarly + encyclopedic providers.
 * Tavily / Brave are optional upgrades via env keys with strict domain filtering.
 */
import "dotenv/config";
import { scoreEvidence, type Evidence } from "./trust.js";
import { getSourceTrust } from "./sources.js";

function userAgent(): string {
  const mail = process.env.CONTACT_EMAIL?.trim();
  return mail ? `truth_source-mcp/0.2.0 (mailto:${mail})` : "truth_source-mcp/0.2.0";
}

/** Sanitize agent input: trim, collapse whitespace, cap length. */
export function sanitizeQuery(q: string, max = 300): string {
  return q.trim().replace(/\s+/g, " ").slice(0, max);
}

// --- tiny LRU cache (1h TTL, max 200 entries) to avoid hammering free APIs ---
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { ts: number; data: Evidence[] }>();

export function cacheKey(query: string, limit: number, preprints: boolean): string {
  return `${query.toLowerCase()}|${limit}|${preprints ? 1 : 0}`;
}

export function cacheGet(key: string): Evidence[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // refresh LRU order
  cache.delete(key);
  cache.set(key, hit);
  return hit.data;
}

export function cacheSet(key: string, data: Evidence[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { ts: Date.now(), data });
}

export function cacheStats(): { size: number } {
  return { size: cache.size };
}

async function getJson(url: string, init?: RequestInit, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": userAgent(), ...(init?.headers ?? {}) }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": userAgent() }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function crossrefUrl(query: string, limit: number): string {
  const params = new URLSearchParams({
    query,
    rows: String(limit),
    select: "title,DOI,URL,published,author,is-referenced-by-count",
  });
  const mail = process.env.CONTACT_EMAIL?.trim();
  if (mail) params.set("mailto", mail);
  return `https://api.crossref.org/works?${params.toString()}`;
}

export async function searchWikipedia(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}`;
    const data = await getJson(url);
    const hits: any[] = data?.query?.search ?? [];
    return hits.slice(0, limit).map((h: any) => {
      const title = h.title as string;
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      const s = scoreEvidence(pageUrl);
      return {
        title,
        url: pageUrl,
        snippet: (h.snippet ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
        source: "wikipedia",
        trustScore: s.score,
        tier: s.tier,
        trustReason: s.reason + " — always follow its cited primary sources.",
      } satisfies Evidence;
    });
  } catch {
    return [];
  }
}

export async function searchOpenAlex(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`;
    const data = await getJson(url);
    const works: any[] = data?.results ?? [];
    return works.map((w: any) => {
      const doi: string | null = w.doi ?? null;
      const pageUrl: string = doi ?? w.primary_location?.landing_page_url ?? w.open_access?.oa_url ?? `https://openalex.org/${w.id?.split("/").pop()}`;
      const year: number | undefined = w.publication_year;
      const cites: number = w.cited_by_count ?? 0;
      const title: string = w.display_name ?? "Untitled";
      const s = scoreEvidence(pageUrl, cites, year);
      const snippet = `Authors: ${(w.authorships ?? []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean).join(", ")} (${year ?? "n.d."}). Cited by ${cites}. ${w.primary_location?.source?.display_name ?? ""}`.slice(0, 400);
      return { title, url: pageUrl, snippet, source: "openalex", trustScore: s.score, tier: s.tier, trustReason: s.reason, citations: cites, year } satisfies Evidence;
    });
  } catch {
    return [];
  }
}

export async function searchSemanticScholar(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      fields: "title,url,year,citationCount,authors,abstract,venue,externalIds",
    });
    const data = await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`, undefined, 12000);
    const papers: any[] = data?.data ?? [];
    return papers.slice(0, limit).map((p: any) => {
      const doi: string | undefined = p.externalIds?.DOI;
      const pageUrl: string = p.url ?? (doi ? `https://doi.org/${doi}` : "");
      if (!pageUrl) return null;
      const cites: number = p.citationCount ?? 0;
      const year: number | undefined = p.year ?? undefined;
      const s = scoreEvidence(pageUrl, cites, year);
      const authors = (p.authors ?? []).slice(0, 3).map((a: any) => a.name).filter(Boolean).join(", ");
      return {
        title: p.title ?? "Untitled",
        url: pageUrl,
        snippet: `${authors} (${year ?? "n.d."}). ${p.venue ?? ""} Cited by ${cites}. ${(p.abstract ?? "").slice(0, 220)}`.slice(0, 400),
        source: "semanticscholar",
        trustScore: s.score,
        tier: s.tier,
        trustReason: s.reason,
        citations: cites,
        year,
      } satisfies Evidence;
    }).filter(Boolean) as Evidence[];
  } catch {
    return [];
  }
}

export async function searchCrossref(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const data = await getJson(crossrefUrl(query, limit));
    const items: any[] = data?.message?.items ?? [];
    return items.map((it: any) => {
      const title: string = Array.isArray(it.title) ? it.title[0] : it.title ?? "Untitled";
      const pageUrl: string = it.URL ?? (it.DOI ? `https://doi.org/${it.DOI}` : "");
      if (!pageUrl) return null;
      const cites: number = it["is-referenced-by-count"] ?? 0;
      const year: number | undefined = it.published?.["date-parts"]?.[0]?.[0];
      const s = scoreEvidence(pageUrl, cites, year);
      return { title, url: pageUrl, snippet: `DOI:${it.DOI ?? "?"} cited by ${cites} (${year ?? "n.d."})`.slice(0, 400), source: "crossref", trustScore: s.score, tier: s.tier, trustReason: s.reason, citations: cites, year } satisfies Evidence;
    }).filter(Boolean) as Evidence[];
  } catch {
    return [];
  }
}

export async function searchPubMed(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const tool = "truth_source";
    const email = process.env.CONTACT_EMAIL?.trim();
    const apiKey = process.env.NCBI_API_KEY?.trim();
    const extra = `${email ? `&email=${encodeURIComponent(email)}` : ""}${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ""}${tool ? `&tool=${tool}` : ""}`;
    const esearch = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${limit}${extra}`;
    const sdata = await getJson(esearch);
    const ids: string[] = sdata?.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];
    const esummary = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json${extra}`;
    const edata = await getJson(esummary);
    const out: Evidence[] = [];
    for (const id of ids) {
      const rec = edata?.result?.[id];
      if (!rec) continue;
      const pageUrl = `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
      const year = rec.pubdate ? parseInt(String(rec.pubdate).slice(0, 4)) || undefined : undefined;
      const s = scoreEvidence(pageUrl, 0, year);
      out.push({
        title: rec.title ?? `PubMed ${id}`,
        url: pageUrl,
        snippet: `Authors: ${(rec.authors ?? []).slice(0, 3).map((a: any) => a.name).join(", ")} — ${rec.source ?? ""} (${rec.pubdate ?? ""})`.slice(0, 400),
        source: "pubmed",
        trustScore: s.score,
        tier: s.tier,
        trustReason: s.reason,
        year,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function searchArxiv(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}&sortBy=relevance&sortOrder=descending`;
    const xml = await getText(url);
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, limit);
    return entries.map((m) => {
      const body = m[1];
      const title = (body.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Untitled").replace(/\s+/g, " ").trim();
      const idUrl = body.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const published = body.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? "";
      const year = published ? parseInt(published.slice(0, 4)) || undefined : undefined;
      const summary = (body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      const s = scoreEvidence(idUrl || "https://arxiv.org", 0, year);
      return { title, url: idUrl, snippet: summary + " [PREPRINT — verify peer-reviewed version]", source: "arxiv", trustScore: s.score, tier: s.tier, trustReason: s.reason, year } satisfies Evidence;
    }).filter((e) => e.url);
  } catch {
    return [];
  }
}

// --- Optional key-based web search, strictly filtered to allowlist ---
const ALLOWED_WEB_HINTS = ["gov", "edu", "who.int", "un.org", "nature.com", "science.org", "nih.gov", "cdc.gov", "fda.gov", "wikipedia.org", "arxiv.org", "doi.org", "britannica.com", "europa.eu", "gov.uk", "gc.ca", "oecd.org", "worldbank.org", "imf.org", "bmj.com", "jamanetwork.com", "plos.org", "iso.org", "ietf.org", "w3.org"];

function passesAllowlist(url: string): boolean {
  const t = getSourceTrust(url);
  if (t.trusted && t.tier <= 2) return true;
  const low = url.toLowerCase();
  return ALLOWED_WEB_HINTS.some((h) => low.includes(h));
}

export async function searchTavily(query: string, limit = 5): Promise<Evidence[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];
  try {
    const data = await getJson("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 10, include_answer: false }),
    });
    const results: any[] = data?.results ?? [];
    return results
      .filter((r) => r.url && passesAllowlist(r.url))
      .slice(0, limit)
      .map((r: any) => {
        const s = scoreEvidence(r.url);
        return { title: r.title ?? r.url, url: r.url, snippet: String(r.content ?? "").slice(0, 400), source: "tavily", trustScore: s.score, tier: s.tier, trustReason: s.reason } satisfies Evidence;
      });
  } catch {
    return [];
  }
}

export async function searchBrave(query: string, limit = 5): Promise<Evidence[]> {
  const key = process.env.BRAVE_API_KEY?.trim();
  if (!key) return [];
  try {
    const params = new URLSearchParams({ q: query, count: String(Math.min(10, Math.max(1, limit))) });
    const data = await getJson(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
      headers: { "X-Subscription-Token": key },
    });
    const results: any[] = data?.web?.results ?? [];
    return results
      .filter((r) => r.url && passesAllowlist(r.url))
      .slice(0, limit)
      .map((r: any) => {
        const s = scoreEvidence(r.url);
        return { title: r.title ?? r.url, url: r.url, snippet: String(r.description ?? "").slice(0, 400), source: "brave", trustScore: s.score, tier: s.tier, trustReason: s.reason } satisfies Evidence;
      });
  } catch {
    return [];
  }
}

/** Extract up to 2 verbatim quotes from a page containing query keywords. */
export function extractQuotes(html: string, query: string, maxQuotes = 2): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 200) return [];
  const keywords = query.toLowerCase().split(/[^a-z0-9]+/g).filter((w) => w.length > 3).slice(0, 6);
  if (keywords.length === 0) return [];
  const sentences = text.match(/[^.!?]{40,400}[.!?]/g) ?? [];
  const scored = sentences
    .map((s) => {
      const low = s.toLowerCase();
      const hits = keywords.filter((k) => low.includes(k)).length;
      return { s: s.trim(), hits };
    })
    .filter((x) => x.hits >= Math.min(2, keywords.length))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, maxQuotes)
    .map((x) => x.s.slice(0, 350));
  return scored;
}

/** Fetch a trusted URL and extract verbatim quotes for a query. Returns null when untrusted/unfetchable. */
export async function fetchEvidenceQuote(url: string, query: string): Promise<{ quote: string; trusted: boolean; tier: number } | null> {
  const t = getSourceTrust(url);
  if (!t.trusted) return null;
  try {
    const html = await getText(url, 10000);
    const quotes = extractQuotes(html, query, 2);
    if (quotes.length === 0) return null;
    return { quote: quotes.join(" [...] ").slice(0, 700), trusted: true, tier: t.tier };
  } catch {
    return null;
  }
}

export interface SearchOptions {
  limit?: number;
  includePreprints?: boolean;
}

export async function searchAuthentic(query: string, opts: SearchOptions = {}): Promise<Evidence[]> {
  const clean = sanitizeQuery(query);
  if (clean.length < 3) return [];
  const limit = Math.max(1, Math.min(10, opts.limit ?? 5));
  const key = cacheKey(clean, limit, !!opts.includePreprints);
  const cached = cacheGet(key);
  if (cached) return cached;

  const jobs: Array<Promise<Evidence[]>> = [
    searchWikipedia(clean, 3),
    searchOpenAlex(clean, 3),
    searchSemanticScholar(clean, 3),
    searchCrossref(clean, 3),
    searchPubMed(clean, 3),
    searchTavily(clean, 3),
    searchBrave(clean, 3),
  ];
  if (opts.includePreprints) jobs.push(searchArxiv(clean, 3));

  const settled = await Promise.allSettled(jobs);
  const merged: Evidence[] = [];
  for (const s of settled) if (s.status === "fulfilled") merged.push(...s.value);
  // de-dupe by URL, keep highest trust
  const byUrl = new Map<string, Evidence>();
  for (const e of merged) {
    const prev = byUrl.get(e.url);
    if (!prev || e.trustScore > prev.trustScore) byUrl.set(e.url, e);
  }
  const out = [...byUrl.values()].sort((a, b) => b.trustScore - a.trustScore).slice(0, limit);
  cacheSet(key, out);
  return out;
}
