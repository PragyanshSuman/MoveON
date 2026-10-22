// Pure pricing, fee and logistics maths. No I/O here so it is easy to test.
import { category, CONDITIONS, locality } from "./catalog";
import type { Condition, Item, Sale } from "./types";

export const FEES = {
  sellerRate: 0.1,
  sellerMin: 49,
  buyerRate: 0.04,
  buyerMin: 29,
  buyerMax: 199,
  // Planning assumptions used for contribution maths.
  paymentCostRate: 0.02,
  supportCostPerOrder: 60,
  refundReserveRate: 0.02,
  referralCredit: 200,
  buyBackRatio: 0.5,
  buyBackWindowMonths: 12,
} as const;

export const BOOSTS = [
  { id: "boost_3d", label: "Boost for 3 days", price: 49, days: 3, urgent: false },
  { id: "boost_7d", label: "Boost for 7 days", price: 99, days: 7, urgent: false },
  { id: "urgent_7d", label: "Boost + Urgent badge, 7 days", price: 199, days: 7, urgent: true },
] as const;

const DAY = 86_400_000;

export const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (dates or timestamps), negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from.length === 10 ? `${from}T00:00:00Z` : from);
  const b = Date.parse(to.length === 10 ? `${to}T00:00:00Z` : to);
  return Math.floor((b - a) / DAY);
}

export function daysLeft(sale: Pick<Sale, "leavingDate">, now = new Date()): number {
  return daysBetween(todayIST(now), sale.leavingDate);
}

// ---------- Countdown pricing ----------

export function countdownPrice(
  item: Pick<Item, "listPrice" | "floorPrice" | "listedAt">,
  dropRatePerWeek: number,
  now = new Date(),
): number {
  const weeks = Math.max(0, Math.floor((now.getTime() - Date.parse(item.listedAt)) / (7 * DAY)));
  const dropped = item.listPrice * Math.pow(1 - dropRatePerWeek, weeks);
  return Math.max(item.floorPrice, roundTo(dropped, 10));
}

export interface PriceStep {
  date: string;
  price: number;
}

/** The full price schedule from listing until the leaving date. */
export function priceSchedule(
  item: Pick<Item, "listPrice" | "floorPrice" | "listedAt">,
  sale: Pick<Sale, "leavingDate" | "dropRatePerWeek">,
): PriceStep[] {
  const steps: PriceStep[] = [];
  const start = item.listedAt.slice(0, 10);
  for (let w = 0; w < 52; w++) {
    const date = addDays(start, w * 7);
    if (w > 0 && date > sale.leavingDate) break;
    const at = new Date(Date.parse(item.listedAt) + w * 7 * DAY);
    const price = countdownPrice(item, sale.dropRatePerWeek, at);
    if (steps.length && steps[steps.length - 1].price === price) break;
    steps.push({ date, price });
  }
  return steps;
}

export function nextDrop(
  item: Pick<Item, "listPrice" | "floorPrice" | "listedAt">,
  sale: Pick<Sale, "leavingDate" | "dropRatePerWeek">,
  now = new Date(),
): PriceStep | null {
  const today = todayIST(now);
  const current = countdownPrice(item, sale.dropRatePerWeek, now);
  return priceSchedule(item, sale).find((s) => s.date > today && s.price < current) ?? null;
}

// ---------- Fees ----------

export function sellerFee(price: number): number {
  return Math.min(price, Math.max(FEES.sellerMin, Math.round(price * FEES.sellerRate)));
}

export function buyerFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return Math.min(FEES.buyerMax, Math.max(FEES.buyerMin, Math.round(subtotal * FEES.buyerRate)));
}

// ---------- Logistics ----------

export function distanceKm(aSlug: string, bSlug: string): number {
  const a = locality(aSlug);
  const b = locality(bSlug);
  if (!a || !b) return 8;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(2, Math.round(straight * 1.4 * 10) / 10); // road factor, 2 km minimum
}

export interface DeliveryQuote {
  vehicle: "mini_truck" | "two_wheeler" | "none";
  km: number;
  stops: number;
  partnerCost: number;
  margin: number;
  price: number;
}

/**
 * One vehicle collects from every seller (nearest-neighbour route) and drops at the buyer.
 * Stay-in-place items never move, so they are excluded by the caller.
 */
