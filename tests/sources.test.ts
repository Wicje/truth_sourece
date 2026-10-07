import { describe, expect, it } from "vitest";
import { getSourceTrust, hostMatches, hostnameOf, isBlocked } from "../src/sources.js";

describe("hostMatches", () => {
  it("matches exact hosts and subdomains, not substrings", () => {
    expect(hostMatches("www.cdc.gov", "cdc.gov")).toBe(true);
    expect(hostMatches("cdc.gov", "cdc.gov")).toBe(true);
    expect(hostMatches("fakecdc.gov.evil.com", "cdc.gov")).toBe(false);
  });
  it("treats bare gov/edu/int as TLD-only", () => {
    expect(hostMatches("nih.gov", "gov")).toBe(true);
    expect(hostMatches("www.nih.gov", "gov")).toBe(true);
    expect(hostMatches("governance.com", "gov")).toBe(false);
    expect(hostMatches("print.com", "int")).toBe(false);
    expect(hostMatches("something.int", "int")).toBe(true);
    expect(hostMatches("education.com", "edu")).toBe(false);
    expect(hostMatches("stanford.edu", "edu")).toBe(true);
  });
  it("does not confuse x.com with linux.com", () => {
    expect(hostMatches("x.com", "x.com")).toBe(true);
    expect(hostMatches("linux.com", "x.com")).toBe(false);
  });
});

describe("getSourceTrust", () => {
  it("trusts Tier-1 officials, distrusts blogs, blocks social", () => {
    expect(getSourceTrust("https://www.cdc.gov/vaccines/index.html").tier).toBe(1);
    expect(getSourceTrust("https://en.wikipedia.org/wiki/Malaria").tier).toBe(2);
    expect(getSourceTrust("https://randomblog12345.com/claim").trusted).toBe(false);
    expect(getSourceTrust("https://www.facebook.com/somepost").category).toBe("blocked");
    expect(getSourceTrust("https://linux.com/news").category).not.toBe("blocked");
  });
  it("parses hostnames", () => {
    expect(hostnameOf("https://WHO.INT/emergencies")).toBe("who.int");
    expect(isBlocked("https://x.com/user/status/1")).toBe(true);
    expect(isBlocked("https://linux.com/article")).toBe(false);
  });
});
