// Read-side queries for the buyer experience: browse, sale pages, item pages, kits, localities.
import { read } from "../db";
import { category, KITS, LOCALITIES, type KitTemplate } from "../catalog";
import { distanceKm, priceSchedule, quoteDelivery, type DeliveryQuote } from "../pricing";
import type { DB, Item, User } from "../types";
import { canSeeSale, publicUser, saleIsLive, sellerRating, viewItem, type ItemView } from "./common";

export interface BrowseFilters {
  q?: string;
  locality?: string;
  near?: string;
  category?: string;
  group?: string;
  maxPrice?: number;
  availableBy?: string;
  verifiedOnly?: boolean;
  stayInPlace?: boolean;
  sort?: "ending" | "price" | "new" | "nearest";
}

function liveItems(db: DB, user: User | null, now = new Date()): ItemView[] {
  return db.items
    .filter((i) => i.status === "available")
    .map((i) => viewItem(db, i, now))
    .filter((v) => saleIsLive(v.sale, now) && canSeeSale(v.sale, user));
}

export function browse(user: User | null, f: BrowseFilters = {}): ItemView[] {
  const db = read();
  const q = f.q?.trim().toLowerCase();
  let out = liveItems(db, user).filter((v) => {
    if (q && !`${v.item.title} ${v.item.brand ?? ""} ${category(v.item.category).label}`.toLowerCase().includes(q)) return false;
    if (f.locality && v.sale.locality !== f.locality) return false;
    if (f.category && v.item.category !== f.category) return false;
    if (f.group && category(v.item.category).group !== f.group) return false;
    if (f.maxPrice && v.price > f.maxPrice) return false;
    if (f.availableBy && v.item.availableFrom > f.availableBy) return false;
    if (f.verifiedOnly && v.seller.badges.length === 0) return false;
    if (f.stayInPlace && !v.item.stayInPlace) return false;
    return true;
  });
  const near = f.near ?? f.locality;
  const sort = f.sort ?? (near ? "nearest" : "ending");
  const boosted = (v: ItemView) => (v.sale.boostedUntil && Date.parse(v.sale.boostedUntil) > Date.now() ? 1 : 0);
  out = out.sort((a, b) => {
    if (sort === "price") return a.price - b.price;
    if (sort === "new") return b.item.listedAt.localeCompare(a.item.listedAt);
    if (sort === "nearest" && near) return distanceKm(near, a.sale.locality) - distanceKm(near, b.sale.locality) || boosted(b) - boosted(a);
    return a.daysLeft - b.daysLeft || boosted(b) - boosted(a);
  });
  return out;
}

export interface SaleSummary {
  id: string;
  slug: string;
  title: string;
  locality: string;
  leavingDate: string;
  daysLeft: number;
  seller: Pick<User, "id" | "name" | "badges">;
  available: number;
  total: number;
  fromPrice: number;
  cover: string[];
  boosted: boolean;
  urgent: boolean;
  community: boolean;
}

export function liveSales(user: User | null, opts: { locality?: string; partnerId?: string; limit?: number } = {}): SaleSummary[] {
  const db = read();
  const views = liveItems(db, user);
  const sales = db.sales
    .filter((s) => saleIsLive(s) && canSeeSale(s, user))
    .filter((s) => !opts.locality || s.locality === opts.locality)
    .filter((s) => {
      if (!opts.partnerId) return true;
      const seller = db.users.find((u) => u.id === s.sellerId);
      return s.communityPartnerId === opts.partnerId || !!seller?.badges.some((b) => b.partnerId === opts.partnerId);
    })
    .map((s): SaleSummary => {
      const its = views.filter((v) => v.sale.id === s.id);
      const all = db.items.filter((i) => i.saleId === s.id && i.status !== "withdrawn");
      const seller = db.users.find((u) => u.id === s.sellerId)!;
      const boosted = !!s.boostedUntil && Date.parse(s.boostedUntil) > Date.now();
      return {
        id: s.id, slug: s.slug, title: s.title, locality: s.locality, leavingDate: s.leavingDate,
        daysLeft: its[0]?.daysLeft ?? viewItemDays(s.leavingDate), seller: publicUser(seller),
        available: its.length, total: all.length, fromPrice: its.length ? Math.min(...its.map((v) => v.price)) : 0,
        cover: its.slice(0, 4).map((v) => v.item.photos[0]), boosted, urgent: !!s.urgent || (its[0]?.daysLeft ?? 99) <= 5,
        community: s.visibility === "community",
      };
    })
    .filter((s) => s.available > 0)
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || a.daysLeft - b.daysLeft);
  return opts.limit ? sales.slice(0, opts.limit) : sales;
}

function viewItemDays(leavingDate: string) {
  return Math.floor((Date.parse(`${leavingDate}T00:00:00Z`) - Date.now()) / 86_400_000);
}

export function saleBySlug(slug: string, user: User | null) {
  const db = read();
  const sale = db.sales.find((s) => s.slug === slug);
  if (!sale) return null;
  const seller = db.users.find((u) => u.id === sale.sellerId)!;
  const visible = canSeeSale(sale, user);
  const items = visible
    ? db.items.filter((i) => i.saleId === sale.id && i.status !== "withdrawn").map((i) => viewItem(db, i))
    : [];
  const partner = sale.communityPartnerId ? db.partners.find((p) => p.id === sale.communityPartnerId) : undefined;
  return {
    sale, seller: publicUser(seller), visible, partner, items,
    rating: sellerRating(db, seller.id), live: saleIsLive(sale),
    isOwner: user?.id === sale.sellerId,
  };
}

