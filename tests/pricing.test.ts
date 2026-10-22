import { describe, expect, it } from "vitest";
import { buyerFee, countdownPrice, orderContribution, priceSchedule, quoteDelivery, sellerFee, suggestPrice } from "@/lib/pricing";
import { maskContacts } from "@/lib/services/orders";
import { bannedTerm } from "@/lib/services/selling";

describe("fees", () => {
  it("charges sellers 10% with a ₹49 minimum, never more than the price", () => {
    expect(sellerFee(4000)).toBe(400);
    expect(sellerFee(300)).toBe(49);
    expect(sellerFee(40)).toBe(40);
  });

  it("charges buyers 4% clamped to ₹29–199", () => {
    expect(buyerFee(4000)).toBe(160);
    expect(buyerFee(500)).toBe(29);
    expect(buyerFee(10000)).toBe(199);
    expect(buyerFee(0)).toBe(0);
  });

  it("matches the plan's ~₹470 contribution on a ₹4,000 order with truck delivery", () => {
    const c = orderContribution({ itemsTotal: 4000, sellerFees: 400, buyerFee: 160, deliveryMargin: 150, total: 4000 + 160 + 1100 });
    expect(c.gross).toBe(710);
    expect(c.contribution).toBeGreaterThan(400);
    expect(c.contribution).toBeLessThan(550);
  });
});

describe("countdown pricing", () => {
  const listedAt = "2026-06-01T00:00:00.000Z";
  const item = { listPrice: 5000, floorPrice: 3500, listedAt };

  it("drops 10% each full week", () => {
    expect(countdownPrice(item, 0.1, new Date("2026-06-03T00:00:00Z"))).toBe(5000);
    expect(countdownPrice(item, 0.1, new Date("2026-06-08T00:00:00Z"))).toBe(4500);
    expect(countdownPrice(item, 0.1, new Date("2026-06-15T00:00:00Z"))).toBe(4050);
  });

  it("never goes below the seller's floor", () => {
    expect(countdownPrice(item, 0.1, new Date("2026-08-01T00:00:00Z"))).toBe(3500);
  });

  it("builds a schedule that stops at the leaving date or floor", () => {
    const steps = priceSchedule(item, { leavingDate: "2026-06-30", dropRatePerWeek: 0.1 });
    expect(steps.map((s) => s.price)).toEqual([5000, 4500, 4050, 3650, 3500]);
  });
});

describe("delivery quotes", () => {
  it("uses a mini-truck for heavy items and adds a stop per extra seller", () => {
    const one = quoteDelivery([{ locality: "hsr-layout", heavy: true }], "koramangala");
    const two = quoteDelivery([{ locality: "hsr-layout", heavy: true }, { locality: "bellandur", heavy: false }], "koramangala");
    expect(one.vehicle).toBe("mini_truck");
    expect(one.margin).toBe(150);
    expect(two.stops).toBe(2);
    expect(two.price).toBeGreaterThan(one.price);
  });

  it("uses a two-wheeler for light items and is free with nothing to move", () => {
    expect(quoteDelivery([{ locality: "hsr-layout", heavy: false }], "hsr-layout").vehicle).toBe("two_wheeler");
    expect(quoteDelivery([], "hsr-layout").price).toBe(0);
  });
});

describe("price suggestion", () => {
  it("prices newer, better-condition, branded items higher", () => {
    const base = { category: "bed", ageMonths: 24, condition: "good" as const };
    const plain = suggestPrice(base);
    expect(suggestPrice({ ...base, ageMonths: 6 }).listPrice).toBeGreaterThan(plain.listPrice);
    expect(suggestPrice({ ...base, condition: "worn" }).listPrice).toBeLessThan(plain.listPrice);
    expect(suggestPrice({ ...base, brand: "Urban Ladder" }).listPrice).toBeGreaterThan(plain.listPrice);
    expect(plain.floorPrice).toBeLessThan(plain.listPrice);
  });
});

describe("trust and safety", () => {
  it("hides phone numbers, emails and UPI handles in chat", () => {
    expect(maskContacts("call me on +91 98765 43210")).toBe("call me on [number hidden]");
    expect(maskContacts("mail priya@example.com")).toBe("mail [email hidden]");
    expect(maskContacts("pay priya@okaxis")).toBe("pay [UPI hidden]");
    expect(maskContacts("flat 402, block 3")).toBe("flat 402, block 3");
  });

  it("flags banned items but not ordinary ones", () => {
    expect(bannedTerm("Old LPG gas cylinder")).toBeTruthy();
    expect(bannedTerm("Air rifle for sale")).toBe("rifle");
    expect(bannedTerm("Wooden study table")).toBeUndefined();
    expect(bannedTerm("Druggist cabinet")).toBeUndefined();
  });
});
