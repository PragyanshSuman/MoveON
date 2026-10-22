"use server";
// Server actions: the only way the UI mutates data. Each validates the session, calls a
// service, and returns a small state object that forms render ({ error } or { ok }).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, currentUser, isAdmin, normalizePhone, requestOtp, setSession, upsertUserByPhone, verifyOtp } from "@/lib/auth";
import { getCart, setCart } from "@/lib/cart";
import { read } from "@/lib/db";
import { AppError } from "@/lib/services/common";
import * as selling from "@/lib/services/selling";
import * as orders from "@/lib/services/orders";
import * as account from "@/lib/services/account";
import { setCertified } from "@/lib/services/admin";
import type { User } from "@/lib/types";

export type ActionState = { error?: string; ok?: string; [key: string]: unknown } | null;

async function safe<T>(fn: () => Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}

async function needUser(): Promise<User | { error: string }> {
  const user = await currentUser();
  return user ?? { error: "Please log in first." };
}

async function needAdmin(): Promise<User | { error: string }> {
  const user = await currentUser();
  return user && isAdmin(user) ? { ...user, role: "admin" } : { error: "Admins only." };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const done = (ok: string): ActionState => {
  revalidatePath("/", "layout");
  return { ok };
};

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

// ---------- Auth ----------

export async function requestLoginOtp(_: ActionState, fd: FormData): Promise<ActionState> {
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { error: "Enter a 10-digit Indian mobile number." };
  const res = await requestOtp(phone, "login");
  if (!res.ok) return { error: res.error };
  const exists = read().users.some((u) => u.phone === phone);
  return { step: "verify", phone, devCode: res.devCode, needsName: !exists };
}

export async function verifyLoginOtp(_: ActionState, fd: FormData): Promise<ActionState> {
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { error: "Enter a valid mobile number.", step: "phone" };
  const check = verifyOtp(phone, str(fd, "code"), "login");
  if (!check.ok) return { error: check.error, step: "verify", phone, needsName: fd.get("needsName") === "1" };
  const exists = read().users.some((u) => u.phone === phone);
  if (!exists && str(fd, "name").length < 2) return { error: "Tell us your name.", step: "verify", phone, needsName: true };
  const user = upsertUserByPhone(phone, str(fd, "name"), str(fd, "ref") || undefined);
  await setSession(user.id);
  redirect(safeNext(str(fd, "next")));
}

export async function logout() {
  await clearSession();
  redirect("/");
}

// ---------- Cart ----------

export async function addToCart(_: ActionState, fd: FormData): Promise<ActionState> {
  const ids = fd.getAll("itemId").map(String);
  await setCart([...(await getCart()), ...ids]);
  return done(ids.length > 1 ? `${ids.length} items added to cart` : "Added to cart");
}

export async function removeFromCart(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "itemId");
  await setCart((await getCart()).filter((x) => x !== id));
  return done("Removed");
}

export async function pruneCart(): Promise<ActionState> {
  const user = await currentUser();
  const ids = await getCart();
  const db = read();
  await setCart(ids.filter((id) => {
    const it = db.items.find((i) => i.id === id);
    return it && (it.status === "available" || (it.status === "reserved" && it.buyerId === user?.id));
  }));
  return done("Removed unavailable items");
}

export async function placeOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(async () =>
    orders.checkout(user, {
      itemIds: await getCart(),
      fulfilment: str(fd, "fulfilment") === "delivery" ? "delivery" : "pickup",
      locality: str(fd, "locality"),
      slotDate: str(fd, "slotDate") || undefined,
      slotWindow: str(fd, "slotWindow") || undefined,
      address: str(fd, "address") || undefined,
      useCredit: fd.get("useCredit") === "on",
    }),
  );
  if ("error" in res) return res;
  redirect(`/pay/${res.value.orderId}`);
}

async function clearPaidFromCart(orderId: string) {
  const order = read().orders.find((o) => o.id === orderId);
  if (!order) return;
  const bought = new Set(order.groups.flatMap((g) => g.itemIds));
  await setCart((await getCart()).filter((id) => !bought.has(id)));
}

