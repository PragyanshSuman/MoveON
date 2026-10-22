// Buying: cart quotes, checkout with held payments, OTP handover, refusals, disputes, ratings, chat.
import crypto from "node:crypto";
import { newId, now, read } from "../db";
import { locality, localityName } from "../catalog";
import { buyerFee, daysLeft, FEES, inr, quoteDelivery, sellerFee, todayIST, type DeliveryQuote } from "../pricing";
import { payments, type TransferRequest } from "../payments";
import type { DB, Order, OrderGroup, User } from "../types";
import type { Outbox } from "../notify";
import { canSeeSale, fail, publicUser, saleIsLive, tx, viewItem, type ItemView } from "./common";

const OTP_MAX_ATTEMPTS = 5;
const DISPUTE_WINDOW_HOURS = 48;

export const SLOT_WINDOWS = ["9 am – 12 pm", "12 – 3 pm", "3 – 6 pm", "6 – 9 pm"] as const;

export interface CartQuote {
  lines: ItemView[];
  unavailable: string[];
  groups: { sellerId: string; sellerName: string; saleSlug: string; locality: string; leavingDate: string; items: ItemView[]; subtotal: number }[];
  itemsTotal: number;
  buyerFee: number;
  delivery: DeliveryQuote;
  creditAvailable: number;
  creditApplied: number;
  total: number;
  latestSlotDate: string;
  warnings: string[];
}

export function cartQuote(
  user: User | null,
  itemIds: string[],
  opts: { fulfilment: "pickup" | "delivery"; locality: string; useCredit?: boolean },
  db: DB = read(),
): CartQuote {
  const lines: ItemView[] = [];
  const unavailable: string[] = [];
  const warnings: string[] = [];
  for (const id of [...new Set(itemIds)]) {
    const item = db.items.find((i) => i.id === id);
    if (!item) continue;
    const v = viewItem(db, item);
    const reservedByMe = item.status === "reserved" && user && item.buyerId === user.id;
    if ((item.status !== "available" && !reservedByMe) || !saleIsLive(v.sale) || !canSeeSale(v.sale, user)) {
      unavailable.push(item.title);
      continue;
    }
    if (user && item.sellerId === user.id) {
      warnings.push(`"${item.title}" is your own listing and was skipped.`);
      continue;
    }
    lines.push(v);
  }
  const bySeller = new Map<string, ItemView[]>();
  for (const v of lines) bySeller.set(v.item.sellerId, [...(bySeller.get(v.item.sellerId) ?? []), v]);
  const groups = [...bySeller.entries()].map(([sellerId, items]) => ({
    sellerId, sellerName: items[0].seller.name, saleSlug: items[0].sale.slug, locality: items[0].sale.locality,
    leavingDate: items[0].sale.leavingDate, items, subtotal: items.reduce((a, v) => a + v.price, 0),
  }));
  const itemsTotal = groups.reduce((a, g) => a + g.subtotal, 0);
  const fee = buyerFee(itemsTotal);
  const moving = lines.filter((v) => !v.item.stayInPlace);
  const delivery = opts.fulfilment === "delivery"
    ? quoteDelivery(moving.map((v) => ({ locality: v.sale.locality, heavy: v.heavy })), opts.locality)
    : quoteDelivery([], opts.locality);
  if (opts.fulfilment === "pickup" && moving.some((v) => v.heavy)) {
    warnings.push("Some items are heavy. For self-pickup you'll need a mini-truck and a helper.");
  }
  if (lines.some((v) => v.item.stayInPlace)) {
    warnings.push("Stay-in-place items are handed over where they are, for the next tenant of that room or flat; no delivery is needed.");
  }
  const latestSlotDate = groups.length ? groups.map((g) => g.leavingDate).sort()[0] : todayIST();
  const creditAvailable = user?.credit ?? 0;
  // Referral credit is platform-funded, so it can only offset MoveOn's own fees, never seller payouts.
  const creditApplied = opts.useCredit === false ? 0 : Math.min(creditAvailable, fee + delivery.price);
  return {
    lines, unavailable, groups, itemsTotal, buyerFee: fee, delivery, creditAvailable, creditApplied,
    total: itemsTotal + fee + delivery.price - creditApplied, latestSlotDate, warnings,
  };
}

export interface CheckoutInput {
  itemIds: string[];
  fulfilment: "pickup" | "delivery";
  locality: string;
  slotDate?: string;
  slotWindow?: string;
  address?: string;
  useCredit?: boolean;
}

