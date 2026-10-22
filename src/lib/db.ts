// A small JSON-file data store. Reads are cached and invalidated by mtime; writes are
// synchronous and atomic (temp file + rename), so each `mutate` call is a transaction
// within the single Node process. Swap this module for Postgres/Supabase in production;
// the schema in supabase/schema.sql mirrors these collections.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DB } from "./types";
import { buildSeed } from "./seed";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.MOVEON_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "uploads");
const DB_FILE = path.join(/*turbopackIgnore: true*/ DATA_DIR, "db.json");
const SCHEMA_VERSION = 1;

type Cache = { db: DB; mtimeMs: number } | null;
const g = globalThis as unknown as { __moveonDb?: Cache };

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function writeFile(db: DB) {
  ensureDirs();
  const tmp = `${DB_FILE}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, DB_FILE);
      break;
    } catch (err) {
      // Windows can briefly lock the target while another reader has it open.
      if (attempt >= 5) throw err;
      const until = Date.now() + 20 * (attempt + 1);
      while (Date.now() < until) { /* short spin before retrying */ }
    }
  }
  g.__moveonDb = { db, mtimeMs: fs.statSync(DB_FILE).mtimeMs };
}

function load(): DB {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    writeFile(buildSeed());
  }
  const mtimeMs = fs.statSync(DB_FILE).mtimeMs;
  const cached = g.__moveonDb;
  if (cached && cached.mtimeMs === mtimeMs) return cached.db;
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as DB;
  if (db.version !== SCHEMA_VERSION) throw new Error(`Data store version ${db.version} != ${SCHEMA_VERSION}; run npm run seed`);
  g.__moveonDb = { db, mtimeMs };
  return db;
}

/** Read-only snapshot. Do not mutate the returned object; use `mutate` instead. */
export function read(): DB {
  return load();
}

/** Run `fn` against a private copy of the store and persist it if `fn` doesn't throw. */
export function mutate<T>(fn: (db: DB) => T): T {
  const draft = structuredClone(load());
  const result = fn(draft);
  writeFile(draft);
  return result;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase()}`;
}

export const now = () => new Date().toISOString();
