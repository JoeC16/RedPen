import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LocalStorage } from "@/server/storage/local";
import { signedFileUrl, verifyFileUrl } from "@/server/storage/signed-url";
import { codeFromFilename, ImageError, MAX_PHOTO_BYTES, prepareImage, sniffImageType, stripJpeg, stripPng, stripWebp } from "@/server/uploads/image";

// --- tiny synthetic files with real container structure --------------------
function seg(marker: number, body: Buffer): Buffer {
  const h = Buffer.alloc(4);
  h.writeUInt16BE(0xff00 | marker, 0);
  h.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([h, body]);
}
/** EXIF with Orientation=6 and a GPS IFD pointer, little-endian. */
function exifApp1(): Buffer {
  const t = Buffer.alloc(40);
  t.write("II", 0, "ascii");
  t.writeUInt16LE(42, 2);
  t.writeUInt32LE(8, 4);
  t.writeUInt16LE(2, 8);
  t.writeUInt16LE(0x0112, 10); // orientation
  t.writeUInt16LE(3, 12);
  t.writeUInt32LE(1, 14);
  t.writeUInt16LE(6, 18);
  t.writeUInt16LE(0x8825, 22); // GPS IFD pointer
  t.writeUInt16LE(4, 24);
  t.writeUInt32LE(1, 26);
  t.writeUInt32LE(0, 30);
  return seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "ascii"), t, Buffer.from("GPS 54.597N 5.930W")]));
}
const scan = Buffer.concat([Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x00]), Buffer.from("IMAGEDATA"), Buffer.from([0xff, 0xd9])]);
const jpeg = (...segs: Buffer[]) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segs, scan]);

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]); // CRC not checked here
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function riffChunk(fourcc: string, data: Buffer): Buffer {
  const h = Buffer.alloc(8);
  h.write(fourcc, 0, "ascii");
  h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
function webp(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const h = Buffer.alloc(12);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(body.length + 4, 4);
  h.write("WEBP", 8, "ascii");
  return Buffer.concat([h, body]);
}

describe("file type detection", () => {
  it("identifies formats from bytes, not names", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(Buffer.concat([PNG_SIG, pngChunk("IEND", Buffer.alloc(0))]))).toBe("image/png");
    expect(sniffImageType(webp(riffChunk("VP8 ", Buffer.from("x"))))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
  it("explains HEIC, oversize and unsupported files", () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(12)]);
    expect(() => prepareImage(heic)).toThrow(/HEIC/);
    expect(() => prepareImage(Buffer.alloc(MAX_PHOTO_BYTES + 1, 0xff))).toThrow(/5 MB/);
    expect(() => prepareImage(Buffer.from("GIF89a..."))).toThrow(ImageError);
    expect(() => prepareImage(Buffer.alloc(0))).toThrow(/empty/);
  });
});