function releaseItems(db: DB, order: Order) {
  for (const g of order.groups) for (const id of g.itemIds) {
    const it = db.items.find((i) => i.id === id);
    if (it && (it.status === "reserved" || it.status === "sold") && it.buyerId === order.buyerId) {
      it.status = "available";
      it.buyerId = undefined;
      it.soldPrice = undefined;
      it.soldAt = undefined;
    }
  }
}

export async function checkout(user: User, input: CheckoutInput) {
  if (!input.itemIds.length) fail("Your cart is empty.");
  if (!locality(input.locality)) fail("Pick your locality.");
  if (input.fulfilment === "delivery") {
    if (!input.address || input.address.trim().length < 10) fail("Enter a delivery address (flat, building, street).");
    if (!input.slotDate || !SLOT_WINDOWS.includes(input.slotWindow as (typeof SLOT_WINDOWS)[number])) fail("Pick a delivery slot.");
  }

  const order = await tx((db) => {
    const q = cartQuote(user, input.itemIds, { fulfilment: input.fulfilment, locality: input.locality, useCredit: input.useCredit }, db);
    if (q.unavailable.length) fail(`Sorry, ${q.unavailable.join(", ")} just got taken. Remove it from your cart to continue.`);
    if (!q.lines.length) fail("Your cart is empty.");
    if (input.fulfilment === "delivery" && (input.slotDate! < todayIST() || input.slotDate! > q.latestSlotDate)) {
      fail(`Pick a delivery date between today and ${q.latestSlotDate}, before the seller leaves.`);
    }
    const groups: OrderGroup[] = q.groups.map((g) => {
      const prices = Object.fromEntries(g.items.map((v) => [v.item.id, v.price]));
      const fee = g.items.reduce((a, v) => a + sellerFee(v.price), 0);
      const sale = db.sales.find((s) => s.slug === g.saleSlug)!;
      const gross = g.subtotal - fee;
      const boost = Math.min(sale.boostDue ?? 0, gross);
      return {
        sellerId: g.sellerId, saleId: sale.id, itemIds: g.items.map((v) => v.item.id), prices, subtotal: g.subtotal,
        sellerFee: fee, sellerPayout: gross - boost, boostDeducted: boost || undefined,
        handoverOtp: String(crypto.randomInt(1000, 10000)), status: "held",
      };
    });
    const o: Order = {
      id: newId("o"), buyerId: user.id, createdAt: now(), status: "pending_payment", fulfilment: input.fulfilment,
      slot: input.fulfilment === "delivery" ? { date: input.slotDate!, window: input.slotWindow! } : undefined,
      address: input.fulfilment === "delivery" ? input.address!.trim().slice(0, 300) : undefined,
      locality: input.locality, itemsTotal: q.itemsTotal, buyerFee: q.buyerFee, deliveryFee: q.delivery.price,
      deliveryPartnerCost: q.delivery.partnerCost, creditApplied: q.creditApplied, total: q.total,
      payment: { provider: payments().name, refundedAmount: 0 }, groups,
    };
    for (const g of groups) for (const id of g.itemIds) {
      const it = db.items.find((i) => i.id === id)!;
      it.status = "reserved";
      it.buyerId = user.id;
    }
    db.orders.push(o);
    return o;
  });

  const transfers = transferRequests(order);
  try {
    const created = await payments().createOrder({ receipt: order.id, amount: order.total, transfers });
    await tx((db) => {
      const o = db.orders.find((x) => x.id === order.id)!;
      o.payment.providerOrderId = created.providerOrderId;
    });
    return { orderId: order.id, checkout: created.checkout };
  } catch (err) {
    await tx((db) => {
      const o = db.orders.find((x) => x.id === order.id)!;
      o.status = "cancelled";
      releaseItems(db, o);
    });
    fail(err instanceof Error ? err.message : "Payment could not be started.");
  }
}

function transferRequests(order: Order, db: DB = read()): TransferRequest[] {
  return order.groups.map((g) => ({
    sellerId: g.sellerId,
    account: db.users.find((u) => u.id === g.sellerId)?.razorpayAccountId,
    amount: g.sellerPayout,
  }));
}

