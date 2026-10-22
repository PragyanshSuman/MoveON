// Phone-OTP login, signed session cookies, and email OTPs for community badges.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { DATA_DIR, mutate, newId, now, read } from "./db";
import type { OtpChallenge, User } from "./types";
import { sendSms } from "./notify";

const SESSION_COOKIE = "moveon_session";
const SESSION_DAYS = 30;
const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;

let cachedSecret: string | undefined;
function secret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET) return (cachedSecret = process.env.SESSION_SECRET);
  // No secret configured: generate one and keep it next to the data so sessions survive restarts.
  const file = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".session-secret");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"));
  return (cachedSecret = fs.readFileSync(file, "utf8").trim());
}

const hmac = (value: string) => crypto.createHmac("sha256", secret()).update(value).digest("base64url");

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Normalises Indian mobile numbers to +91XXXXXXXXXX. Returns null when invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null;
}

export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Whether OTP codes may be shown on screen (local development / demos without an SMS provider). */
export function showOtpOnScreen(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.MOVEON_SHOW_OTP === "true";
}

export async function requestOtp(target: string, purpose: OtpChallenge["purpose"]): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  const code = String(crypto.randomInt(100000, 1000000));
  const hourAgo = Date.now() - 3600_000;
  const recent = read().otps.filter((o) => o.target === target && Date.parse(o.expiresAt) - OTP_TTL_MS > hourAgo).length;
  if (recent >= OTP_MAX_PER_HOUR) return { ok: false, error: "Too many codes requested. Try again in an hour." };
  mutate((db) => {
    db.otps = db.otps.filter((o) => Date.parse(o.expiresAt) > hourAgo); // prune old challenges
    db.otps.push({ id: newId("otp"), target, purpose, codeHash: hmac(`${target}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(), attempts: 0 });
  });
  const text = `${code} is your MoveOn code. It expires in 10 minutes. Never share it with anyone.`;
  if (purpose === "login") await sendSms(target, text);
  else console.info(`[email:dev] to ${target}: ${text}`);
  return { ok: true, devCode: showOtpOnScreen() ? code : undefined };
}

export function verifyOtp(target: string, code: string, purpose: OtpChallenge["purpose"]): { ok: true } | { ok: false; error: string } {
  return mutate((db) => {
    const challenge = db.otps
      .filter((o) => o.target === target && o.purpose === purpose && Date.parse(o.expiresAt) > Date.now())
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0];
    if (!challenge) return { ok: false as const, error: "Code expired. Request a new one." };
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const, error: "Too many attempts. Request a new code." };
    challenge.attempts++;
    if (!safeEqual(challenge.codeHash, hmac(`${target}:${code.trim()}`))) return { ok: false as const, error: "That code doesn't match." };
    db.otps = db.otps.filter((o) => o.id !== challenge.id);
    return { ok: true as const };
  });
}

export function signSession(userId: string, days = SESSION_DAYS): string {
  const exp = Date.now() + days * 86_400_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!safeEqual(sig, hmac(`${userId}.${exp}`))) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const userId = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return read().users.find((u) => u.id === userId) ?? null;
}

export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  const admins = (process.env.ADMIN_PHONES ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return user.role === "admin" || admins.includes(user.phone);
}

/** Finds or creates the user for a verified phone number. */
export function upsertUserByPhone(phone: string, name: string | undefined, referralCode?: string): User {
  return mutate((db) => {
    const existing = db.users.find((u) => u.phone === phone);
    if (existing) return existing;
    const cleanName = (name ?? "").trim().slice(0, 60) || "MoveOn member";
    const referrer = referralCode ? db.users.find((u) => u.referralCode === referralCode.trim().toUpperCase()) : undefined;
    const user: User = {
      id: newId("u"), phone, name: cleanName, role: "user", badges: [], credit: 0,
      referralCode: (cleanName.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "MOVE") + crypto.randomInt(100, 999),
      referredBy: referrer?.id, createdAt: now(),
    };
    db.users.push(user);
    return user;
  });
}
