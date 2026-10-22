// Seller side: move-out sales, listings, boosts, and the "nothing left behind" guarantee.
import { newId, now, read } from "../db";
import { BANNED_KEYWORDS, category, locality } from "../catalog";
import { addDays, BOOSTS, countdownPrice, daysLeft, dealerOfferAmount, distanceKm, inr, todayIST } from "../pricing";
import type { Condition, DB, Item, Sale, User } from "../types";
import type { Outbox } from "../notify";
import { fail, saleIsLive, tx } from "./common";

const CONDITIONS: Condition[] = ["like_new", "good", "fair", "worn"];
const EXIT_WINDOW_DAYS = 5;

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function bannedTerm(text: string): string | undefined {
  const t = ` ${text.toLowerCase()} `;
  return BANNED_KEYWORDS.find((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
}

export function activeSaleFor(userId: string): Sale | undefined {
  return read().sales.find((s) => s.sellerId === userId && s.status === "active");
}

export interface SaleInput {
  leavingDate: string;
  locality: string;
  title?: string;
  note?: string;
  visibility: "public" | "community";
  communityPartnerId?: string;
  dropRatePerWeek?: number;
}

export async function createSale(user: User, input: SaleInput): Promise<Sale> {
  const today = todayIST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.leavingDate) || input.leavingDate < today) fail("Pick a leaving date from today onwards.");
  if (input.leavingDate > addDays(today, 120)) fail("Leaving dates can be up to 4 months away.");
  if (!locality(input.locality)) fail("Pick your locality.");
  if (input.visibility === "community" && !user.badges.some((b) => b.partnerId === input.communityPartnerId)) {
    fail("Verify your community first to run a members-only sale.");
  }
  return tx((db, outbox) => {
    if (db.sales.some((s) => s.sellerId === user.id && s.status === "active")) fail("You already have a live move-out sale.");
    const first = slugify(user.name.split(" ")[0]) || "moveout";
    const base = `${first}-${input.locality.split("-")[0]}`;
    let slug = base;
    for (let n = 2; db.sales.some((s) => s.slug === slug); n++) slug = `${base}-${n}`;
    const sale: Sale = {
      id: newId("s"), slug, sellerId: user.id,
      title: (input.title?.trim() || `${user.name.split(" ")[0]}'s move-out sale`).slice(0, 80),
      locality: input.locality, leavingDate: input.leavingDate,
      dropRatePerWeek: clampRate(input.dropRatePerWeek ?? 0.1), visibility: input.visibility,
      communityPartnerId: input.visibility === "community" ? input.communityPartnerId : undefined,
      note: input.note?.trim().slice(0, 500), status: "active", createdAt: now(),
    };
    db.sales.push(sale);
    outbox.notify(db, user.id, `Your sale page is live at /s/${slug}. Add items, then share the link in your PG and office groups.`, `/s/${slug}`);
    return sale;
  });
}

const clampRate = (r: number) => Math.min(0.25, Math.max(0, Math.round(r * 100) / 100));

export async function updateSale(user: User, saleId: string, patch: { leavingDate?: string; note?: string; title?: string; dropRatePerWeek?: number }) {
  return tx((db) => {
    const sale = ownSale(db, user, saleId);
    if (patch.leavingDate) {
      if (patch.leavingDate < todayIST()) fail("Leaving date can't be in the past.");
      sale.leavingDate = patch.leavingDate;
      sale.nothingLeftBehindAt = undefined;
    }
    if (patch.note !== undefined) sale.note = patch.note.trim().slice(0, 500);
    if (patch.title) sale.title = patch.title.trim().slice(0, 80);
    if (patch.dropRatePerWeek !== undefined) sale.dropRatePerWeek = clampRate(patch.dropRatePerWeek);
    return sale;
  });
}

function ownSale(db: DB, user: User, saleId: string): Sale {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale || (sale.sellerId !== user.id && user.role !== "admin")) fail("Sale not found.");
  return sale;
}

function ownItem(db: DB, user: User, itemId: string): Item {
  const item = db.items.find((i) => i.id === itemId);
  if (!item || (item.sellerId !== user.id && user.role !== "admin")) fail("Item not found.");
  return item;
}

export interface ItemDraft {
  title: string;
  category: string;
  brand?: string;
  ageMonths: number;
  condition: Condition;
  description?: string;
  photos: string[];
  listPrice: number;
  floorPrice: number;
  originalPrice?: number;
  availableFrom?: string;
  stayInPlace?: boolean;
  aiGenerated?: boolean;
}