export async function confirmPayment(user: User, orderId: string, proof: { paymentId: string; signature?: string }) {
  const order = read().orders.find((o) => o.id === orderId);
  if (!order || order.buyerId !== user.id) fail("Order not found.");
  if (order.status !== "pending_payment") return order;
  const provider = payments();
  if (!provider.verifySignature({ providerOrderId: order.payment.providerOrderId ?? "", paymentId: proof.paymentId, signature: proof.signature ?? "" })) {
    fail("We couldn't verify this payment. If money was debited it will be refunded automatically.");
  }
  const transferIds = await provider.transfersFor({ paymentId: proof.paymentId, transfers: transferRequests(order) });
  return tx((db, outbox) => {
    const o = db.orders.find((x) => x.id === orderId)!;
    if (o.status !== "pending_payment") fail("This checkout expired. Your payment will be refunded; please try again.");
    o.status = "active";
    o.payment.paymentId = proof.paymentId;
    o.payment.paidAt = now();
    const buyer = db.users.find((u) => u.id === o.buyerId)!;
    buyer.credit = Math.max(0, buyer.credit - o.creditApplied);
    db.ledger.push({ id: newId("l"), kind: "buyer_fee", amount: o.buyerFee, orderId: o.id, createdAt: now() });
    if (o.deliveryFee) db.ledger.push({ id: newId("l"), kind: "delivery_margin", amount: o.deliveryFee - o.deliveryPartnerCost, orderId: o.id, createdAt: now() });
    for (const g of o.groups) {
      g.transferId = transferIds[g.sellerId];
      if (g.boostDeducted) {
        const sale = db.sales.find((s) => s.id === g.saleId)!;
        sale.boostDue = Math.max(0, (sale.boostDue ?? 0) - g.boostDeducted);
      }
      const titles = g.itemIds.map((id) => db.items.find((i) => i.id === id)!.title);
      const when = o.fulfilment === "delivery" ? `A delivery partner will collect on ${o.slot!.date}, ${o.slot!.window}.` : `${buyer.name.split(" ")[0]} will message you to arrange pickup.`;
      outbox.notify(db, g.sellerId, `Sold, pending handover: ${titles.join(", ")} (${inr(g.subtotal)}). ${when} Ask for the 4-digit handover OTP; you're paid the same day.`, `/orders/${o.id}`);
    }
    outbox.notify(db, o.buyerId, `Payment of ${inr(o.total)} is held safely. Check each item at handover, then share that seller's OTP. Not as described? Refuse it for a full refund.`, `/orders/${o.id}`);
    return o;
  });
}

function findGroup(db: DB, orderId: string, sellerId: string) {
  const order = db.orders.find((o) => o.id === orderId);
  const group = order?.groups.find((g) => g.sellerId === sellerId);
  if (!order || !group) fail("Order not found.");
  return { order, group };
}

function settleOrderStatus(order: Order) {
  if (order.groups.some((g) => g.status === "held" || g.status === "disputed")) return;
  order.status = order.groups.every((g) => g.status === "refused") ? "refunded" : "completed";
}

function completeGroup(db: DB, outbox: Outbox, order: Order, group: OrderGroup, via: "otp" | "admin") {
  group.status = "handed_over";
  group.handedOverAt = now();
  for (const id of group.itemIds) {
    const it = db.items.find((i) => i.id === id)!;
    it.status = "sold";
    it.soldPrice = group.prices[id];
    it.soldAt = now();
    it.passport.push({ at: now(), event: "sold", note: `Re-homed in ${localityName(order.locality)}` });
    if (it.boughtBackFor !== undefined) {
      db.ledger.push({ id: newId("l"), kind: "buyback_margin", amount: group.prices[id] - it.boughtBackFor, orderId: order.id, ref: it.id, createdAt: now() });
    }
  }
  db.ledger.push({ id: newId("l"), kind: "seller_fee", amount: group.sellerFee, orderId: order.id, createdAt: now() });
  if (group.boostDeducted) db.ledger.push({ id: newId("l"), kind: "boost", amount: group.boostDeducted, orderId: order.id, createdAt: now() });
  settleOrderStatus(order);
  rewardReferrals(db, outbox, [order.buyerId, group.sellerId]);
  const payoutNote = group.boostDeducted ? ` (after the ${inr(group.boostDeducted)} boost fee)` : "";
  outbox.notify(db, group.sellerId, `Handover confirmed${via === "admin" ? " by MoveOn support" : ""}. ${inr(group.sellerPayout)}${payoutNote} is on its way to your account today. Rate your buyer?`, `/orders/${order.id}`);
  outbox.notify(db, order.buyerId, `Handover complete. Enjoy your new things! Rate the seller to help the next buyer.`, `/orders/${order.id}`);
}

