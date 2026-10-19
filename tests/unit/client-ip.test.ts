import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/auth/client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("client address for sign-in limits", () => {
  it("uses the trusted proxy header when configured, ignoring a forged X-Forwarded-For", () => {
    expect(clientIp(h({ "fly-client-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4" }), "fly-client-ip")).toBe("203.0.113.9");
  });

  it("otherwise takes the right-most X-Forwarded-For entry, which the client cannot choose", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), undefined)).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP, then to nothing", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.9" }), undefined)).toBe("203.0.113.9");
    expect(clientIp(h({}), undefined)).toBe("");
  });
});
