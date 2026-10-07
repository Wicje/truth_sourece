# truth_source — authentic-source MCP server

Forces your AI agent to search **only authentic, non-muddled sources** with trust scoring + citations.

Cloned from: https://github.com/Wicje/truth_sourece.git

## What it does (v0.2.0)

Exposes 4 MCP tools your agent MUST use instead of raw web:

1. `search_authentic(query)` — Wikipedia + OpenAlex + Semantic Scholar + Crossref + PubMed (+ optional arXiv/Tavily/Brave), ranked by trust, de-duped, cached 1h. Returns text + structured JSON with Tier, trust score, why-trusted, URLs.
2. `verify_claim(claim)` — cross-checks across 2+ **independent hosts**. Requires 2 Tier-1 hosts for `verified`. Optionally fetches pages for verbatim quotes.
3. `source_trust(url)` — exact-host allowlist check (no more `x.com` ⊂ `linux.com` bugs). Blogs/social/SEO farms → NOT TRUSTED.
4. `fetch_evidence(url, query)` — fetches a trusted page, extracts verbatim quotes. Refuses untrusted URLs.

Trust tiers:
- Tier 1 (95-100): `.gov`, WHO, UN, NIH, CDC, FDA, EPA, Nature/Science/NEJM/Lancet/BMJ/JAMA/PLOS, PubMed, clinicaltrials, OECD/WorldBank/IMF, ISO/IETF/W3C
- Tier 2 (80-94): `.edu`, Wikipedia (starter only), Britannica, arXiv (flagged preprint), DOI, Semantic Scholar, official docs
- Tier 3 (65-79): AP, Reuters, BBC, Snopes/FactCheck/PolitiFact — corroboration only
- Blocked: facebook/instagram/tiktok/twitter/x/reddit/quora/medium/linkedin/youtube UGC — never citable

Rule enforced in prompts: **2x independent Tier-1 hosts to state as fact. Wikipedia alone is never sufficient.**

## Run

```bash
npm install
npm run build
npm start
npm test   # vitest: matching, verdict, cache, quotes
```

Optional (broader web, still allowlist-filtered):
```bash
cp .env.example .env
# add TAVILY_API_KEY and/or BRAVE_API_KEY + CONTACT_EMAIL (+ NCBI_API_KEY for PubMed)
```

Live-tested: `malaria vaccine efficacy` → PubMed Tier-1 hits with trust 99.

## Connect to your agent

### OpenCode / Claude Code (`opencode.json` / `mcp.json`)
```json
{
  "mcp": {
    "truth_source": {
      "type": "local",
      "command": ["node", "C:\\Users\\Vathos\\truth_sourece\\dist\\index.js"],
      "enabled": true
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "truth_source": {
      "command": "node",
      "args": ["C:\\Users\\Vathos\\truth_sourece\\dist\\index.js"]
    }
  }
}
```

## Agent instruction (paste into system prompt)

```
For ANY factual claim: call search_authentic first, then verify_claim(withQuotes=true).
Only cite URLs returned with trust >=65.
Need verdict=verified (2 independent Tier-1 hosts) to state as fact.
If verdict != verified, say "evidence is insufficient/disputed" — never hallucinate.
Prefer responses with quotes from fetch_evidence. Always list citations with URLs + trust scores.
```

## Project layout

- `src/index.ts` — MCP server + 4 tools, structured output
- `src/sources.ts` — curated allowlist / blocklist (exact-host matching)
- `src/providers.ts` — Wikipedia, OpenAlex, Semantic Scholar, Crossref, PubMed, arXiv, Tavily, Brave + cache + quotes
- `src/trust.ts` — scoring, independent-host corroboration, verdicts
- `tests/` — vitest regression tests for matching, verdicts, cache, quotes
