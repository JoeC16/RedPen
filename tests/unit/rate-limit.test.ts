import { describe, expect, it } from "vitest";
import { isRateLimited } from "@/server/auth/rate-limit";

describe("isRateLimited", () => {
  const limits = { perEmail: 5, perIp: 30 };
  it("blocks at the per-email limit", () => {
    expect(isRateLimited({ email: 4, ip: 4 }, limits)).toBe(false);
    expect(isRateLimited({ email: 5, ip: 5 }, limits)).toBe(true);
  });
  it("blocks at the per-IP limit across many emails", () => {
    expect(isRateLimited({ email: 0, ip: 30 }, limits)).toBe(true);
  });
});