export function validateDraft(d: ItemDraft, sale: Sale): ItemDraft {
  const title = d.title?.trim().slice(0, 80);
  if (!title) fail("Every item needs a title.");
  const banned = bannedTerm(`${title} ${d.description ?? ""}`);
  if (banned) fail(`"${title}" looks like a banned item (${banned}). Weapons, medicines, alcohol, gas cylinders and counterfeit goods can't be listed.`);
  if (!category(d.category) || category(d.category).id !== d.category) fail(`Pick a category for "${title}".`);
  if (!CONDITIONS.includes(d.condition)) fail(`Pick a condition for "${title}".`);
  const listPrice = Math.round(Number(d.listPrice));
  const floorPrice = Math.round(Number(d.floorPrice || listPrice));
  if (!(listPrice >= 50 && listPrice <= 500000)) fail(`Price for "${title}" must be between ₹50 and ₹5,00,000.`);
  if (!(floorPrice >= 50 && floorPrice <= listPrice)) fail(`The lowest price for "${title}" must be ₹50 or more and not above the starting price.`);
  const photos = (d.photos ?? []).filter((p) => /^\/api\/(uploads|placeholder)\/[\w.\-?=]+$/.test(p)).slice(0, 6);
  const availableFrom = d.availableFrom && d.availableFrom >= todayIST() ? (d.availableFrom > sale.leavingDate ? sale.leavingDate : d.availableFrom) : todayIST();
  return {
    title, category: d.category, brand: d.brand?.trim().slice(0, 40) || undefined,
    ageMonths: Math.max(0, Math.min(240, Math.round(Number(d.ageMonths) || 0))), condition: d.condition,
    description: (d.description ?? "").trim().slice(0, 1000), photos: photos.length ? photos : [`/api/placeholder/${d.category}`],
    listPrice, floorPrice, originalPrice: d.originalPrice ? Math.round(d.originalPrice) : undefined,
    availableFrom, stayInPlace: !!d.stayInPlace, aiGenerated: !!d.aiGenerated,
  };
}

export async function addItems(user: User, saleId: string, drafts: ItemDraft[]): Promise<Item[]> {
  if (!drafts.length) fail("Add at least one item.");
  if (drafts.length > 60) fail("A sale can hold up to 60 items.");
  return tx((db, outbox) => {
    const sale = ownSale(db, user, saleId);
    if (!saleIsLive(sale)) fail("This sale has ended.");
    const clean = drafts.map((d) => validateDraft(d, sale));
    const created = clean.map((d): Item => ({
      id: newId("i"), saleId: sale.id, sellerId: sale.sellerId, title: d.title, category: d.category, brand: d.brand,
      ageMonths: d.ageMonths, condition: d.condition, description: d.description ?? "", photos: d.photos,
      listPrice: d.listPrice, floorPrice: d.floorPrice, originalPrice: d.originalPrice,
      availableFrom: d.availableFrom!, stayInPlace: !!d.stayInPlace, status: "available", listedAt: now(), aiGenerated: d.aiGenerated,
      passport: [{ at: now(), event: "listed", note: `Listed in ${locality(sale.locality)?.name ?? sale.locality}` }],
    }));
    db.items.push(...created);
    sendMoveInAlerts(db, outbox, sale, created);
    return created;
  });
}

/** Move-in matching: tell newcomers nearby that something on their list just appeared. */
function sendMoveInAlerts(db: DB, outbox: Outbox, sale: Sale, items: Item[]) {
  if (sale.visibility !== "public") return;
  for (const u of db.users) {
    const a = u.arrival;
    if (!a || u.id === sale.sellerId || a.moveInDate < todayIST()) continue;
    if (distanceKm(a.locality, sale.locality) > 10) continue;
    const matches = items.filter((i) => a.wants.includes(i.category) && i.listPrice <= Math.max(a.budget, 1));
    if (!matches.length) continue;
    const first = matches[0];
    outbox.notify(db, u.id,
      `Move-in alert: ${first.title}${matches.length > 1 ? ` and ${matches.length - 1} more` : ""} just listed in ${locality(sale.locality)?.name}, from ${inr(first.listPrice)}. Seller leaves ${sale.leavingDate}.`,
      `/i/${first.id}`);
  }
}

export async function updateItem(user: User, itemId: string, patch: Partial<ItemDraft>) {
  return tx((db) => {
    const item = ownItem(db, user, itemId);
    if (item.status !== "available") fail("Only available items can be edited.");
    const sale = db.sales.find((s) => s.id === item.saleId)!;
    const merged = validateDraft({ ...item, ...patch, photos: patch.photos ?? item.photos } as ItemDraft, sale);
    Object.assign(item, {
      title: merged.title, category: merged.category, brand: merged.brand, ageMonths: merged.ageMonths, condition: merged.condition,
      description: merged.description, photos: merged.photos, availableFrom: merged.availableFrom, stayInPlace: merged.stayInPlace,
    });
    if (merged.listPrice !== item.listPrice || merged.floorPrice !== item.floorPrice) {
      // A manual price change restarts the countdown from the new price.
      item.listPrice = merged.listPrice;
      item.floorPrice = merged.floorPrice;
      item.listedAt = now();
    }
    return item;
  });
}