export function itemById(id: string, user: User | null) {
  const db = read();
  const item = db.items.find((i) => i.id === id);
  if (!item) return null;
  const view = viewItem(db, item);
  if (!canSeeSale(view.sale, user)) return { view, visible: false as const };
  const similar = liveItems(db, user)
    .filter((v) => v.item.category === item.category && v.item.id !== item.id)
    .sort((a, b) => distanceKm(view.sale.locality, a.sale.locality) - distanceKm(view.sale.locality, b.sale.locality))
    .slice(0, 4);
  const reviews = db.ratings
    .filter((r) => r.toId === item.sellerId)
    .slice(-3)
    .reverse()
    .map((r) => ({ ...r, from: publicUser(db.users.find((u) => u.id === r.fromId)!).name }));
  return { view, visible: true as const, schedule: priceSchedule(item, view.sale), similar, reviews };
}

// ---------- Starter Kits ----------

export interface KitResult {
  kit: KitTemplate;
  slots: { label: string; pick?: ItemView; alternatives: ItemView[] }[];
  total: number;
  sellers: number;
  delivery: DeliveryQuote;
  overBudget: boolean;
  complete: boolean;
}

/**
 * Assembles a kit from nearby live sales: cheapest item per slot, penalised by distance,
 * by needing an extra seller stop, and by not being available before the move-in date.
 */
export function assembleKit(kit: KitTemplate, user: User | null, opts: { locality?: string; budget?: number; moveInDate?: string }): KitResult {
  const db = read();
  const pool = liveItems(db, user);
  const home = opts.locality ?? "koramangala";
  const pickedSellers = new Set<string>();
  const usedItems = new Set<string>();
  const slots = kit.slots.map((slot) => {
    const candidates = pool
      .filter((v) => slot.categories.includes(v.item.category) && !usedItems.has(v.item.id))
      .map((v) => {
        let score = v.price + distanceKm(home, v.sale.locality) * 30;
        if (!pickedSellers.has(v.item.sellerId)) score += pickedSellers.size ? 150 : 0;
        if (opts.moveInDate && v.item.availableFrom > opts.moveInDate) score += 5000;
        return { v, score };
      })
      .sort((a, b) => a.score - b.score);
    const pick = candidates[0]?.v;
    if (pick) {
      pickedSellers.add(pick.item.sellerId);
      usedItems.add(pick.item.id);
    }
    return { label: slot.label, pick, alternatives: candidates.slice(1, 4).map((c) => c.v) };
  });
  const picks = slots.flatMap((s) => (s.pick ? [s.pick] : []));
  const total = picks.reduce((a, v) => a + v.price, 0);
  const delivery = quoteDelivery(
    picks.filter((v) => !v.item.stayInPlace).map((v) => ({ locality: v.sale.locality, heavy: v.heavy })),
    home,
  );
  return {
    kit, slots, total, sellers: pickedSellers.size, delivery,
    overBudget: !!opts.budget && total + delivery.price > opts.budget,
    complete: picks.length === kit.slots.length,
  };
}

export function allKits(user: User | null, opts: { locality?: string; budget?: number; moveInDate?: string }) {
  return KITS.map((k) => assembleKit(k, user, opts));
}

// ---------- Localities, partners and headline stats ----------

export function localityStats(slug: string, user: User | null) {
  const db = read();
  const items = db.items.filter((i) => db.sales.find((s) => s.id === i.saleId)?.locality === slug);
  const rehomed = items.filter((i) => ["sold", "dealer", "donated", "recycled"].includes(i.status));
  const sold = items.filter((i) => i.status === "sold" && i.soldAt);
  const avgDays = sold.length
    ? Math.round((sold.reduce((a, i) => a + (Date.parse(i.soldAt!) - Date.parse(i.listedAt)) / 86_400_000, 0) / sold.length) * 10) / 10
    : null;
  const live = browse(user, { locality: slug });
  const byCategory = new Map<string, number>();
  for (const v of live) byCategory.set(v.item.category, (byCategory.get(v.item.category) ?? 0) + 1);
  return {
    listed: items.length, rehomed: rehomed.length, avgDaysToSale: avgDays, liveCount: live.length,
    topCategories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    cheapest: [...live].sort((a, b) => a.price - b.price).slice(0, 8),
  };
}

export function partnerBySlug(slug: string) {
  const db = read();
  const partner = db.partners.find((p) => p.slug === slug);
  if (!partner) return null;
  const members = db.users.filter((u) => u.badges.some((b) => b.partnerId === partner.id)).length;
  return { partner, members };
}

export function partners() {
  return read().partners;
}

export function headlineStats() {
  const db = read();
  const rehomed = db.items.filter((i) => ["sold", "dealer", "donated", "recycled"].includes(i.status)).length;
  const liveSaleCount = db.sales.filter((s) => saleIsLive(s)).length;
  return { rehomed, liveSaleCount, listed: db.items.length, localities: LOCALITIES.filter((l) => l.beachhead).length };
}

export function ownedItems(userId: string): Item[] {
  return read().items.filter((i) => i.buyerId === userId && i.status === "sold");
}
