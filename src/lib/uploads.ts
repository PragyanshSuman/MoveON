// Validates and stores uploaded photos. Type is detected from magic bytes, not the filename.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "./db";

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export function sniffImage(buf: Buffer): { ext: "jpg" | "png" | "webp"; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mediaType: "image/jpeg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mediaType: "image/png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { ext: "webp", mediaType: "image/webp" };
  return null;
}

export async function readImage(file: FormDataEntryValue | null) {
  if (!file || typeof file === "string") throw new Error("No image received.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Photo is too large (max 6 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new Error("Only JPEG, PNG or WebP photos are supported.");
  return { buf, ...kind };
}

export function saveImage(buf: Buffer, ext: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name), buf);
  return `/api/uploads/${name}`;
}
