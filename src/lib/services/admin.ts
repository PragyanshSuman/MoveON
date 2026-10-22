// Operations dashboard: the weekly metrics from the plan, plus queues that need a human.
import { read } from "../db";
import { LOCALITIES } from "../catalog";
import { orderContribution } from "../pricing";
import type { LedgerKind, User } from "../types";
import { fail, publicUser, tx } from "./common";

const REHOMED = ["sold", "dealer", "donated", "recycled"];

export function metrics() {
  const db = read();
  const items = db.items.filter((i) => i.status !== "withdrawn");
  const saleById = new Map(db.sales.map((s) => [s.id, s]));
  // North star: of items whose sale has ended (or that already found a home), how many were re-homed before the deadline.
  const decided = items.filter((i) => REHOMED.includes(i.status) || saleById.get(i.saleId)!.status === "closed");
  const rehomedOnTime = decided.filter((i) => REHOMED.includes(i.status) && i.soldAt && i.soldAt.slice(0, 10) <= saleById.get(i.saleId)!.leavingDate);
  const soldToBuyers = items.filter((i) => i.status === "sold" && i.soldAt);
  const avgDaysToSale = soldToBuyers.length
    ? soldToBuyers.reduce((a, i) => a + (Date.parse(i.soldAt!) - Date.parse(i.listedAt)) / 86_400_000, 0) / soldToBuyers.length
    : 0;

  const paidOrders = db.orders.filter((o) => o.payment.paidAt);
  const completed = db.orders.filter((o) => o.status === "completed");
  const gmv = completed.reduce((a, o) => a + o.groups.filter((g) => g.status === "handed_over").reduce((x, g) => x + g.subtotal, 0), 0);
  const revenueByKind = new Map<LedgerKind, number>();
  for (const l of db.ledger) revenueByKind.set(l.kind, (revenueByKind.get(l.kind) ?? 0) + l.amount);
  const revenue = [...revenueByKind.values()].reduce((a, b) => a + b, 0);
  const marketplaceTake = (revenueByKind.get("seller_fee") ?? 0) + (revenueByKind.get("buyer_fee") ?? 0) + (revenueByKind.get("delivery_margin") ?? 0);

  const contributions = completed.map((o) =>
    orderContribution({
      itemsTotal: o.itemsTotal,
      sellerFees: o.groups.filter((g) => g.status === "handed_over").reduce((a, g) => a + g.sellerFee, 0),
      buyerFee: o.buyerFee,
      deliveryMargin: o.deliveryFee - o.deliveryPartnerCost,
      total: o.total,
    }),
  );
  const avgContribution = contributions.length ? contributions.reduce((a, c) => a + c.contribution, 0) / contributions.length : 0;

  const buyers = new Set(paidOrders.map((o) => o.buyerId));
  const buyerThenSeller = [...buyers].filter((uid) => {
    const firstBuy = paidOrders.filter((o) => o.buyerId === uid).map((o) => o.createdAt).sort()[0];
    return db.sales.some((s) => s.sellerId === uid && s.createdAt > firstBuy);
  });
  const disputeRate = paidOrders.length ? db.disputes.length / paidOrders.length : 0;

  const byLocality = LOCALITIES.map((l) => {
    const its = items.filter((i) => saleById.get(i.saleId)?.locality === l.slug);
    const sold = its.filter((i) => i.status === "sold" && i.soldAt);
    return {
      locality: l,
      listed: its.length,
      rehomed: its.filter((i) => REHOMED.includes(i.status)).length,
      avgDays: sold.length ? sold.reduce((a, i) => a + (Date.parse(i.soldAt!) - Date.parse(i.listedAt)) / 86_400_000, 0) / sold.length : null,
    };
  }).filter((r) => r.listed > 0);

  return {
    northStar: { decided: decided.length, rehomedOnTime: rehomedOnTime.length, rate: decided.length ? rehomedOnTime.length / decided.length : 0 },
    exits: {
      sold: items.filter((i) => i.status === "sold").length,
      dealer: items.filter((i) => i.status === "dealer").length,
      donated: items.filter((i) => i.status === "donated").length,
      recycled: items.filter((i) => i.status === "recycled").length,
      available: items.filter((i) => i.status === "available").length,
      reserved: items.filter((i) => i.status === "reserved").length,
    },
    avgDaysToSale,
    gmv,
    revenue,
    takeRate: gmv ? marketplaceTake / gmv : 0,
    revenueByKind: [...revenueByKind.entries()].sort((a, b) => b[1] - a[1]),
    avgContribution,
    orders: { paid: paidOrders.length, completed: completed.length },
    buyerToSeller: { buyers: buyers.size, becameSellers: buyerThenSeller.length },
    disputeRate,
    users: db.users.length,
    liveSales: db.sales.filter((s) => s.status === "active").length,
    byLocality,
  };
}

export function queues() {
  const db = read();
  const user = (id: string) => publicUser(db.users.find((u) => u.id === id)!);
  return {
    disputes: db.disputes
      .filter((d) => d.status === "open")
      .map((d) => {
        const order = db.orders.find((o) => o.id === d.orderId)!;
        const group = order.groups.find((g) => g.sellerId === d.sellerId)!;
        return {
          dispute: d, order, group, buyer: user(order.buyerId), seller: user(d.sellerId), openedBy: user(d.openedBy),
          items: group.itemIds.map((id) => db.items.find((i) => i.id === id)!),
          messages: db.messages.filter((m) => m.threadId === `${order.id}:${d.sellerId}`),
        };
      }),
    resolvedDisputes: db.disputes.filter((d) => d.status !== "open").slice(-10).reverse(),
    buyBacks: db.buyBackClaims
      .filter((c) => c.status === "requested")
      .map((c) => ({ claim: c, item: db.items.find((i) => i.id === c.itemId)!, user: user(c.userId) })),
    leads: db.serviceLeads.filter((l) => l.status === "new").map((l) => ({ lead: l, user: db.users.find((u) => u.id === l.userId)! })),
    lockedHandovers: db.orders.flatMap((o) => o.groups.filter((g) => g.status === "held" && (g.otpAttempts ?? 0) >= 5).map((g) => ({ order: o, group: g }))),
    recentOrders: [...db.orders].filter((o) => o.status !== "pending_payment").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15)
      .map((o) => ({ order: o, buyer: user(o.buyerId) })),
    certifiable: db.items.filter((i) => i.status === "available" && !i.certified && !i.boughtBackFor).slice(0, 40),
  };
}

export async function setCertified(admin: User, itemId: string, certified: boolean) {
  if (admin.role !== "admin") fail("Admins only.");
  return tx((db) => {
    const item = db.items.find((i) => i.id === itemId) ?? fail("Item not found.");
    item.certified = certified;
    if (certified) item.passport.push({ at: new Date().toISOString(), event: "certified", note: "Certified for buy-back after photo inspection" });
    return item;
  });
}