export async function confirmMockPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const orderId = str(fd, "orderId");
  const res = await safe(() => orders.confirmPayment(user, orderId, { paymentId: `mpay_${Date.now().toString(36)}` }));
  if ("error" in res) return res;
  await clearPaidFromCart(orderId);
  redirect(`/orders/${orderId}?paid=1`);
}

export async function confirmRazorpayPayment(orderId: string, paymentId: string, signature: string): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.confirmPayment(user, orderId, { paymentId, signature }));
  if ("error" in res) return res;
  await clearPaidFromCart(orderId);
  return done("Paid");
}

// ---------- Orders ----------

export async function handoverAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.confirmHandover(user, str(fd, "orderId"), str(fd, "otp")));
  return "error" in res ? res : done("Handover confirmed. Payout released.");
}

export async function refuseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.refuseHandover(user, str(fd, "orderId"), str(fd, "sellerId"), str(fd, "reason")));
  return "error" in res ? res : done("Refused. Your refund is on its way.");
}

export async function sellerCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.sellerCancel(user, str(fd, "orderId"), str(fd, "reason")));
  return "error" in res ? res : done("Cancelled and refunded to the buyer.");
}

export async function disputeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.openDispute(user, str(fd, "orderId"), str(fd, "sellerId"), str(fd, "reason")));
  return "error" in res ? res : done("Dispute opened. Payment is frozen until support reviews it.");
}

export async function rateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.rate(user, str(fd, "orderId"), str(fd, "toId"), num(fd, "stars"), str(fd, "comment")));
  return "error" in res ? res : done("Thanks for rating!");
}

export async function messageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => orders.sendMessage(user, str(fd, "orderId"), str(fd, "sellerId"), str(fd, "body")));
  if ("error" in res) return res;
  return done(res.value.masked ? "Sent. Contact details were hidden to keep you protected." : "Sent");
}

// ---------- Selling ----------

export async function startSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const partnerId = str(fd, "communityPartnerId");
  const res = await safe(() =>
    selling.createSale(user, {
      leavingDate: str(fd, "leavingDate"), locality: str(fd, "locality"), title: str(fd, "title"), note: str(fd, "note"),
      visibility: partnerId ? "community" : "public", communityPartnerId: partnerId || undefined,
      dropRatePerWeek: num(fd, "dropRate") / 100,
    }),
  );
  if ("error" in res) return res;
  redirect(`/sell/${res.value.id}/add`);
}

export async function publishItemsAction(saleId: string, drafts: selling.ItemDraft[]): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => selling.addItems(user, saleId, drafts));
  if ("error" in res) return res;
  revalidatePath("/", "layout");
  return { ok: `${res.value.length} item${res.value.length === 1 ? "" : "s"} published`, slug: read().sales.find((s) => s.id === saleId)?.slug };
}

export async function updateItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() =>
    selling.updateItem(user, str(fd, "itemId"), {
      title: str(fd, "title"), category: str(fd, "category"), brand: str(fd, "brand"), condition: str(fd, "condition") as selling.ItemDraft["condition"],
      ageMonths: num(fd, "ageMonths"), description: str(fd, "description"), listPrice: num(fd, "listPrice"), floorPrice: num(fd, "floorPrice"),
      availableFrom: str(fd, "availableFrom"), stayInPlace: fd.get("stayInPlace") === "on",
    }),
  );
  return "error" in res ? res : done("Saved");
}

export async function withdrawItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => selling.setItemWithdrawn(user, str(fd, "itemId"), fd.get("withdraw") === "1"));
  return "error" in res ? res : done(fd.get("withdraw") === "1" ? "Item withdrawn" : "Item is back on sale");
}

export async function updateSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() =>
    selling.updateSale(user, str(fd, "saleId"), {
      leavingDate: str(fd, "leavingDate") || undefined, title: str(fd, "title") || undefined, note: str(fd, "note"),
      dropRatePerWeek: fd.has("dropRate") ? num(fd, "dropRate") / 100 : undefined,
    }),
  );
  return "error" in res ? res : done("Sale updated");
}

export async function boostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => selling.boostSale(user, str(fd, "saleId"), str(fd, "boostId")));
  return "error" in res ? res : done("Boosted! The fee comes out of your first payout.");
}

export async function instantOffersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => selling.requestInstantOffers(user, str(fd, "saleId")));
  return "error" in res ? res : done(res.value ? `${res.value} dealer offers received` : "No new offers right now; dealers already bid on your items.");
}

