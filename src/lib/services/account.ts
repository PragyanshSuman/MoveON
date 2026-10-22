// Profiles, community verification, arrival profiles, buy-back claims and move-out services.
import { newId, now, read } from "../db";
import { category, locality } from "../catalog";
import { addDays, buyBackValue, FEES, inr, roundTo, todayIST } from "../pricing";
import { normalizeEmail, requestOtp, verifyOtp } from "../auth";
import type { Badge, Item, ServiceLead, User } from "../types";
import { fail, tx } from "./common";

const FREE_MAIL = ["gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com", "rediffmail.com", "icloud.com", "proton.me", "protonmail.com", "aol.com"];

export function badgeForEmail(email: string): Omit<Badge, "verifiedAt"> | null {
  const domain = email.split("@")[1];
  if (!domain || FREE_MAIL.includes(domain)) return null;
  const partner = read().partners.find((p) => p.emailDomains.some((d) => domain === d || domain.endsWith(`.${d}`)));
  if (partner) return { type: partner.type === "college" ? "college" : "company", label: partner.name, partnerId: partner.id, verifiedVia: "email" };
  if (/\.(ac|edu)\.in$|\.edu$/.test(domain)) return { type: "college", label: domain, verifiedVia: "email" };
  return { type: "company", label: domain, verifiedVia: "email" };
}

export async function startEmailBadge(user: User, emailInput: string) {
  const email = normalizeEmail(emailInput) ?? fail("Enter a valid email address.");
  if (!badgeForEmail(email)) fail("Use your college or work email; personal email addresses can't verify a community.");
  const res = await requestOtp(email, "email_verify");
  if (!res.ok) fail(res.error);
  return { email, devCode: res.devCode };
}

export async function confirmEmailBadge(user: User, emailInput: string, code: string) {
  const email = normalizeEmail(emailInput) ?? fail("Enter a valid email address.");
  const check = verifyOtp(email, code, "email_verify");
  if (!check.ok) fail(check.error);
  const badge = badgeForEmail(email) ?? fail("This email can't verify a community.");
  return addBadge(user, { ...badge, verifiedAt: now() });
}

export async function verifyResidentCode(user: User, codeInput: string) {
  const code = codeInput.trim().toUpperCase();
  const partner = read().partners.find((p) => p.residentCode && p.residentCode.toUpperCase() === code);
  if (!partner) fail("That resident code isn't recognised. Ask your property manager for the MoveOn code.");
  return addBadge(user, { type: "coliving", label: partner.name, partnerId: partner.id, verifiedVia: "resident_code", verifiedAt: now() });
}

async function addBadge(user: User, badge: Badge) {
  return tx((db, outbox) => {
    const u = db.users.find((x) => x.id === user.id)!;
    if (u.badges.some((b) => b.label === badge.label && b.type === badge.type)) return u;
    u.badges.push(badge);
    outbox.notify(db, u.id, `Verified: ${badge.label}. Your listings now show the badge, and you can see members-only sales.`, "/dashboard");
    return u;
  });
}

export async function updateProfile(user: User, patch: { name?: string; upiId?: string; razorpayAccountId?: string }) {
  return tx((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    if (patch.name !== undefined) {
      const name = patch.name.trim().slice(0, 60);
      if (name.length < 2) fail("Enter your name.");
      u.name = name;
    }
    if (patch.upiId !== undefined) {
      const upi = patch.upiId.trim();
      if (upi && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi)) fail("Enter a valid UPI ID, like name@okbank.");
      u.upiId = upi || undefined;
    }
    if (patch.razorpayAccountId !== undefined) {
      const acc = patch.razorpayAccountId.trim();
      if (acc && !/^acc_[A-Za-z0-9]{8,}$/.test(acc)) fail("Linked account IDs look like acc_XXXXXXXX.");
      u.razorpayAccountId = acc || undefined;
    }
    return u;
  });
}