/** Pays ₹200 credit to both sides of a referral when the referred user completes a first transaction. */
function rewardReferrals(db: DB, outbox: Outbox, userIds: string[]) {
  for (const uid of userIds) {
    const u = db.users.find((x) => x.id === uid);
    if (!u?.referredBy || u.referralRewarded) continue;
    const referrer = db.users.find((x) => x.id === u.referredBy);
    u.referralRewarded = true;
    u.credit += FEES.referralCredit;
    outbox.notify(db, u.id, `You earned ${inr(FEES.referralCredit)} referral credit for your first MoveOn deal.`, "/dashboard");
    if (referrer) {
      referrer.credit += FEES.referralCredit;
      outbox.notify(db, referrer.id, `${u.name.split(" ")[0]} completed their first deal: you both get ${inr(FEES.referralCredit)} credit.`, "/dashboard");
    }
  }
}

export async function confirmHandover(seller: User, orderId: string, otp: string) {
  const { order, group } = findGroup(read(), orderId, seller.id);
  if (order.status !== "active" || group.status !== "held") fail("This handover isn't pending.");
  if ((group.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) fail("Too many wrong codes. MoveOn support has been alerted and will help you complete this handover.");
  const a = Buffer.from(otp.trim());
  const b = Buffer.from(group.handoverOtp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const attempts = await tx((db, outbox) => {
      const g = findGroup(db, orderId, seller.id).group;
      g.otpAttempts = (g.otpAttempts ?? 0) + 1;
      if (g.otpAttempts >= OTP_MAX_ATTEMPTS) {
        for (const admin of db.users.filter((u) => u.role === "admin")) outbox.notify(db, admin.id, `Handover OTP locked on order ${orderId}.`, "/admin");
      }
      return g.otpAttempts;
    });
    fail(`That OTP doesn't match. ${Math.max(0, OTP_MAX_ATTEMPTS - attempts)} attempts left.`);
  }
  if (group.transferId) await payments().releaseTransfer(group.transferId);
  return tx((db, outbox) => {
    const { order: o, group: g } = findGroup(db, orderId, seller.id);
    if (g.status !== "held") fail("This handover isn't pending.");
    completeGroup(db, outbox, o, g, "otp");
    return o;
  });
}

/** Refunds one seller's part of an order: items, plus their share of the buyer fee and delivery. */
async function refundGroup(orderId: string, sellerId: string, reason: string, by: "buyer" | "seller" | "admin") {
  const snap = findGroup(read(), orderId, sellerId);
  const { order, group } = snap;
  const share = order.itemsTotal ? group.subtotal / order.itemsTotal : 1;
  const refund = Math.min(
    order.total - order.payment.refundedAmount,
    Math.round(group.subtotal + (order.buyerFee + order.deliveryFee - order.creditApplied) * share),
  );
  const provider = payments();
  if (group.transferId) await provider.reverseTransfer(group.transferId, group.sellerPayout);
  if (order.payment.paymentId && refund > 0) await provider.refund(order.payment.paymentId, refund);
  return tx((db, outbox) => {
    const { order: o, group: g } = findGroup(db, orderId, sellerId);
    const wasHandedOver = g.status === "handed_over";
    g.status = "refused";
    g.refusedReason = reason;
    o.payment.refundedAmount += refund;
    for (const id of g.itemIds) {
      const it = db.items.find((i) => i.id === id)!;
      it.status = "available";
      it.buyerId = undefined;
      it.soldPrice = undefined;
      it.soldAt = undefined;
    }
    if (g.boostDeducted) {
      const sale = db.sales.find((s) => s.id === g.saleId)!;
      sale.boostDue = (sale.boostDue ?? 0) + g.boostDeducted;
    }
    // The delivery partner still has to be paid for the trip.
    const deliveryLoss = Math.round(o.deliveryPartnerCost * share);
    if (deliveryLoss) db.ledger.push({ id: newId("l"), kind: "refund_loss", amount: -deliveryLoss, orderId: o.id, createdAt: now() });
    if (wasHandedOver) db.ledger.push({ id: newId("l"), kind: "seller_fee", amount: -g.sellerFee, orderId: o.id, createdAt: now() });
    settleOrderStatus(o);
    const who = by === "buyer" ? "The buyer refused the handover" : by === "seller" ? "You cancelled this handover" : "MoveOn support resolved this in the buyer's favour";
    outbox.notify(db, g.sellerId, `${who}: "${reason}". The items are back on sale.`, `/orders/${o.id}`);
    outbox.notify(db, o.buyerId, `${inr(refund)} is being refunded to your original payment method (3–5 working days).`, `/orders/${o.id}`);
    return { order: o, refund };
  });
}

export async function refuseHandover(buyer: User, orderId: string, sellerId: string, reason: string) {
  const { order, group } = findGroup(read(), orderId, sellerId);
  if (order.buyerId !== buyer.id) fail("Order not found.");
  if (group.status !== "held") fail("You can only refuse before sharing the OTP.");
  if (reason.trim().length < 5) fail("Tell the seller briefly what was wrong.");
  return refundGroup(orderId, sellerId, reason.trim().slice(0, 300), "buyer");
}

export async function sellerCancel(seller: User, orderId: string, reason: string) {
  const { group } = findGroup(read(), orderId, seller.id);
  if (group.status !== "held") fail("Only pending handovers can be cancelled.");
  return refundGroup(orderId, seller.id, reason.trim().slice(0, 300) || "Seller couldn't complete the handover", "seller");
}

export async function openDispute(user: User, orderId: string, sellerId: string, reason: string) {
  if (reason.trim().length < 10) fail("Describe the problem in a sentence or two.");
  return tx((db, outbox) => {
    const { order, group } = findGroup(db, orderId, sellerId);
    if (order.buyerId !== user.id && group.sellerId !== user.id) fail("Order not found.");
    if (db.disputes.some((d) => d.orderId === orderId && d.sellerId === sellerId && d.status === "open")) fail("A dispute is already open for this handover.");
    if (group.status === "handed_over") {
      if (Date.now() - Date.parse(group.handedOverAt!) > DISPUTE_WINDOW_HOURS * 3600_000) fail(`Disputes can be raised within ${DISPUTE_WINDOW_HOURS} hours of handover.`);
    } else if (group.status === "held") {
      group.status = "disputed"; // freezes the held payment
    } else fail("This handover can't be disputed.");
    const dispute = { id: newId("dp"), orderId, sellerId, openedBy: user.id, reason: reason.trim().slice(0, 1000), status: "open" as const, createdAt: now() };
    db.disputes.push(dispute);
    const other = user.id === order.buyerId ? group.sellerId : order.buyerId;
    outbox.notify(db, other, "A dispute was opened on your order. MoveOn support will review the photos and chat, usually within a day.", `/orders/${orderId}`);
    for (const admin of db.users.filter((u) => u.role === "admin")) outbox.notify(db, admin.id, `New dispute on order ${orderId}.`, "/admin#disputes");
    return dispute;
  });
}

export async function resolveDispute(admin: User, disputeId: string, outcome: "refund" | "release", note: string) {
  if (admin.role !== "admin") fail("Admins only.");
  const dispute = read().disputes.find((d) => d.id === disputeId);
  if (!dispute || dispute.status !== "open") fail("Dispute not found or already resolved.");
  const { group } = findGroup(read(), dispute.orderId, dispute.sellerId);
  if (outcome === "refund") {
    if (group.status !== "refused") await refundGroup(dispute.orderId, dispute.sellerId, note || dispute.reason, "admin");
  } else if (group.status === "disputed") {
    if (group.transferId) await payments().releaseTransfer(group.transferId);
    await tx((db, outbox) => {
      const { order, group: g } = findGroup(db, dispute.orderId, dispute.sellerId);
      completeGroup(db, outbox, order, g, "admin");
    });
  }
  return tx((db, outbox) => {
    const d = db.disputes.find((x) => x.id === disputeId)!;
    d.status = outcome === "refund" ? "resolved_refund" : "resolved_release";
    d.resolutionNote = note.trim().slice(0, 500);
    d.resolvedAt = now();
    const order = db.orders.find((o) => o.id === d.orderId)!;
    for (const uid of [order.buyerId, d.sellerId]) {
      outbox.notify(db, uid, `Dispute resolved: ${outcome === "refund" ? "buyer refunded" : "payment released to seller"}. ${d.resolutionNote ?? ""}`, `/orders/${order.id}`);
    }
    return d;
  });
}

export async function rate(user: User, orderId: string, toId: string, stars: number, comment?: string) {
  if (!(stars >= 1 && stars <= 5)) fail("Pick 1 to 5 stars.");
  return tx((db) => {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) fail("Order not found.");
    const group = order.groups.find((g) => (user.id === order.buyerId ? g.sellerId === toId : g.sellerId === user.id && toId === order.buyerId));
    if (!group || group.status !== "handed_over") fail("You can rate after the handover.");
    if (db.ratings.some((r) => r.orderId === orderId && r.fromId === user.id && r.toId === toId)) fail("You've already rated this handover.");
    const r = { id: newId("r"), orderId, fromId: user.id, toId, stars: Math.round(stars), comment: comment?.trim().slice(0, 300) || undefined, createdAt: now() };
    db.ratings.push(r);
    return r;
  });
}