export async function offerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const accept = fd.get("decision") === "accept";
  const res = await safe(async () => {
    if (accept) await selling.acceptOffer(user, str(fd, "offerId"));
    else await selling.declineOffer(user, str(fd, "offerId"));
  });
  return "error" in res ? res : done(accept ? "Offer accepted. The dealer will contact you to collect." : "Offer declined");
}

export async function disposalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const kind = str(fd, "kind") === "ewaste" ? "ewaste" : "donation";
  const res = await safe(() => selling.scheduleDisposal(user, str(fd, "saleId"), fd.getAll("itemIds").map(String), kind));
  return "error" in res ? res : done(`Pickup booked for ${res.value.pickupDate}. Certificate ${res.value.certificateNo}.`);
}

// ---------- Account ----------

export async function emailBadgeStart(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => account.startEmailBadge(user, str(fd, "email")));
  return "error" in res ? res : { step: "code", email: res.value.email, devCode: res.value.devCode };
}

export async function emailBadgeConfirm(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => account.confirmEmailBadge(user, str(fd, "email"), str(fd, "code")));
  return "error" in res ? { ...res, step: "code", email: str(fd, "email") } : done(`Verified: ${res.value.badges.at(-1)?.label}`);
}

export async function residentCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => account.verifyResidentCode(user, str(fd, "code")));
  return "error" in res ? res : done(`Verified: ${res.value.badges.at(-1)?.label}`);
}

export async function profileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => account.updateProfile(user, { name: str(fd, "name"), upiId: str(fd, "upiId"), razorpayAccountId: fd.has("razorpayAccountId") ? str(fd, "razorpayAccountId") : undefined }));
  return "error" in res ? res : done("Profile saved");
}

export async function arrivalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await currentUser();
  const input = { moveInDate: str(fd, "moveInDate"), locality: str(fd, "locality"), budget: num(fd, "budget"), wants: fd.getAll("wants").map(String) };
  if (user) {
    const res = await safe(() => account.saveArrival(user, input));
    if ("error" in res) return res;
  }
  const qs = new URLSearchParams({ locality: input.locality, budget: String(input.budget || ""), date: input.moveInDate });
  redirect(`/kits?${qs}`);
}

export async function markReadAction(): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  await account.markNotificationsRead(user);
  return done("");
}

export async function claimBuyBackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => account.claimBuyBack(user, str(fd, "itemId")));
  return "error" in res ? res : done("Buy-back requested. We'll schedule an inspection pickup.");
}

export async function serviceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await needUser();
  if ("error" in user) return user;
  const res = await safe(() => account.requestService(user, str(fd, "service") as Parameters<typeof account.requestService>[1], str(fd, "date")));
  return "error" in res ? res : done("Request sent. Expect a quote on WhatsApp shortly.");
}

// ---------- Admin ----------

export async function resolveDisputeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await needAdmin();
  if ("error" in admin) return admin;
  const res = await safe(() => orders.resolveDispute(admin, str(fd, "disputeId"), str(fd, "outcome") === "release" ? "release" : "refund", str(fd, "note")));
  return "error" in res ? res : done("Dispute resolved");
}

export async function certifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await needAdmin();
  if ("error" in admin) return admin;
  const res = await safe(() => setCertified(admin, str(fd, "itemId"), fd.get("certified") === "1"));
  return "error" in res ? res : done("Updated");
}

export async function completeBuyBackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await needAdmin();
  if ("error" in admin) return admin;
  const res = await safe(() => account.completeBuyBack(admin, str(fd, "claimId")));
  return "error" in res ? res : done("Buy-back paid and item relisted");
}

export async function leadBookedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await needAdmin();
  if ("error" in admin) return admin;
  const res = await safe(() => account.markLeadBooked(admin, str(fd, "leadId")));
  return "error" in res ? res : done("Marked as booked");
}

export async function runJobsAction(): Promise<ActionState> {
  const admin = await needAdmin();
  if ("error" in admin) return admin;
  const r = await selling.runDailyJobs();
  return done(`Jobs ran: ${r.exitOffers} exit offers, ${r.closedSales} sales closed, ${r.expiredCheckouts} stale checkouts released.`);
}