export async function saveArrival(user: User, input: { moveInDate: string; locality: string; budget: number; wants: string[] }) {
  if (!locality(input.locality)) fail("Pick the area you're moving to.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.moveInDate)) fail("Pick your move-in date.");
  const wants = input.wants.filter((w) => category(w).id === w).slice(0, 20);
  return tx((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    u.arrival = { moveInDate: input.moveInDate, locality: input.locality, budget: Math.max(0, Math.round(input.budget || 0)), wants };
    return u;
  });
}

export async function markNotificationsRead(user: User) {
  return tx((db) => {
    for (const n of db.notifications) if (n.userId === user.id) n.read = true;
  });
}

export function notificationsFor(userId: string, limit = 30) {
  return read().notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function unreadCount(userId: string) {
  return read().notifications.filter((n) => n.userId === userId && !n.read).length;
}

// ---------- Buy-back guarantee ----------

export function buyBackStatus(item: Item) {
  const value = buyBackValue(item);
  const deadline = item.soldAt ? addDays(item.soldAt.slice(0, 10), FEES.buyBackWindowMonths * 30) : undefined;
  const claim = read().buyBackClaims.find((c) => c.itemId === item.id && c.status === "requested");
  return { value, deadline, eligible: value > 0 && !!deadline && deadline >= todayIST(), claim };
}

export async function claimBuyBack(user: User, itemId: string) {
  return tx((db, outbox) => {
    const item = db.items.find((i) => i.id === itemId);
    if (!item || item.buyerId !== user.id || item.status !== "sold") fail("Item not found.");
    const status = buyBackStatus(item);
    if (!status.eligible) fail("This item isn't eligible for buy-back.");
    if (status.claim) fail("You've already requested a buy-back for this item.");
    const claim = { id: newId("bb"), itemId, userId: user.id, amount: status.value, status: "requested" as const, createdAt: now() };
    db.buyBackClaims.push(claim);
    outbox.notify(db, user.id, `Buy-back requested for "${item.title}". A MoveOn partner will inspect and collect it, then pay you ${inr(claim.amount)}.`, "/dashboard");
    for (const admin of db.users.filter((u) => u.role === "admin")) outbox.notify(db, admin.id, `Buy-back claim for "${item.title}" (${inr(claim.amount)}).`, "/admin#buyback");
    return claim;
  });
}

/** Admin: pays the claim and relists the item in MoveOn's own "Certified" sale. */
export async function completeBuyBack(admin: User, claimId: string) {
  if (admin.role !== "admin") fail("Admins only.");
  return tx((db, outbox) => {
    const claim = db.buyBackClaims.find((c) => c.id === claimId);
    if (!claim || claim.status !== "requested") fail("Claim not found.");
    const item = db.items.find((i) => i.id === claim.itemId)!;
    const fromSale = db.sales.find((s) => s.id === item.saleId)!;
    let hub = db.sales.find((s) => s.slug === "moveon-certified");
    if (!hub) {
      hub = {
        id: newId("s"), slug: "moveon-certified", sellerId: admin.id, title: "MoveOn Certified: bought back and checked",
        locality: fromSale.locality, leavingDate: addDays(todayIST(), 90), dropRatePerWeek: 0.05, visibility: "public",
        note: "Items returned under the buy-back guarantee, inspected and cleaned by MoveOn.", status: "active", createdAt: now(),
      };
      db.sales.push(hub);
    }
    if (hub.leavingDate < addDays(todayIST(), 30)) hub.leavingDate = addDays(todayIST(), 90);
    claim.status = "completed";
    item.passport.push({ at: now(), event: "bought_back", note: `Bought back by MoveOn for ${inr(claim.amount)}` });
    Object.assign(item, {
      saleId: hub.id, sellerId: admin.id, status: "available", buyerId: undefined, soldAt: undefined,
      listPrice: roundTo((item.soldPrice ?? claim.amount * 2) * 0.8, 50), floorPrice: roundTo(claim.amount * 1.2, 50),
      soldPrice: undefined, listedAt: now(), availableFrom: todayIST(), stayInPlace: false, boughtBackFor: claim.amount,
    });
    outbox.notify(db, claim.userId, `Buy-back complete: ${inr(claim.amount)} sent to your UPI. Thanks for keeping it in the loop!`, "/dashboard");
    return claim;
  });
}

// ---------- Move-out concierge ----------

export const SERVICES: Record<ServiceLead["service"], { label: string; referralFee: number; blurb: string }> = {
  packers_movers: { label: "Packers & movers", referralFee: 1000, blurb: "Quotes from vetted intercity movers for what you're keeping." },
  deep_cleaning: { label: "Move-out deep cleaning", referralFee: 300, blurb: "Get your deposit back: kitchen, bathroom and walls." },
  broadband_transfer: { label: "Broadband & gas transfer", referralFee: 200, blurb: "Shift or close your connections without the call-centre maze." },
};

export async function requestService(user: User, service: ServiceLead["service"], date: string) {
  if (!SERVICES[service]) fail("Unknown service.");
  return tx((db, outbox) => {
    const sale = db.sales.find((s) => s.sellerId === user.id && s.status === "active");
    if (db.serviceLeads.some((l) => l.userId === user.id && l.service === service && l.status === "new")) fail("You've already requested this; we'll call you shortly.");
    const lead: ServiceLead = {
      id: newId("svc"), userId: user.id, service, locality: sale?.locality ?? user.arrival?.locality ?? "koramangala",
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (sale?.leavingDate ?? todayIST()), status: "new", createdAt: now(),
    };
    db.serviceLeads.push(lead);
    outbox.notify(db, user.id, `${SERVICES[service].label}: request received. A partner will share a quote on WhatsApp within a few hours.`, "/dashboard");
    for (const admin of db.users.filter((u) => u.role === "admin")) outbox.notify(db, admin.id, `New ${SERVICES[service].label} lead.`, "/admin#leads");
    return lead;
  });
}

export async function markLeadBooked(admin: User, leadId: string) {
  if (admin.role !== "admin") fail("Admins only.");
  return tx((db) => {
    const lead = db.serviceLeads.find((l) => l.id === leadId);
    if (!lead || lead.status !== "new") fail("Lead not found.");
    lead.status = "booked";
    db.ledger.push({ id: newId("l"), kind: "service_referral", amount: SERVICES[lead.service].referralFee, ref: lead.id, createdAt: now() });
    return lead;
  });
}