describe("metadata stripping", () => {
  it("removes EXIF (including GPS) and comments from JPEGs but keeps the orientation", () => {
    const app0 = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary"));
    const comment = seg(0xfe, Buffer.from("Taken at 12 Example Road"));
    const out = stripJpeg(jpeg(app0, exifApp1(), comment));
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.toString("binary")).not.toContain("GPS");
    expect(out.toString("binary")).not.toContain("Example Road");
    expect(out.toString("binary")).toContain("JFIF");
    expect(out.subarray(-scan.length)).toEqual(scan);
    // The only EXIF left is a single orientation tag with value 6.
    const i = out.indexOf(Buffer.from("Exif\0\0", "ascii"));
    expect(i).toBeGreaterThan(0);
    expect(out.readUInt16BE(i + 6 + 18)).toBe(6);
  });
  it("adds no EXIF when the orientation is normal or absent", () => {
    expect(stripJpeg(jpeg())).toEqual(jpeg());
  });
  it("rejects a truncated JPEG", () => {
    expect(() => stripJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x50]))).toThrow(/damaged/);
  });
  it("keeps only display chunks in PNGs", () => {
    const png = Buffer.concat([
      PNG_SIG,
      pngChunk("IHDR", Buffer.alloc(13)),
      pngChunk("tEXt", Buffer.from("Location\0Belfast")),
      pngChunk("eXIf", Buffer.from("MM\0*GPS")),
      pngChunk("IDAT", Buffer.from("pixels")),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    const out = stripPng(png);
    expect(out.toString("binary")).not.toMatch(/Location|GPS/);
    expect(out.toString("binary")).toContain("IHDR");
    expect(out.toString("binary")).toContain("pixels");
  });
  it("drops EXIF and XMP chunks from WebP and fixes the header", () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x0c; // EXIF + XMP flags
    const out = stripWebp(webp(riffChunk("VP8X", vp8x), riffChunk("VP8 ", Buffer.from("frame")), riffChunk("EXIF", Buffer.from("GPS here")), riffChunk("XMP ", Buffer.from("<x/>"))));
    expect(out.toString("binary")).not.toMatch(/GPS|<x\/>/);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20]! & 0x0c).toBe(0);
  });
});

describe("matching photo file names to pupil codes", () => {
  const codes = ["NG10M01", "NG10M02", "NG10M1", "AB-01"];
  it.each([
    ["NG10M01.jpg", "NG10M01"],
    ["ng10m01-2.JPEG", "NG10M01"],
    ["NG10M02_page 3.png", "NG10M02"],
    ["Year 10/NG10M01 (2).jpg", "NG10M01"],
    ["NG10M1.jpg", "NG10M1"],
    ["AB-01-2.jpg", "AB-01"],
  ])("%s → %s", (name, code) => {
    expect(codeFromFilename(name, codes)).toBe(code);
  });
  it.each(["NG10M012.jpg", "IMG_2041.jpg", "scan.png", "XNG10M01.jpg"])("%s matches no pupil", (name) => {
    expect(codeFromFilename(name, codes)).toBeNull();
  });
});

describe("signed file URLs", () => {
  vi.stubEnv("AUTH_SECRET", "unit-test-secret");
  const url = new URL(signedFileUrl("file-1", "user-a", 1_000_000_000_000), "http://x");
  const e = url.searchParams.get("e");
  const s = url.searchParams.get("s");
  it("verify for the same file and user before expiry", () => {
    expect(verifyFileUrl("file-1", "user-a", e, s, 1_000_000_000_000)).toBe(true);
  });
  it("expire after the time limit (5 minutes by default)", () => {
    expect(verifyFileUrl("file-1", "user-a", e, s, 1_000_000_000_000 + 301_000)).toBe(false);
  });
  it("do not work for another user, another file, or a changed expiry", () => {
    expect(verifyFileUrl("file-1", "user-b", e, s, 1_000_000_000_000)).toBe(false);
    expect(verifyFileUrl("file-2", "user-a", e, s, 1_000_000_000_000)).toBe(false);
    expect(verifyFileUrl("file-1", "user-a", String(Number(e) + 3600), s, 1_000_000_000_000)).toBe(false);
    expect(verifyFileUrl("file-1", "user-a", e, null, 1_000_000_000_000)).toBe(false);
  });
});

describe("LocalStorage", () => {
  it("stores, reads and deletes, and refuses keys that escape its folder", async () => {
    const store = new LocalStorage(mkdtempSync(path.join(tmpdir(), "redpen-store-")));
    await store.put("school/a.jpg", Buffer.from("x"), "image/jpeg");
    expect((await store.get("school/a.jpg")).toString()).toBe("x");
    await store.delete("school/a.jpg");
    await expect(store.get("school/a.jpg")).rejects.toThrow();
    await expect(store.put("../escape.jpg", Buffer.from("x"), "image/jpeg")).rejects.toThrow(/invalid/);
    await expect(store.get("/etc/passwd")).rejects.toThrow(/invalid/);
  });
});
