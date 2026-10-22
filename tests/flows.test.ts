// End-to-end service flows against a throwaway data directory and the mock payment provider.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@/lib/types";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moveon-test-"));
process.env.MOVEON_DATA_DIR = dir;

type Mods = {
  db: typeof import("@/lib/db");
  selling: typeof import("@/lib/services/selling");
  orders: typeof import("@/lib/services/orders");
  account: typeof import("@/lib/services/account");
  admin: typeof import("@/lib/services/admin");
  market: typeof import("@/lib/services/marketplace");
  auth: typeof import("@/lib/auth");
  pricing: typeof import("@/lib/pricing");
};
let m: Mods;

beforeAll(async () => {
  m = {
    db: await import("@/lib/db"),
    selling: await import("@/lib/services/selling"),
    orders: await import("@/lib/services/orders"),
    account: await import("@/lib/services/account"),
    admin: await import("@/lib/services/admin"),
    market: await import("@/lib/services/marketplace"),
    auth: await import("@/lib/auth"),
    pricing: await import("@/lib/pricing"),
  };
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const user = (phone: string) => m.db.read().users.find((u) => u.phone === phone)!;
const fresh = (u: User) => m.db.read().users.find((x) => x.id === u.id)!;

describe("seller → buyer → handover", () => {
  let seller: User;
  let buyer: User;
  let saleId: string;
  let itemIds: string[];

  it("seeds demo data on first read", () => {
    const db = m.db.read();
    expect(db.sales.length).toBeGreaterThan(5);
    expect(db.items.length).toBeGreaterThan(30);
  });

  it("logs in by phone OTP and creates users", async () => {
    const phone = m.auth.normalizePhone("98450 12345")!;
    expect(phone).toBe("+919845012345");
    const res = await m.auth.requestOtp(phone, "login");
    expect(res.ok).toBe(true);
    const code = (res as { devCode: string }).devCode;
    expect(m.auth.verifyOtp(phone, "000000", "login").ok).toBe(code === "000000");
    expect(m.auth.verifyOtp(phone, code, "login").ok).toBe(true);
    expect(m.auth.verifyOtp(phone, code, "login").ok).toBe(false); // single use
    seller = m.auth.upsertUserByPhone(phone, "Nisha Gupta");
    buyer = m.auth.upsertUserByPhone("+919845099999", "Kabir Singh", user("+919000000001").referralCode);
    expect(buyer.referredBy).toBe(user("+919000000001").id);
  });

  it("creates a sale and lists items", async () => {
    const sale = await m.selling.createSale(seller, { leavingDate: m.pricing.addDays(m.pricing.todayIST(), 14), locality: "hsr-layout", visibility: "public" });
    saleId = sale.id;
    expect(sale.slug).toBe("nisha-hsr");
    await expect(m.selling.createSale(seller, { leavingDate: m.pricing.addDays(m.pricing.todayIST(), 3), locality: "hsr-layout", visibility: "public" })).rejects.toThrow(/already have/);
    const items = await m.selling.addItems(seller, saleId, [
      { title: "Queen bed", category: "bed", ageMonths: 12, condition: "good", photos: [], listPrice: 6000, floorPrice: 4000 },
      { title: "Study chair", category: "chair", ageMonths: 6, condition: "like_new", photos: [], listPrice: 1200, floorPrice: 800 },
      { title: "Desk lamp", category: "lamp", ageMonths: 6, condition: "good", photos: [], listPrice: 400, floorPrice: 300 },
    ]);
    itemIds = items.map((i) => i.id);
    await expect(m.selling.addItems(seller, saleId, [{ title: "LPG gas cylinder", category: "other", ageMonths: 1, condition: "good", photos: [], listPrice: 900, floorPrice: 900 }])).rejects.toThrow(/banned/);
    expect(m.market.browse(null, { locality: "hsr-layout" }).some((v) => v.item.id === itemIds[0])).toBe(true);
  });

  it("checks out with held funds and blocks double-buying", async () => {
    const res = await m.orders.checkout(buyer, { itemIds: itemIds.slice(0, 2), fulfilment: "delivery", locality: "koramangala", slotDate: m.pricing.addDays(m.pricing.todayIST(), 1), slotWindow: "6 – 9 pm", address: "Flat 12, 5th Cross, Koramangala 4th Block" });
    const order = m.db.read().orders.find((o) => o.id === res.orderId)!;
    expect(order.status).toBe("pending_payment");
    expect(order.itemsTotal).toBe(7200);
    expect(order.buyerFee).toBe(199);
    expect(order.deliveryFee).toBeGreaterThan(0);
    const other = m.auth.upsertUserByPhone("+919845088888", "Someone Else");
    await expect(m.orders.checkout(other, { itemIds: [itemIds[0]], fulfilment: "pickup", locality: "hsr-layout" })).rejects.toThrow(/just got taken/);
    const paid = await m.orders.confirmPayment(buyer, res.orderId, { paymentId: "mpay_test" });
    expect(paid.status).toBe("active");
    expect(paid.groups[0].transferId).toBeTruthy();
    expect(paid.groups[0].sellerPayout).toBe(7200 - 600 - 120);
  });

  it("releases money only with the right OTP", async () => {
    const order = m.db.read().orders.find((o) => o.buyerId === buyer.id)!;
    const wrong = order.groups[0].handoverOtp === "0000" ? "1111" : "0000";
    await expect(m.orders.confirmHandover(seller, order.id, wrong)).rejects.toThrow(/doesn't match/);
    const done = await m.orders.confirmHandover(seller, order.id, order.groups[0].handoverOtp);
    expect(done.status).toBe("completed");
    const db = m.db.read();
    expect(db.items.find((i) => i.id === itemIds[0])!.status).toBe("sold");
    expect(db.ledger.filter((l) => l.orderId === order.id && l.kind === "seller_fee")[0].amount).toBe(720);
    // Referral: buyer was referred by the demo buyer; both get ₹200.
    expect(fresh(buyer).credit).toBe(200);
    expect(user("+919000000001").credit).toBe(200);
    await m.orders.rate(buyer, order.id, seller.id, 5, "Great");
    await expect(m.orders.rate(buyer, order.id, seller.id, 4)).rejects.toThrow(/already rated/);
  });

  it("refunds a refused handover and puts the item back on sale", async () => {
    const b = fresh(buyer);
    const res = await m.orders.checkout(b, { itemIds: [itemIds[2]], fulfilment: "pickup", locality: "hsr-layout" });
    const draft = m.db.read().orders.find((o) => o.id === res.orderId)!;
    expect(draft.creditApplied).toBe(29); // credit only offsets platform fees
    await m.orders.confirmPayment(b, res.orderId, { paymentId: "mpay_2" });
    const { refund } = await m.orders.refuseHandover(b, res.orderId, seller.id, "Lamp doesn't switch on");
    expect(refund).toBe(400);
    const db = m.db.read();
    expect(db.orders.find((o) => o.id === res.orderId)!.status).toBe("refunded");
    expect(db.items.find((i) => i.id === itemIds[2])!.status).toBe("available");
  });

  it("masks contact details in chat", async () => {
    const order = m.db.read().orders.find((o) => o.buyerId === buyer.id)!;
    const r = await m.orders.sendMessage(fresh(buyer), order.id, seller.id, "WhatsApp me on 9876543210");
    expect(r.masked).toBe(true);
  });

  it("handles disputes on held payments", async () => {
    const admin = user("+919999999999");
    const { queues } = m.admin;
    const open = queues().disputes[0];
    expect(open).toBeTruthy();
    await m.orders.resolveDispute(admin, open.dispute.id, "refund", "Photos confirm dead pixels");
    const db = m.db.read();
    expect(db.disputes.find((d) => d.id === open.dispute.id)!.status).toBe("resolved_refund");
    expect(db.orders.find((o) => o.id === open.order.id)!.status).toBe("refunded");
  });
});

describe("nothing left behind", () => {
  it("sends dealer offers five days out and lets the seller accept one", async () => {
    const report = await m.selling.runDailyJobs();
    expect(report.exitOffers).toBeGreaterThan(0);
    const db = m.db.read();
    const rahulSale = db.sales.find((s) => s.slug === "rahul-koramangala")!;
    const offer = db.dealerOffers.find((o) => o.status === "open" && db.items.find((i) => i.id === o.itemId)!.saleId === rahulSale.id)!;
    const rahul = db.users.find((u) => u.id === rahulSale.sellerId)!;
    const { item } = await m.selling.acceptOffer(rahul, offer.id);
    expect(item.status).toBe("dealer");
    expect(m.db.read().ledger.some((l) => l.kind === "dealer_referral" && l.ref === offer.id)).toBe(true);
    // Running again is idempotent.
    expect((await m.selling.runDailyJobs()).exitOffers).toBe(0);
  });

  it("books donation and e-waste pickups with a certificate", async () => {
    const db = m.db.read();
    const sale = db.sales.find((s) => s.slug === "karthik-banashankari")!;
    const karthik = db.users.find((u) => u.id === sale.sellerId)!;
    const avail = db.items.filter((i) => i.saleId === sale.id && i.status === "available");
    const fan = avail.find((i) => i.category === "fan")!;
    const books = avail.find((i) => i.category === "books" || i.category === "bucket_set")!;
    await expect(m.selling.scheduleDisposal(karthik, sale.id, [books.id], "ewaste")).rejects.toThrow(/isn't electronic/);
    const d = await m.selling.scheduleDisposal(karthik, sale.id, [fan.id], "ewaste");
    expect(d.certificateNo).toMatch(/^MO-EW-/);
  });
});

describe("buy-back guarantee", () => {
  it("lets an owner claim and MoveOn relist the item", async () => {
    const aarav = user("+919000000001");
    const owned = m.market.ownedItems(aarav.id).find((i) => i.certified)!;
    expect(m.account.buyBackStatus(owned).eligible).toBe(true);
    const claim = await m.account.claimBuyBack(aarav, owned.id);
    await m.account.completeBuyBack(user("+919999999999"), claim.id);
    const relisted = m.db.read().items.find((i) => i.id === owned.id)!;
    expect(relisted.status).toBe("available");
    expect(relisted.boughtBackFor).toBe(claim.amount);
    expect(relisted.passport.some((p) => p.event === "bought_back")).toBe(true);
  });
});

describe("community verification and kits", () => {
  it("verifies badges by work email and resident code", async () => {
    const u = m.auth.upsertUserByPhone("+919845077777", "Tara Joseph");
    await expect(m.account.startEmailBadge(u, "tara@gmail.com")).rejects.toThrow(/college or work email/);
    const { devCode } = await m.account.startEmailBadge(u, "tara@acmesoft.in");
    const after = await m.account.confirmEmailBadge(u, "tara@acmesoft.in", devCode!);
    expect(after.badges[0].label).toBe("Acme Software Labs");
    const after2 = await m.account.verifyResidentCode(after, "orbit-res");
    expect(after2.badges.map((b) => b.type)).toContain("coliving");
  });

  it("hides members-only sales from outsiders", () => {
    const outsider = user("+919000000002");
    const southfieldSale = m.market.saleBySlug("ananya-ecity", outsider)!;
    expect(southfieldSale.visible).toBe(false);
    expect(m.market.browse(outsider).some((v) => v.sale.slug === "ananya-ecity")).toBe(false);
  });

  it("assembles starter kits from live sales", () => {
    const kits = m.market.allKits(null, { locality: "hsr-layout", budget: 20000 });
    const room = kits.find((k) => k.kit.slug === "new-joiner-room")!;
    expect(room.slots.filter((s) => s.pick).length).toBeGreaterThanOrEqual(4);
    expect(room.total).toBeGreaterThan(0);
  });
});
