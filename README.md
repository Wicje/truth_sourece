# truth_source — authentic-source MCP server

Forces your AI agent to search **only authentic, non-muddled sources** with trust scoring + citations.

Cloned from: https://github.com/Wicje/truth_sourece.git

## What it does

Exposes 3 MCP tools your agent MUST use instead of raw web:

1. `search_authentic(query)` — Wikipedia + OpenAlex + Crossref + PubMed (+ optional Tavily/Brave), ranked by trust, de-duped. Returns Tier, trust score, why-trusted, URLs to cite.
2. `verify_claim(claim)` — cross-checks across 2+ independent sources. Returns `verified / partially-supported / disputed / unverified` + confidence.
3. `source_trust(url)` — allowlist check. Blogs/social/SEO farms → NOT TRUSTED.

Trust tiers:
- Tier 1 (95-100): `.gov`, WHO, UN, NIH, CDC, Nature/Science/NEJM/Lancet, PubMed, clinicaltrials, ISO/IETF/W3C
- Tier 2 (80-94): `.edu`, Wikipedia (starter only), Britannica, arXiv (flagged preprint), DOI, official docs
- Tier 3 (65-79): AP, Reuters, BBC, Snopes/FactCheck/PolitiFact — corroboration only
- Blocked: facebook/instagram/tiktok/twitter/x/reddit/quora/medium/blogspot — never citable

Rule enforced in prompts: **2x Tier-1 to state as fact. Wikipedia alone is never sufficient.**

## Run

```bash
npm install
npm run build
npm start
```

Optional (broader web, still allowlist-filtered):
```bash
cp .env.example .env
# add TAVILY_API_KEY and/or BRAVE_API_KEY + CONTACT_EMAIL
```

Live-tested: `malaria vaccine efficacy` → PubMed 42818794, 42797644 (trust 99, Tier 1).

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
For ANY factual claim: call search_authentic first, then verify_claim.
Only cite URLs returned with trust >=65.
Need 2 independent Tier-1 sources to say "verified".
If verdict != verified, say "evidence insufficient/disputed" — never hallucinate.
Always list citations with URLs + trust scores.
```

## Project layout

- `src/index.ts` — MCP server + 3 tools
- `src/sources.ts` — curated allowlist / blocklist
- `src/providers.ts` — Wikipedia, OpenAlex, Crossref, PubMed, arXiv, Tavily
- `src/trust.ts` — scoring, corroboration bonus, verdicts