// ---------- Masked chat ----------

/** Hides phone numbers, emails and UPI handles so deals stay protected on-platform. */
export function maskContacts(body: string): string {
  return body
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email hidden]")
    .replace(/\b[\w.-]{2,}@(ok\w+|ybl|paytm|upi|ibl|axl|apl|icici|sbi|hdfcbank)\b/gi, "[UPI hidden]")
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[number hidden]" : m));
}

export async function sendMessage(user: User, orderId: string, sellerId: string, body: string) {
  const text = body.trim().slice(0, 1000);
  if (!text) fail("Write a message.");
  return tx((db, outbox) => {
    const { order } = findGroup(db, orderId, sellerId);
    if (user.id !== order.buyerId && user.id !== sellerId && user.role !== "admin") fail("Order not found.");
    const masked = maskContacts(text);
    db.messages.push({ id: newId("m"), threadId: `${orderId}:${sellerId}`, fromId: user.id, body: masked, createdAt: now() });
    const to = user.id === order.buyerId ? sellerId : order.buyerId;
    outbox.notify(db, to, `New message from ${user.name.split(" ")[0]}: "${masked.slice(0, 80)}"`, `/orders/${orderId}`);
    return { masked: masked !== text };
  });
}

// ---------- Views ----------

export function orderView(user: User, orderId: string) {
  const db = read();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return null;
  const isBuyer = order.buyerId === user.id;
  const isAdmin = user.role === "admin";
  const sellerGroups = order.groups.filter((g) => isBuyer || isAdmin || g.sellerId === user.id);
  if (!sellerGroups.length) return null;
  const buyer = db.users.find((u) => u.id === order.buyerId)!;
  return {
    order: { ...order, groups: undefined },
    isBuyer,
    isAdmin,
    buyer: publicUser(buyer),
    groups: sellerGroups.map((g) => {
      const sale = db.sales.find((s) => s.id === g.saleId)!;
      const seller = db.users.find((u) => u.id === g.sellerId)!;
      return {
        ...g,
        handoverOtp: isBuyer ? g.handoverOtp : undefined, // only the buyer ever sees the OTP
        seller: publicUser(seller),
        sale: { slug: sale.slug, title: sale.title, locality: sale.locality, leavingDate: sale.leavingDate, daysLeft: daysLeft(sale) },
        items: g.itemIds.map((id) => db.items.find((i) => i.id === id)!),
        messages: db.messages.filter((m) => m.threadId === `${order.id}:${g.sellerId}`).map((m) => ({
          ...m, mine: m.fromId === user.id, from: m.fromId === order.buyerId ? publicUser(buyer).name : publicUser(seller).name,
        })),
        dispute: db.disputes.filter((d) => d.orderId === order.id && d.sellerId === g.sellerId).at(-1),
        myRating: db.ratings.find((r) => r.orderId === order.id && r.fromId === user.id && r.toId === (isBuyer ? g.sellerId : order.buyerId)),
        canDispute: g.status === "held" || (g.status === "handed_over" && Date.now() - Date.parse(g.handedOverAt ?? now()) < DISPUTE_WINDOW_HOURS * 3600_000),
      };
    }),
  };
}

export function ordersForBuyer(userId: string) {
  return read().orders.filter((o) => o.buyerId === userId && o.status !== "pending_payment" && o.status !== "cancelled").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function handoversForSeller(userId: string) {
  const db = read();
  return db.orders
    .filter((o) => o.status !== "pending_payment" && o.status !== "cancelled")
    .flatMap((o) => o.groups.filter((g) => g.sellerId === userId).map((g) => ({
      order: o, group: g, buyer: publicUser(db.users.find((u) => u.id === o.buyerId)!),
      items: g.itemIds.map((id) => db.items.find((i) => i.id === id)!),
    })))
    .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt));
}
