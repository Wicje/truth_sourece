#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchAuthentic } from "./providers.js";
import { getSourceTrust } from "./sources.js";
import { verdictFor } from "./trust.js";

const server = new McpServer({ name: "truth_source", version: "0.1.0" }, { capabilities: { tools: {} } });

// 1) Core tool: authentic search — agent MUST use this instead of raw web
server.tool(
  "search_authentic",
  "Search ONLY authentic sources (Tier1 official/peer-reviewed, Tier2 edu/encyclopedic/scholarly). Returns trust-scored evidence with citations. Use for any factual claim.",
  {
    query: z.string().min(3).describe("Factual question or claim keywords"),
    limit: z.number().int().min(1).max(10).default(5).describe("Max evidence items"),
    includePreprints: z.boolean().default(false).describe("Include arXiv preprints (flagged as unverified)"),
  },
  async ({ query, limit, includePreprints }) => {
    const results = await searchAuthentic(query, { limit, includePreprints });
    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No authentic sources found. DO NOT state as fact. Try rephrasing with more specific terms." }],
      };
    }
    const lines = results.map(
      (r, i) => `${i + 1}. [Tier ${r.tier} | trust ${r.trustScore}] ${r.title}\n   ${r.url}\n   ${r.snippet}\n   Why trusted: ${r.trustReason}`
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `AUTHENTIC EVIDENCE for "${query}" (ranked, cite these URLs):\n\n${lines.join("\n\n")}\n\nRULE: cite at least 2 Tier-1 sources for strong claims. Wikipedia alone is never sufficient.`,
        },
      ],
    };
  }
);

// 2) Verify a claim across independent sources
server.tool(
  "verify_claim",
  "Cross-check a factual claim against 2+ independent authentic sources. Returns verified / partially-supported / disputed / unverified.",
  { claim: z.string().min(5).describe("Exact claim to verify, e.g. 'Vitamin C cures colds'") },
  async ({ claim }) => {
    const evidence = await searchAuthentic(claim, { limit: 8 });
    const v = verdictFor(evidence);
    const cites = evidence.slice(0, 5).map((e, i) => `${i + 1}. [${e.trustScore}] ${e.title} — ${e.url}`).join("\n");
    return {
      content: [
        {
          type: "text" as const,
          text: `CLAIM: "${claim}"\nVERDICT: ${v.verdict.toUpperCase()} (confidence ${v.confidence}%)\n${v.explanation}\n\nEVIDENCE:\n${cites || "none"}\n\nRULE: only repeat claim as fact if verdict=verified. Otherwise say "evidence is insufficient/disputed".`,
        },
      ],
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
    return {
      content: [
        {
          type: "text" as const,
          text: `${t.trusted ? "TRUSTED" : "NOT TRUSTED"} (${t.score}/100, tier ${t.tier}, ${t.category})\n${url}\nReason: ${t.reason}`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[truth_source] MCP server running on stdio — tools: search_authentic, verify_claim, source_trust");
}

main().catch((err) => {
  console.error("[truth_source] fatal:", err);
  process.exit(1);
});
