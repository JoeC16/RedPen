import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "@/server/csrf";

const req = (method: string, path: string, headers: Record<string, string> = {}) => ({
  method,
  url: `https://app.test${path}`,
  headers: new Headers({ host: "app.test", ...headers }),
});

describe("isCrossSiteWrite", () => {
  it("allows safe methods", () => {
    expect(isCrossSiteWrite(req("GET", "/api/classes", { origin: "https://evil.test" }))).toBe(false);
  });
  it("blocks writes from another origin", () => {
    expect(isCrossSiteWrite(req("POST", "/api/classes", { origin: "https://evil.test" }))).toBe(true);
  });
  it("allows same-origin writes", () => {
    expect(isCrossSiteWrite(req("POST", "/api/classes", { origin: "https://app.test" }))).toBe(false);
  });
  it("blocks writes with no origin unless the browser says same-origin", () => {
    expect(isCrossSiteWrite(req("DELETE", "/api/classes/x"))).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", "/api/classes/x", { "sec-fetch-site": "same-origin" }))).toBe(false);
  });
  it("leaves Auth.js endpoints to Auth.js's own CSRF token", () => {
    expect(isCrossSiteWrite(req("POST", "/api/auth/callback/credentials", { origin: "https://evil.test" }))).toBe(false);
  });
  it("treats a malformed origin as cross-site", () => {
    expect(isCrossSiteWrite(req("POST", "/api/x", { origin: "not a url" }))).toBe(true);
  });
});
