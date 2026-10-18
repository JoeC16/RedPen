/**
 * Pupil photo handling: identify the format from the bytes (never the file
 * name or the browser's claim), and strip metadata. Phone photos carry EXIF,
 * often including GPS coordinates, which could reveal where a pupil lives.
 * Only the orientation tag is kept, so photos still display the right way up.
 */

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // the AI provider's per-image limit
export const MAX_PHOTOS_PER_PUPIL = 6;

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export function sniffImageType(b: Buffer): ImageType | "heic" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heim|heis)$/.test(b.toString("ascii", 8, 12))) return "heic";
  return null;
}

/** Validate an upload and return it with metadata removed. */
export function prepareImage(bytes: Buffer): { bytes: Buffer; contentType: ImageType } {
  if (bytes.length === 0) throw new ImageError("The file is empty.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new ImageError("Each photo must be 5 MB or smaller. Try a lower camera resolution.");
  const type = sniffImageType(bytes);
  if (type === "heic") throw new ImageError("iPhone HEIC photos are not supported. Set the camera to “Most compatible” (JPEG), or export as JPEG.");
  if (!type) throw new ImageError("Upload a JPEG, PNG or WebP photo.");
  const clean = type === "image/jpeg" ? stripJpeg(bytes) : type === "image/png" ? stripPng(bytes) : stripWebp(bytes);
  return { bytes: clean, contentType: type };
}

// ---------------------------------------------------------------------------
// JPEG: drop APP1 (EXIF/XMP), APP13 (IPTC) and comments; re-add orientation.
// ---------------------------------------------------------------------------
const DROP_JPEG = new Set([0xe1, 0xed, 0xfe]);

export function stripJpeg(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)]; // SOI
  let orientation: number | null = null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new ImageError("This JPEG file looks damaged.");
    const marker = b[i + 1]!;
    if (marker === 0xd9) break; // EOI before scan: unusual, stop
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      if (orientation && orientation !== 1) out.splice(1, 0, orientationApp1(orientation));
      out.push(b.subarray(i));
      return Buffer.concat(out);
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    const seg = b.subarray(i, i + 2 + len);
    if (seg.length < 2 + len) throw new ImageError("This JPEG file looks damaged.");
    if (marker === 0xe1 && orientation === null) orientation = readExifOrientation(seg.subarray(4));
    if (!DROP_JPEG.has(marker)) out.push(seg);
    i += 2 + len;
  }
  throw new ImageError("This JPEG file looks damaged.");
}

function readExifOrientation(app1: Buffer): number | null {
  if (app1.length < 14 || app1.toString("ascii", 0, 6) !== "Exif\0\0") return null;
  const t = app1.subarray(6);
  const le = t.toString("ascii", 0, 2) === "II";
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  try {
    const ifd = u32(4);
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) === 0x0112) {
        const v = u16(e + 8);
        return v >= 1 && v <= 8 ? v : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** A minimal EXIF segment holding only the orientation tag. */
function orientationApp1(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22); // no next IFD
  const body = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------------------
// PNG: keep only the chunks needed to display the image.
// ---------------------------------------------------------------------------
const KEEP_PNG = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs"]);

export function stripPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString("ascii", i + 4, i + 8);
    const chunk = b.subarray(i, i + 12 + len);
    if (chunk.length < 12 + len) throw new ImageError("This PNG file looks damaged.");
    if (KEEP_PNG.has(type)) out.push(chunk);
    i += 12 + len;
    if (type === "IEND") return Buffer.concat(out);
  }
  throw new ImageError("This PNG file looks damaged.");
}

// ---------------------------------------------------------------------------
// WebP: drop EXIF and XMP chunks and clear their flags.
// ---------------------------------------------------------------------------
export function stripWebp(b: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = b.toString("ascii", i, i + 4);
    const size = b.readUInt32LE(i + 4);
    const total = 8 + size + (size % 2);
    const chunk = Buffer.from(b.subarray(i, i + total));
    if (chunk.length < 8 + size) throw new ImageError("This WebP file looks damaged.");
    if (fourcc === "VP8X") chunk[8] = chunk[8]! & ~0x0c; // clear EXIF (0x08) and XMP (0x04) flags
    if (fourcc !== "EXIF" && fourcc !== "XMP ") chunks.push(chunk);
    i += total;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(body.length + 4, 4);
  head.write("WEBP", 8, "ascii");
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------------------
// Bulk upload: file names start with the pupil code.
// ---------------------------------------------------------------------------

/**
 * Match "NG10M01.jpg", "ng10m01-2.jpeg", "NG10M01_page 3.png" or
 * "folder/NG10M01 (2).jpg" to a pupil code: the longest code that the file
 * name starts with, followed by the end of the name or a separator.
 */
export function codeFromFilename(name: string, codes: string[]): string | null {
  const base = name.split(/[\\/]/).pop()!.replace(/\.[A-Za-z0-9]+$/, "");
  const lower = base.toLowerCase();
  let best: string | null = null;
  for (const code of codes) {
    const c = code.toLowerCase();
    if (!lower.startsWith(c)) continue;
    const next = lower.charAt(c.length);
    if (next !== "" && !/[\s\-_.(]/.test(next)) continue;
    if (!best || code.length > best.length) best = code;
  }
  return best;
}
