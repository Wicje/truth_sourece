/**
 * Polite per-host request scheduler: min interval between requests to the same
 * host + bounded retries with backoff. Keeps free APIs (notably NCBI) happy.
 */

const lastStart = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

export function resetThrottle(): void {
  lastStart.clear();
  chains.clear();
}

function defaultIntervalMs(): number {
  const v = Number(process.env.THROTTLE_DEFAULT_MS ?? 250);
  return Number.isFinite(v) && v >= 0 ? v : 250;
}

/** NCBI asks ≤3 req/s without key, ≤10 req/s with key. Others use the default. */
export function minIntervalFor(host: string): number {
  const h = host.toLowerCase();
  if (h.endsWith("ncbi.nlm.nih.gov")) {
    if (process.env.NCBI_API_KEY?.trim()) return 120;
    const v = Number(process.env.THROTTLE_NCBI_MS ?? 400);
    return Number.isFinite(v) && v >= 0 ? v : 400;
  }
  return defaultIntervalMs();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response, attempt: number): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.min(10000, secs * 1000);
  }
  return Math.min(4000, 500 * 2 ** attempt);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

/**
 * Fetch with per-host spacing + retries on 429/5xx (GET only).
 * Concurrent calls to *different* hosts run in parallel; same-host calls serialize.
 */
export async function throttledFetch(url: string, init?: RequestInit, timeoutMs = 12000): Promise<Response> {
  const host = hostOf(url);
  const prev = chains.get(host) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  chains.set(host, prev.then(() => gate));

  await prev;
  try {
    const method = (init?.method ?? "GET").toUpperCase();
    const maxAttempts = method === "POST" ? 1 : 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const wait = minIntervalFor(host) - (Date.now() - (lastStart.get(host) ?? 0));
      if (wait > 0) await sleep(wait);
      lastStart.set(host, Date.now());

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: ctrl.signal });
      } catch (err) {
        clearTimeout(t);
        // network/abort: retry unless last attempt
        if (attempt + 1 >= maxAttempts) throw err;
        await sleep(retryAfterMs(new Response(null, { status: 503 }), attempt));
        continue;
      } finally {
        clearTimeout(t);
      }
      if (res.ok) return res;
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt + 1 >= maxAttempts) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      await res.arrayBuffer().catch(() => undefined); // drain before retry
      await sleep(retryAfterMs(res, attempt));
    }
    throw new Error(`HTTP failed for ${url}`);
  } finally {
    release();
  }
}