export async function setItemWithdrawn(user: User, itemId: string, withdrawn: boolean) {
  return tx((db) => {
    const item = ownItem(db, user, itemId);
    if (withdrawn && item.status !== "available") fail("Only available items can be withdrawn.");
    if (!withdrawn && item.status !== "withdrawn") fail("Item isn't withdrawn.");
    item.status = withdrawn ? "withdrawn" : "available";
    db.dealerOffers.filter((o) => o.itemId === item.id && o.status === "open").forEach((o) => (o.status = "declined"));
    return item;
  });
}

export async function boostSale(user: User, saleId: string, boostId: string) {
  const boost = BOOSTS.find((b) => b.id === boostId) ?? fail("Unknown boost.");
  return tx((db) => {
    const sale = ownSale(db, user, saleId);
    if (!saleIsLive(sale)) fail("This sale has ended.");
    const from = sale.boostedUntil && Date.parse(sale.boostedUntil) > Date.now() ? Date.parse(sale.boostedUntil) : Date.now();
    sale.boostedUntil = new Date(from + boost.days * 86_400_000).toISOString();
    if (boost.urgent) sale.urgent = true;
    // Boosts are paid from sale proceeds: deducted from the next payout, never charged up front.
    sale.boostDue = (sale.boostDue ?? 0) + boost.price;
    return sale;
  });
}

// ---------- Nothing left behind ----------

function generateOffers(db: DB, sale: Sale, at = new Date()): number {
  let created = 0;
  const items = db.items.filter((i) => i.saleId === sale.id && i.status === "available");
  for (const item of items) {
    if (db.dealerOffers.some((o) => o.itemId === item.id && o.status === "open")) continue;
    const price = countdownPrice(item, sale.dropRatePerWeek, at);
    const dealers = db.dealers.filter(
      (d) => (d.localities.includes("*") || d.localities.includes(sale.locality)) && (d.categories.includes("*") || d.categories.includes(item.category)),
    );
    for (const d of dealers) {
      db.dealerOffers.push({
        id: newId("off"), itemId: item.id, dealerId: d.id, amount: dealerOfferAmount(price, d.offerRatio),
        createdAt: at.toISOString(), expiresAt: `${sale.leavingDate}T18:29:59.000Z`, status: "open", // end of leaving day, IST
      });
      created++;
    }
  }
  return created;
}

export async function requestInstantOffers(user: User, saleId: string) {
  return tx((db) => {
    const sale = ownSale(db, user, saleId);
    if (!saleIsLive(sale)) fail("This sale has ended.");
    return generateOffers(db, sale);
  });
}

export async function acceptOffer(user: User, offerId: string) {
  return tx((db, outbox) => {
    const offer = db.dealerOffers.find((o) => o.id === offerId);
    if (!offer || offer.status !== "open" || Date.parse(offer.expiresAt) < Date.now()) fail("This offer is no longer available.");
    const item = ownItem(db, user, offer.itemId);
    if (item.status !== "available") fail("This item is no longer available.");
    const dealer = db.dealers.find((d) => d.id === offer.dealerId)!;
    offer.status = "accepted";
    db.dealerOffers.filter((o) => o.itemId === item.id && o.id !== offer.id && o.status === "open").forEach((o) => (o.status = "declined"));
    item.status = "dealer";
    item.soldPrice = offer.amount;
    item.soldAt = now();
    item.passport.push({ at: now(), event: "sold", note: `Bought by partner dealer ${dealer.name}` });
    db.ledger.push({ id: newId("l"), kind: "dealer_referral", amount: Math.round(offer.amount * dealer.referralRate), ref: offer.id, createdAt: now() });
    const sale = db.sales.find((s) => s.id === item.saleId)!;
    outbox.notify(db, user.id,
      `${dealer.name} will collect "${item.title}" and pay you ${inr(offer.amount)} in cash or UPI at pickup, before ${sale.leavingDate}.`,
      "/dashboard");
    return { item, dealer };
  });
}

export async function declineOffer(user: User, offerId: string) {
  return tx((db) => {
    const offer = db.dealerOffers.find((o) => o.id === offerId);
    if (!offer) fail("Offer not found.");
    ownItem(db, user, offer.itemId);
    if (offer.status === "open") offer.status = "declined";
    return offer;
  });
}

export const DISPOSAL_PARTNERS = {
  donation: "Share-a-Room Foundation (registered NGO)",
  ewaste: "GreenCycle Recyclers (authorised e-waste recycler)",
} as const;

