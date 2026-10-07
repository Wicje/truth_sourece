# truth_source — authentic-source MCP server

Forces your AI agent to search **only authentic, non-muddled sources** with trust scoring + citations.

Cloned from: https://github.com/Wicje/truth_sourece.git

## What it does (v0.4.0)

Exposes 4 MCP tools your agent MUST use instead of raw web:

1. `search_authentic(query)` — Wikipedia + OpenAlex + Semantic Scholar + Crossref + PubMed + Google FactCheck (+ optional arXiv/Tavily/Brave), ranked by trust, de-duped, cached 1h. Returns text + structured JSON with Tier, trust score, why-trusted, URLs.
2. `verify_claim(claim)` — cross-checks across 2+ **independent hosts**. Requires 2 Tier-1 hosts for `verified`. Optionally fetches pages for verbatim quotes.
3. `source_trust(url)` — exact-host allowlist check (no more `x.com` ⊂ `linux.com` bugs). Blogs/social/SEO farms → NOT TRUSTED.
4. `fetch_evidence(url, query)` — fetches a trusted page, extracts verbatim quotes. Refuses untrusted URLs.

Trust tiers:
- Tier 1 (95-100): `.gov`, WHO, UN, NIH, CDC, FDA, EPA, Nature/Science/NEJM/Lancet/BMJ/JAMA/PLOS, PubMed, clinicaltrials, OECD/WorldBank/IMF, ISO/IETF/W3C
- Tier 2 (80-94): `.edu`, Wikipedia (starter only), Britannica, arXiv (flagged preprint), DOI, Semantic Scholar, official docs
- Tier 3 (65-79): AP, Reuters, BBC, Google FactCheck, Snopes/FactCheck/PolitiFact — corroboration only
- Blocked: facebook/instagram/tiktok/twitter/x/reddit/quora/medium/linkedin/youtube UGC — never citable

Rule enforced in prompts: **2x independent Tier-1 hosts to state as fact. Wikipedia alone is never sufficient.**

## Run

```bash
npm install
npm run build
npm start
npm test   # vitest: matching, verdict, cache, quotes, config, throttle, eval matrix
```

Politeness: all HTTP goes through a per-host scheduler (`src/throttle.ts`) — same-host
requests are spaced (`THROTTLE_DEFAULT_MS`, NCBI 400ms without key / 120ms with key),
429/5xx responses retry with backoff. Different hosts run in parallel.

Optional keys (all allowlist-filtered, server works without them):
```bash
cp .env.example .env
# TAVILY_API_KEY / BRAVE_API_KEY (web) + FACTCHECK_API_KEY (Google FactCheck)
# CONTACT_EMAIL (Crossref/OpenAlex/NCBI politeness) + NCBI_API_KEY (PubMed limits)
```

## No-code allowlist: sources.yaml

Edit `sources.yaml` to add/remove trusted domains — no code change, no rebuild of logic:

```yaml
rules:
  - { match: your-health-agency.gov, tier: 1, baseScore: 98, category: official, reason: "National health authority" }
blockedHosts:
  - noisy-blog.com
```

Point elsewhere with `SOURCES_CONFIG=/path/to/custom.yaml`. Invalid entries are ignored; missing file falls back to built-ins.

## Docker

```bash
docker build -t truth-source .
docker run -i --rm --env-file .env truth-source
# MCP stdio: attach your agent to the container's stdin/stdout
```

CI (`.github/workflows/ci.yml`) runs typecheck + build + tests on every push/PR.

## Known limitations

- **Trust-first ranking:** results sort by trust score, not query relevance, so a
  high-trust but off-topic hit (e.g. a PubMed paper matching one keyword) can rank
  above a more relevant Tier-2 source. Mitigation: `verify_claim(withQuotes=true)`
  and `fetch_evidence` confirm the claim actually appears in the cited page —
  always require quotes for strong claims. Relevance-weighted re-ranking is planned.
- **Live APIs vary:** `npm run eval:live` depends on third-party search APIs, so
  pass rates fluctuate with the network. The CI-gated suite (`tests/`, 39 cases)
  is fully deterministic and offline.
- **Preprints are opt-in:** arXiv results are excluded unless `includePreprints=true`,
  and are always flagged `[PREPRINT — verify peer-reviewed version]`.

## Eval harness

- `tests/eval.test.ts` — 20 deterministic verdict cases (CI-gated): independence,
  quote handling, citation/recency scoring, tier boundaries.
- `evals/claims.json` + `npm run eval:live` — 20 real-world claims (10 true, 10 false)
  scored against live APIs. Manual use (network-dependent, not CI-gated):
  ```bash
  npm run eval:live          # human-readable table, exits 1 below 70% pass rate
  npm run eval:live -- --json --threshold 0.8
  ```

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
- `src/sources.ts` — built-in allowlist/blocklist + exact-host matching (overridden by `sources.yaml`)
- `src/config.ts` — `sources.yaml` loader with validation + fallback
- `sources.yaml` — editable allowlist, no code changes needed
- `src/providers.ts` — Wikipedia, OpenAlex, Semantic Scholar, Crossref, PubMed, FactCheck, arXiv, Tavily, Brave + cache + quotes
- `src/throttle.ts` — per-host spacing + 429/5xx retry with backoff
- `src/trust.ts` — scoring, independent-host corroboration, verdicts
- `tests/` — vitest regression tests for matching, verdicts, cache, quotes, config, throttle, eval matrix
- `evals/claims.json` + `evals/run.ts` — live eval set + runner (`npm run eval:live`)
- `Dockerfile` + `.github/workflows/ci.yml` — container + CI
