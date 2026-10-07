import { afterEach, describe, expect, it, vi } from "vitest";
import { minIntervalFor, resetThrottle, throttledFetch } from "../src/throttle.js";

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
  resetThrottle();
  vi.unstubAllGlobals();
});

describe("minIntervalFor", () => {
  it("gives NCBI a polite default without key, faster with key", () => {
    delete process.env.NCBI_API_KEY;
    expect(minIntervalFor("eutils.ncbi.nlm.nih.gov")).toBeGreaterThanOrEqual(300);
    process.env.NCBI_API_KEY = "abc123";
    expect(minIntervalFor("eutils.ncbi.nlm.nih.gov")).toBeLessThan(300);
  });
  it("honours THROTTLE_DEFAULT_MS for generic hosts", () => {
    process.env.THROTTLE_DEFAULT_MS = "50";
    expect(minIntervalFor("api.openalex.org")).toBe(50);
  });
});

describe("throttledFetch", () => {
  it("serializes same-host requests with spacing", async () => {
    process.env.THROTTLE_DEFAULT_MS = "100";
    const seen: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        seen.push(Date.now());
        return new Response("{}", { status: 200 });
      })
    );
    const t0 = Date.now();
    await Promise.all([
      throttledFetch("https://api.openalex.org/a"),
      throttledFetch("https://api.openalex.org/b"),
    ]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(90);
    expect(seen.length).toBe(2);
  });
  it("runs different hosts in parallel", async () => {
    process.env.THROTTLE_DEFAULT_MS = "200";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const t0 = Date.now();
    await Promise.all([
      throttledFetch("https://api.openalex.org/a"),
      throttledFetch("https://api.crossref.org/b"),
    ]);
    expect(Date.now() - t0).toBeLessThan(200);
  });
  it("throws on 404 without retrying", async () => {
    const spy = vi.fn(async () => new Response("no", { status: 404 }));
    vi.stubGlobal("fetch", spy);
    await expect(throttledFetch("https://example.com/x")).rejects.toThrow("HTTP 404");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