export async function scheduleDisposal(user: User, saleId: string, itemIds: string[], kind: "donation" | "ewaste") {
  if (!itemIds.length) fail("Pick at least one item.");
  return tx((db, outbox) => {
    const sale = ownSale(db, user, saleId);
    const items = itemIds.map((id) => ownItem(db, user, id));
    for (const it of items) {
      if (it.saleId !== sale.id || it.status !== "available") fail(`"${it.title}" can't be scheduled.`);
      if (kind === "ewaste" && !category(it.category).ewaste) fail(`"${it.title}" isn't electronic; donate it instead.`);
    }
    const today = todayIST();
    const latest = addDays(sale.leavingDate, -1);
    let pickupDate = addDays(today, 2);
    if (pickupDate > latest) pickupDate = latest < today ? today : latest;
    const disposal = {
      id: newId("dsp"), saleId, sellerId: sale.sellerId, itemIds, kind, partnerName: DISPOSAL_PARTNERS[kind],
      pickupDate, status: "scheduled" as const, certificateNo: `MO-${kind === "donation" ? "DN" : "EW"}-${Date.now().toString(36).toUpperCase()}`,
      createdAt: now(),
    };
    db.disposals.push(disposal);
    for (const it of items) {
      it.status = kind === "donation" ? "donated" : "recycled";
      it.soldAt = now();
      it.soldPrice = 0;
      it.passport.push({ at: now(), event: "sold", note: kind === "donation" ? `Donated via ${disposal.partnerName}` : `Recycled via ${disposal.partnerName}` });
      db.dealerOffers.filter((o) => o.itemId === it.id && o.status === "open").forEach((o) => (o.status = "declined"));
    }
    outbox.notify(db, user.id,
      `${kind === "donation" ? "Donation" : "E-waste"} pickup booked for ${pickupDate} (${items.length} item${items.length > 1 ? "s" : ""}). Certificate ${disposal.certificateNo}.`,
      "/dashboard");
    return disposal;
  });
}

// ---------- Scheduled jobs ----------

/**
 * Idempotent daily maintenance: expire unpaid checkouts, close finished sales, send the
 * five-day "nothing left behind" offers, and expire stale dealer offers.
 */
export async function runDailyJobs(at = new Date()) {
  return tx((db, outbox) => {
    const report = { expiredCheckouts: 0, closedSales: 0, exitOffers: 0, expiredOffers: 0 };
    const stale = at.getTime() - 20 * 60_000;
    for (const o of db.orders) {
      if (o.status === "pending_payment" && Date.parse(o.createdAt) < stale) {
        o.status = "cancelled";
        for (const g of o.groups) for (const id of g.itemIds) {
          const it = db.items.find((i) => i.id === id);
          if (it?.status === "reserved") { it.status = "available"; it.buyerId = undefined; }
        }
        report.expiredCheckouts++;
      }
    }
    for (const offer of db.dealerOffers) {
      if (offer.status === "open" && Date.parse(offer.expiresAt) < at.getTime()) { offer.status = "expired"; report.expiredOffers++; }
    }
    for (const sale of db.sales.filter((s) => s.status === "active")) {
      const left = daysLeft(sale, at);
      if (left < 0) {
        sale.status = "closed";
        report.closedSales++;
        const unsold = db.items.filter((i) => i.saleId === sale.id && i.status === "available").length;
        outbox.notify(db, sale.sellerId, unsold
          ? `Your sale has closed with ${unsold} item${unsold > 1 ? "s" : ""} unsold. Reply here or contact support and we'll arrange a free donation pickup.`
          : "Your sale has closed and everything found a new home. Safe travels!", "/dashboard");
        continue;
      }
      if (left <= EXIT_WINDOW_DAYS && !sale.nothingLeftBehindAt) {
        const n = generateOffers(db, sale, at);
        sale.nothingLeftBehindAt = at.toISOString();
        report.exitOffers += n;
        const unsold = db.items.filter((i) => i.saleId === sale.id && i.status === "available").length;
        if (unsold) {
          outbox.notify(db, sale.sellerId,
            `${left} day${left === 1 ? "" : "s"} to go. ${n} instant cash offer${n === 1 ? "" : "s"} from partner dealers are waiting for your ${unsold} unsold item${unsold > 1 ? "s" : ""}; you can also book a free donation or e-waste pickup.`,
            "/dashboard#exit");
        }
      }
    }
    return report;
  });
}

const g = globalThis as unknown as { __moveonLastJobs?: number };
/** Runs the daily jobs at most once a minute; cheap enough to call on page loads. */
export async function housekeeping() {
  if (g.__moveonLastJobs && Date.now() - g.__moveonLastJobs < 60_000) return;
  g.__moveonLastJobs = Date.now();
  await runDailyJobs();
}
