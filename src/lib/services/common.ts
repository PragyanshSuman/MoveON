import { mutate, read } from "../db";
import { Outbox } from "../notify";
import { category } from "../catalog";
import { countdownPrice, daysLeft, nextDrop, todayIST } from "../pricing";
import type { DB, Item, Sale, User } from "../types";

/** An error whose message is safe to show to the user. */
export class AppError extends Error {}

export function fail(message: string): never {
  throw new AppError(message);
}

/** Runs a data transaction, then sends any queued WhatsApp messages. */
export async function tx<T>(fn: (db: DB, outbox: Outbox) => T): Promise<T> {
  const outbox = new Outbox();
  const result = mutate((db) => fn(db, outbox));
  await outbox.flush();
  return result;
}

export function canSeeSale(sale: Sale, user: User | null): boolean {
  if (sale.visibility === "public") return true;
  if (!user) return false;
  if (user.id === sale.sellerId || user.role === "admin") return true;
  return user.badges.some((b) => b.partnerId === sale.communityPartnerId);
}

export function saleIsLive(sale: Sale, now = new Date()): boolean {
  return sale.status === "active" && daysLeft(sale, now) >= 0;
}

export interface ItemView {
  item: Item;
  sale: Sale;
  seller: Pick<User, "id" | "name" | "badges">;
  price: number;
  nextDrop: { date: string; price: number } | null;
  daysLeft: number;
  heavy: boolean;
  /** Seller rating summary */
  rating: { avg: number; count: number };
}

export function sellerRating(db: DB, userId: string) {
  const rs = db.ratings.filter((r) => r.toId === userId);
  return { avg: rs.length ? Math.round((rs.reduce((a, r) => a + r.stars, 0) / rs.length) * 10) / 10 : 0, count: rs.length };
}

export function publicUser(u: User): Pick<User, "id" | "name" | "badges"> {
  // First name + initial only: full names and phone numbers never leave the server.
  const [first, ...rest] = u.name.split(" ");
  return { id: u.id, name: rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first, badges: u.badges };
}

export function viewItem(db: DB, item: Item, now = new Date()): ItemView {
  const sale = db.sales.find((s) => s.id === item.saleId)!;
  const seller = db.users.find((u) => u.id === item.sellerId)!;
  return {
    item,
    sale,
    seller: publicUser(seller),
    price: countdownPrice(item, sale.dropRatePerWeek, now),
    nextDrop: nextDrop(item, sale, now),
    daysLeft: daysLeft(sale, now),
    heavy: category(item.category).heavy,
    rating: sellerRating(db, seller.id),
  };
}

export function snapshot(): DB {
  return read();
}

export { todayIST };
