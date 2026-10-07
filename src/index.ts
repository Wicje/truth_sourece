#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchEvidenceQuote, sanitizeQuery, searchAuthentic } from "./providers.js";
import { getSourceTrust } from "./sources.js";
import { verdictFor } from "./trust.js";

const server = new McpServer({ name: "truth_source", version: "0.3.0" }, { capabilities: { tools: {} } });

function evidencePayload(r: { title: string; url: string; snippet: string; source: string; trustScore: number; tier: number; trustReason: string; citations?: number; year?: number; quote?: string }) {
  return {
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    source: r.source,
    trustScore: r.trustScore,
    tier: r.tier,
    trustReason: r.trustReason,
    ...(r.citations !== undefined ? { citations: r.citations } : {}),
    ...(r.year !== undefined ? { year: r.year } : {}),
    ...(r.quote ? { quote: r.quote } : {}),
  };
}

// 1) Core tool: authentic search — agent MUST use this instead of raw web
server.tool(
  "search_authentic",
  "Search ONLY authentic sources (Tier1 official/peer-reviewed, Tier2 edu/encyclopedic/scholarly). Returns trust-scored evidence with citations. Use for any factual claim.",
  {
    query: z.string().min(3).max(300).describe("Factual question or claim keywords"),
    limit: z.number().int().min(1).max(10).default(5).describe("Max evidence items"),
    includePreprints: z.boolean().default(false).describe("Include arXiv preprints (flagged as unverified)"),
  },
  async ({ query, limit, includePreprints }) => {
    const clean = sanitizeQuery(query);
    const results = await searchAuthentic(clean, { limit, includePreprints });
    const evidence = results.map(evidencePayload);
    if (evidence.length === 0) {
      const text = "No authentic sources found. DO NOT state as fact. Try rephrasing with more specific terms.";
      return { content: [{ type: "text" as const, text }], structuredContent: { query: clean, evidence: [], count: 0 } };
    }
    const lines = evidence.map(
      (r, i) => `${i + 1}. [Tier ${r.tier} | trust ${r.trustScore}] ${r.title}\n   ${r.url}\n   ${r.snippet}\n   Why trusted: ${r.trustReason}`
    );
    const text = `AUTHENTIC EVIDENCE for "${clean}" (ranked, cite these URLs):\n\n${lines.join("\n\n")}\n\nRULE: cite at least 2 Tier-1 sources for strong claims. Wikipedia alone is never sufficient.`;
    return { content: [{ type: "text" as const, text }], structuredContent: { query: clean, evidence, count: evidence.length } };
  }
);

// 2) Verify a claim across independent sources (with quote extraction on top hits)
server.tool(
  "verify_claim",
  "Cross-check a factual claim against 2+ independent authentic sources. Returns verified / partially-supported / disputed / unverified.",
  {
    claim: z.string().min(5).max(300).describe("Exact claim to verify, e.g. 'Vitamin C cures colds'"),
    withQuotes: z.boolean().default(true).describe("Fetch source pages for verbatim quotes (slower but stronger)"),
  },
  async ({ claim, withQuotes }) => {
    const clean = sanitizeQuery(claim);
    const evidence = await searchAuthentic(clean, { limit: 8 });
    if (withQuotes) {
      const top = evidence.filter((e) => e.trustScore >= 80).slice(0, 3);
      await Promise.all(
        top.map(async (e) => {
          const q = await fetchEvidenceQuote(e.url, clean);
          if (q?.quote) e.quote = q.quote;
        })
      );
    }
    const v = verdictFor(evidence);
    const payload = evidence.slice(0, 5).map(evidencePayload);
    const cites = payload.map((e, i) => `${i + 1}. [${e.trustScore}] ${e.title} — ${e.url}${e.quote ? `\n   Quote: "${e.quote.slice(0, 220)}"` : ""}`).join("\n");
    const text = `CLAIM: "${clean}"\nVERDICT: ${v.verdict.toUpperCase()} (confidence ${v.confidence}%)\n${v.explanation}\n\nEVIDENCE:\n${cites || "none"}\n\nRULE: only repeat claim as fact if verdict=verified. Otherwise say "evidence is insufficient/disputed".`;
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { claim: clean, verdict: v.verdict, confidence: v.confidence, explanation: v.explanation, evidence: payload },
    };
  }
);

// 3) Explain trust of any URL/domain
server.tool(
  "source_trust",
  "Check whether a URL/domain is on the authentic allowlist and why. Use to reject blogs, social, SEO farms.",
  { url: z.string().url().describe("Full URL to evaluate") },
  async ({ url }) => {
    const t = getSourceTrust(url);
    const text = `${t.trusted ? "TRUSTED" : "NOT TRUSTED"} (${t.score}/100, tier ${t.tier}, ${t.category})\n${url}\nReason: ${t.reason}`;
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { url, trusted: t.trusted, score: t.score, tier: t.tier, category: t.category, reason: t.reason },
    };
  }
);

// 4) Fetch verbatim quotes from a trusted URL
server.tool(
  "fetch_evidence",
  "Fetch a trusted source URL and extract verbatim quotes matching the query. Rejects untrusted URLs.",
  {
    url: z.string().url().describe("Trusted URL to fetch"),
    query: z.string().min(3).max(300).describe("Keywords to locate quotes on the page"),
  },
  async ({ url, query }) => {
    const clean = sanitizeQuery(query);
    const q = await fetchEvidenceQuote(url, clean);
    if (!q) {
      const t = getSourceTrust(url);
      const text = t.trusted
        ? `No matching quotes found on ${url} for "${clean}". Do not cite this page for that claim.`
        : `REFUSED: ${url} is not trusted (${t.reason}). Find a Tier-1/2 source instead.`;
      return { content: [{ type: "text" as const, text }], structuredContent: { url, query: clean, quote: null, trusted: t.trusted } };
    }
    return {
      content: [{ type: "text" as const, text: `QUOTE from ${url}:\n"${q.quote}"` }],
      structuredContent: { url, query: clean, quote: q.quote, trusted: true, tier: q.tier },
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[truth_source] MCP server v0.3.0 on stdio — tools: search_authentic, verify_claim, source_trust, fetch_evidence");
}

main().catch((err) => {
  console.error("[truth_source] fatal:", err);
  process.exit(1);
});
