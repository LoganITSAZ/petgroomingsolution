import { describe, expect, it } from "vitest";
import { buildCsp, SECURITY_HEADERS } from "./csp";

describe("buildCsp", () => {
  it("interpolates the given nonce into script-src", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).not.toContain("__NONCE__");
  });

  it("blocks framing by default and disables plugin content", () => {
    const csp = buildCsp("nonce-value");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows the OpenStreetMap embed used by lib/map-urls.ts", () => {
    const csp = buildCsp("nonce-value");
    expect(csp).toContain("https://www.openstreetmap.org");
  });

  it("keeps style-src permissive for inline style attributes", () => {
    const csp = buildCsp("nonce-value");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("produces a different nonce token per call site value", () => {
    expect(buildCsp("one")).not.toEqual(buildCsp("two"));
  });
});

describe("SECURITY_HEADERS", () => {
  it("includes nosniff, referrer policy and a restrictive permissions policy", () => {
    const names = SECURITY_HEADERS.map(([name]) => name);
    expect(names).toContain("X-Content-Type-Options");
    expect(names).toContain("Referrer-Policy");
    expect(names).toContain("Permissions-Policy");
  });
});

describe("upgrade-insecure-requests", () => {
  it("is omitted on a plain-http request, so subresources are not upgraded to a port serving no TLS", () => {
    expect(buildCsp("nonce-value")).not.toContain("upgrade-insecure-requests");
  });

  it("is emitted once the request arrived over https", () => {
    expect(buildCsp("nonce-value", true)).toContain("upgrade-insecure-requests");
  });
});