export function quoteDelivery(pickups: { locality: string; heavy: boolean }[], dropLocality: string): DeliveryQuote {
  if (pickups.length === 0) return { vehicle: "none", km: 0, stops: 0, partnerCost: 0, margin: 0, price: 0 };
  const heavy = pickups.some((p) => p.heavy);
  const stopsList = [...new Set(pickups.map((p) => p.locality))];
  let km = 0;
  let here = stopsList[0];
  const remaining = stopsList.slice(1);
  while (remaining.length) {
    remaining.sort((x, y) => distanceKm(here, x) - distanceKm(here, y));
    const next = remaining.shift()!;
    km += here === next ? 0 : distanceKm(here, next);
    here = next;
  }
  km += here === dropLocality ? 2 : distanceKm(here, dropLocality);
  km = Math.round(km * 10) / 10;
  const stops = stopsList.length;
  const partnerCost = heavy
    ? roundTo(450 + 22 * km + 120 * (stops - 1) + 200, 10) // truck + two helpers
    : roundTo(50 + 10 * km + 40 * (stops - 1), 10);
  const margin = heavy ? 150 : 100;
  return { vehicle: heavy ? "mini_truck" : "two_wheeler", km, stops, partnerCost, margin, price: partnerCost + margin };
}

// ---------- Price suggestion (fallback when AI is unavailable, and AI sanity check) ----------

const PREMIUM_BRANDS = ["urban ladder", "herman miller", "sony", "bosch", "ifb", "dyson", "apple", "featherlite", "wakefit", "sleepwell", "duroflex", "durian"];
const KNOWN_BRANDS = ["ikea", "godrej", "lg", "samsung", "whirlpool", "haier", "pepperfry", "nilkamal", "hero", "btwin", "philips", "bajaj", "prestige", "pigeon", "havells", "crompton", "symphony", "dell", "hp", "mi", "xiaomi", "panasonic", "voltas", "usha", "orient"];

export interface PriceSuggestion {
  listPrice: number;
  floorPrice: number;
  quickSalePrice: number;
  estimatedNewPrice: number;
  reasoning: string;
}

export function suggestPrice(input: {
  category: string;
  ageMonths: number;
  condition: Condition;
  brand?: string;
  originalPrice?: number;
}): PriceSuggestion {
  const cat = category(input.category);
  const brand = (input.brand ?? "").trim().toLowerCase();
  const brandFactor = PREMIUM_BRANDS.some((b) => brand.includes(b)) ? 1.4 : KNOWN_BRANDS.some((b) => brand.includes(b)) ? 1.1 : 1;
  const estimatedNewPrice = input.originalPrice && input.originalPrice > 0 ? input.originalPrice : cat.typicalNewPrice * brandFactor;
  const years = Math.max(0, input.ageMonths) / 12;
  const depreciated = estimatedNewPrice * Math.pow(1 - cat.annualDepreciation, years);
  const cond = CONDITIONS.find((c) => c.id === input.condition)?.factor ?? 0.85;
  const usedMarketDiscount = 0.6;
  const listPrice = roundTo(depreciated * cond * usedMarketDiscount, 50);
  const floorPrice = roundTo(listPrice * 0.6, 50);
  const quickSalePrice = roundTo(listPrice * 0.4, 10);
  const reasoning =
    `New ≈ ₹${Math.round(estimatedNewPrice).toLocaleString("en-IN")}` +
    `${brandFactor > 1 ? ` (brand premium ×${brandFactor})` : ""}, ` +
    `${Math.round(cat.annualDepreciation * 100)}%/yr depreciation over ${input.ageMonths} months, ` +
    `condition ×${cond}, used-market discount ×${usedMarketDiscount}.`;
  return { listPrice, floorPrice, quickSalePrice, estimatedNewPrice: Math.round(estimatedNewPrice), reasoning };
}

// ---------- Dealer offers and buy-back ----------

export function dealerOfferAmount(currentPrice: number, ratio: number): number {
  return roundTo(currentPrice * ratio, 10);
}

export function buyBackValue(item: Pick<Item, "category" | "certified" | "soldPrice">): number {
  if (!item.certified || !item.soldPrice || !category(item.category).buyBackEligible) return 0;
  return roundTo(item.soldPrice * FEES.buyBackRatio, 50);
}

// ---------- Unit economics ----------

export interface Contribution {
  gross: number;
  paymentCost: number;
  supportCost: number;
  refundReserve: number;
  contribution: number;
}

export function orderContribution(o: {
  itemsTotal: number;
  sellerFees: number;
  buyerFee: number;
  deliveryMargin: number;
  total: number;
}): Contribution {
  const gross = o.sellerFees + o.buyerFee + o.deliveryMargin;
  const paymentCost = Math.round(o.total * FEES.paymentCostRate);
  const supportCost = FEES.supportCostPerOrder;
  const refundReserve = Math.round(o.itemsTotal * FEES.refundReserveRate);
  return { gross, paymentCost, supportCost, refundReserve, contribution: gross - paymentCost - supportCost - refundReserve };
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
