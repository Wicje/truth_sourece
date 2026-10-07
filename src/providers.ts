/**
 * Free, no-key scholarly + encyclopedic providers.
 * Tavily / Brave are optional upgrades via env keys with strict domain filtering.
 */
import { scoreEvidence, type Evidence } from "./trust.js";
import { getSourceTrust } from "./sources.js";

const UA = { "User-Agent": "truth_source-mcp/0.1.0" };
const CONTACT = process.env.CONTACT_EMAIL ? `?mailto=${encodeURIComponent(process.env.CONTACT_EMAIL)}` : "";

async function getJson(url: string, init?: RequestInit, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: ctrl.signal });
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
    const res = await fetch(url, { headers: { ...UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
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

export async function searchCrossref(query: string, limit = 5): Promise<Evidence[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=title,DOI,URL,published,author,is-referenced-by-count${CONTACT ? "&" + CONTACT.slice(1) : ""}`;
    const data = await getJson(url);
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
    const esearch = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${limit}`;
    const sdata = await getJson(esearch);
    const ids: string[] = sdata?.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];
    const esummary = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
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
const ALLOWED_WEB_HINTS = ["gov", "edu", "who.int", "un.org", "nature.com", "science.org", "nih.gov", "cdc.gov", "wikipedia.org", "arxiv.org", "doi.org", "britannica.com", "europa.eu", "gov.uk", "gc.ca", "iso.org", "ietf.org", "w3.org"];

function passesAllowlist(url: string): boolean {
  const t = getSourceTrust(url);
  if (t.trusted && t.tier <= 2) return true;
  const low = url.toLowerCase();
  return ALLOWED_WEB_HINTS.some((h) => low.includes(h));
}

export async function searchTavily(query: string, limit = 5): Promise<Evidence[]> {
  const key = process.env.TAVILY_API_KEY;
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

export interface SearchOptions {
  limit?: number;
  includePreprints?: boolean;
}

export async function searchAuthentic(query: string, opts: SearchOptions = {}): Promise<Evidence[]> {
  const limit = Math.max(1, Math.min(10, opts.limit ?? 5));
  const per = Math.max(2, Math.ceil(limit / 2));
  const settled = await Promise.allSettled([
    searchWikipedia(query, per),
    searchOpenAlex(query, per),
    searchCrossref(query, per),
    searchPubMed(query, per),
    ...(opts.includePreprints ? [searchArxiv(query, per)] : []),
    searchTavily(query, per),
  ]);
  const merged: Evidence[] = [];
  for (const s of settled) if (s.status === "fulfilled") merged.push(...s.value);
  // de-dupe by URL, keep highest trust
  const byUrl = new Map<string, Evidence>();
  for (const e of merged) {
    const prev = byUrl.get(e.url);
    if (!prev || e.trustScore > prev.trustScore) byUrl.set(e.url, e);
  }
  return [...byUrl.values()].sort((a, b) => b.trustScore - a.trustScore).slice(0, limit);
}
