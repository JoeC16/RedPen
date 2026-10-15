import { describe, expect, it } from "vitest";
import { decryptText, encryptText, hashKey } from "@/server/crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 9).toString("base64");

describe("pupil name encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptText("Niamh Quinlan", key);
    const b = encryptText("Niamh Quinlan", key);
    expect(a).not.toEqual(b);
    expect(a).not.toContain("Niamh");
    expect(decryptText(a, key)).toBe("Niamh Quinlan");
  });

  it("rejects the wrong key and tampered ciphertext", () => {
    const token = encryptText("Rory Marsh", key);
    expect(() => decryptText(token, otherKey)).toThrow();
    const parts = token.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptText(parts.join("."), key)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptText("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("hashKey", () => {
  it("normalises case and whitespace and does not contain the input", () => {
    expect(hashKey(" A@B.test ")).toBe(hashKey("a@b.test"));
    expect(hashKey("a@b.test")).toMatch(/^[0-9a-f]{64}$/);
  });
});
