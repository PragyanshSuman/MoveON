import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { category, localityName } from "@/lib/catalog";
import { read } from "@/lib/db";
import { formatDate, inr, leavingLabel, timeAgo } from "@/lib/format";
import { absoluteUrl } from "@/lib/notify";
import { addDays, BOOSTS, countdownPrice, daysLeft, FEES, nextDrop, todayIST } from "@/lib/pricing";
import { buyBackStatus, notificationsFor, SERVICES } from "@/lib/services/account";
import { handoversForSeller, ordersForBuyer } from "@/lib/services/orders";
import { ownedItems } from "@/lib/services/marketplace";
import { DISPOSAL_PARTNERS } from "@/lib/services/selling";
import {
  boostAction, claimBuyBackAction, disposalAction, instantOffersAction, markReadAction, offerAction, profileAction, serviceAction, updateSaleAction,
} from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { ShareButtons } from "@/components/share-buttons";
import { Badges, EmptyState } from "@/components/ui";

export const metadata = { title: "My dashboard" };

const TABS = [
  ["overview", "Overview"], ["selling", "My move-out"], ["buying", "My orders"], ["inbox", "Inbox"], ["profile", "Profile"],
] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { tab = "overview" } = await searchParams;
  const db = read();
  const sales = db.sales.filter((s) => s.sellerId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sale = sales.find((s) => s.status === "active") ?? sales[0];
  const handovers = handoversForSeller(user.id);
  const orders = ordersForBuyer(user.id);
  const pendingHandovers = handovers.filter((h) => h.group.status === "held");
  const notifications = notificationsFor(user.id);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Hi, {user.name.split(" ")[0]}</h1>
          <div className="mt-1"><Badges badges={user.badges} /></div>
        </div>
        {user.credit > 0 && <p className="chip bg-ok/10 text-ok">{inr(user.credit)} referral credit</p>}
      </div>
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Dashboard sections">
        {TABS.map(([id, label]) => (
          <Link key={id} href={`/dashboard?tab=${id}`} className={`shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${tab === id ? "border-ink" : "border-transparent text-ink-soft"}`}>
            {label}{id === "inbox" && unread > 0 ? ` (${unread})` : ""}{id === "selling" && pendingHandovers.length ? ` (${pendingHandovers.length})` : ""}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "overview" && <Overview />}
        {tab === "selling" && <Selling />}
        {tab === "buying" && <Buying />}
        {tab === "inbox" && <Inbox />}
        {tab === "profile" && <Profile />}
      </div>
    </div>
  );

  function Overview() {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/dashboard?tab=selling" className="card p-5 hover:shadow-md">
          <p className="label">My move-out</p>
          {sale ? (
            <>
              <p className="font-semibold">{sale.title}</p>
              <p className="text-sm text-ink-soft">{leavingLabel(daysLeft(sale))} · {db.items.filter((i) => i.saleId === sale.id && i.status === "available").length} items left</p>
            </>
          ) : <p className="text-sm text-ink-soft">Leaving soon? Start a sale in two minutes.</p>}
        </Link>
        <Link href="/dashboard?tab=selling#handovers" className="card p-5 hover:shadow-md">
          <p className="label">Handovers to complete</p>
          <p className="text-3xl font-bold">{pendingHandovers.length}</p>
          <p className="text-sm text-ink-soft">Ask the buyer for their OTP to get paid</p>
        </Link>
        <Link href="/dashboard?tab=buying" className="card p-5 hover:shadow-md">
          <p className="label">My orders</p>
          <p className="text-3xl font-bold">{orders.length}</p>
          <p className="text-sm text-ink-soft">{orders.filter((o) => o.status === "active").length} awaiting handover</p>
        </Link>
        <div className="card p-5 md:col-span-3">
          <p className="label">Invite friends: you both get {inr(FEES.referralCredit)}</p>
          <p className="mb-3 text-sm text-ink-soft">Your code <strong className="text-ink">{user!.referralCode}</strong>. Credit lands after their first sale or purchase.</p>
          <ShareButtons url={absoluteUrl(`/login?ref=${user!.referralCode}`)} text={`I'm using MoveOn to clear my room / set up a new one. Join with my code ${user!.referralCode} and we both get ₹200:`} />
        </div>
        {!sale && (
          <div className="flex flex-wrap gap-3 md:col-span-3">
            <Link href="/leaving" className="btn-leave">I&apos;m leaving: start a sale</Link>
            <Link href="/arriving" className="btn-arrive">I&apos;m arriving: set up my room</Link>
          </div>
        )}
      </div>
    );
  }

  function Selling() {
    if (!sale) return <EmptyState title="No move-out sale yet"><Link href="/leaving" className="underline">Start one</Link> and share a single link for everything you&apos;re selling.</EmptyState>;
    const items = db.items.filter((i) => i.saleId === sale.id);
    const available = items.filter((i) => i.status === "available");
    const left = daysLeft(sale);
    const offers = db.dealerOffers.filter((o) => o.status === "open" && available.some((i) => i.id === o.itemId));
    const disposals = db.disposals.filter((d) => d.saleId === sale.id);
    const paid = handovers.filter((h) => h.group.status === "handed_over").reduce((a, h) => a + h.group.sellerPayout, 0);
    const held = pendingHandovers.reduce((a, h) => a + h.group.sellerPayout, 0);
    const dealerCash = items.filter((i) => i.status === "dealer").reduce((a, i) => a + (i.soldPrice ?? 0), 0);
    const boosted = sale.boostedUntil && Date.parse(sale.boostedUntil) > Date.now();
    const ewasteItems = available.filter((i) => category(i.category).ewaste);

    return (
      <div className="space-y-6">
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="label">{sale.status === "active" ? "Live sale" : "Closed sale"}</p>
            <Link href={`/s/${sale.slug}`} className="text-xl font-bold hover:underline">{sale.title}</Link>
            <p className="text-sm text-ink-soft">{localityName(sale.locality)} · leaving {formatDate(sale.leavingDate)} · <span className={left <= 5 ? "font-semibold text-leave" : ""}>{leavingLabel(left)}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sale.status === "active" && <Link href={`/sell/${sale.id}/add`} className="btn-leave">+ Add items</Link>}
            <Link href={`/s/${sale.slug}`} className="btn-ghost">View sale page</Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-4">
          <div className="card p-4"><p className="label">Paid out</p><p className="text-2xl font-bold">{inr(paid)}</p></div>
          <div className="card p-4"><p className="label">Held for you</p><p className="text-2xl font-bold">{inr(held)}</p><p className="text-xs text-ink-soft">Released at handover</p></div>
          <div className="card p-4"><p className="label">Dealer cash</p><p className="text-2xl font-bold">{inr(dealerCash)}</p><p className="text-xs text-ink-soft">Paid by dealer at pickup</p></div>
          <div className="card p-4"><p className="label">Items left</p><p className="text-2xl font-bold">{available.length} / {items.length}</p></div>
        </section>

        {pendingHandovers.length > 0 && (
          <section id="handovers" className="card p-5">
            <h2 className="text-lg font-bold">Handovers to complete</h2>
            <ul className="mt-3 divide-y divide-line">
              {pendingHandovers.map((h) => (
                <li key={h.order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{h.items.map((i) => i.title).join(", ")}</p>
                    <p className="text-sm text-ink-soft">Buyer {h.buyer.name} · {h.order.fulfilment === "delivery" ? `delivery pickup ${h.order.slot?.date}, ${h.order.slot?.window}` : "self-pickup"} · you get {inr(h.group.sellerPayout)}</p>
                  </div>
                  <Link href={`/orders/${h.order.id}`} className="btn-arrive">Enter OTP & chat</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="exit" className="card overflow-hidden">
          <div className={`p-5 ${left <= 5 ? "bg-leave-soft" : "bg-paper"}`}>
            <h2 className="text-lg font-bold">Nothing left behind</h2>
            <p className="text-sm text-ink-soft">
              {left <= 5 ? `${leavingLabel(left)}. ` : `Automatic instant offers start ${formatDate(addDays(sale.leavingDate, -5))}. `}
              Accept a partner dealer&apos;s cash offer, or book a free donation or e-waste pickup. Your room will be empty on time.
            </p>
            {sale.status === "active" && available.length > 0 && (
              <ActionForm action={instantOffersAction} className="mt-3">
                <input type="hidden" name="saleId" value={sale.id} />
                <Submit className="btn-ghost" pendingText="Asking dealers…">Get instant dealer offers now</Submit>
              </ActionForm>
            )}
          </div>
          {offers.length > 0 && (
            <ul className="divide-y divide-line">
              {available.filter((i) => offers.some((o) => o.itemId === i.id)).map((i) => {
                const its = offers.filter((o) => o.itemId === i.id).sort((a, b) => b.amount - a.amount);
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{i.title}</p>
                      <p className="text-xs text-ink-soft">Listed at {inr(countdownPrice(i, sale.dropRatePerWeek))}</p>
                    </div>
                    {its.map((o) => (
                      <ActionForm key={o.id} action={offerAction} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5">
                        <input type="hidden" name="offerId" value={o.id} />
                        <span className="text-sm"><strong>{inr(o.amount)}</strong> · {db.dealers.find((d) => d.id === o.dealerId)?.name}</span>
                        <Submit className="btn-arrive px-2 py-1 text-xs" name="decision" value="accept" confirm={`Sell "${i.title}" to the dealer for ${inr(o.amount)}?`} pendingText="…">Accept</Submit>
                        <Submit className="text-xs text-ink-soft underline" name="decision" value="decline" pendingText="…">Decline</Submit>
                      </ActionForm>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
          {sale.status === "active" && available.length > 0 && (
            <div className="grid gap-4 border-t border-line p-5 md:grid-cols-2">
              <ActionForm action={disposalAction}>
                <input type="hidden" name="saleId" value={sale.id} />
                <input type="hidden" name="kind" value="donation" />
                <p className="font-semibold">Donate</p>
                <p className="text-xs text-ink-soft">Free pickup by {DISPOSAL_PARTNERS.donation}, with a donation certificate.</p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {available.map((i) => <label key={i.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="itemIds" value={i.id} /> {i.title}</label>)}
                </div>
                <Submit className="btn-ghost mt-2" confirm="Book a donation pickup for the selected items?" pendingText="Booking…">Book donation pickup</Submit>
              </ActionForm>
              {ewasteItems.length > 0 && (
                <ActionForm action={disposalAction}>
                  <input type="hidden" name="saleId" value={sale.id} />
                  <input type="hidden" name="kind" value="ewaste" />
                  <p className="font-semibold">Recycle e-waste</p>
                  <p className="text-xs text-ink-soft">Collected by {DISPOSAL_PARTNERS.ewaste}, with a recycling certificate.</p>
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {ewasteItems.map((i) => <label key={i.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="itemIds" value={i.id} /> {i.title}</label>)}
                  </div>
                  <Submit className="btn-ghost mt-2" confirm="Book e-waste recycling for the selected items?" pendingText="Booking…">Book e-waste pickup</Submit>
                </ActionForm>
              )}
            </div>
          )}
          {disposals.length > 0 && (
            <ul className="border-t border-line px-5 py-3 text-sm">
              {disposals.map((d) => <li key={d.id}>{d.kind === "donation" ? "🎁 Donation" : "♻️ E-waste"} pickup {formatDate(d.pickupDate)} · {d.itemIds.length} items · certificate <strong>{d.certificateNo}</strong></li>)}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-bold">Items</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase text-ink-soft">
                <tr><th className="py-2">Item</th><th>Status</th><th>Price now</th><th>Next drop</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => {
                  const nd = i.status === "available" ? nextDrop(i, sale) : null;
                  return (
                    <tr key={i.id}>
                      <td className="py-2"><Link href={`/i/${i.id}`} className="font-medium hover:underline">{i.title}</Link></td>
                      <td className="capitalize">{i.status}</td>
                      <td>{i.status === "available" ? inr(countdownPrice(i, sale.dropRatePerWeek)) : i.soldPrice !== undefined ? inr(i.soldPrice) : "–"}</td>
                      <td className="text-ink-soft">{nd ? `${inr(nd.price)} on ${formatDate(nd.date)}` : "–"}</td>
                      <td className="text-right">{i.status === "available" || i.status === "withdrawn" ? <Link href={`/sell/item/${i.id}`} className="underline">Edit</Link> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {sale.status === "active" && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="text-lg font-bold">Boost your sale</h2>
              <p className="text-sm text-ink-soft">Featured on the home page and top of search. {boosted ? `Boosted until ${formatDate(sale.boostedUntil!)}. ` : ""}Paid from your proceeds, never upfront.{sale.boostDue ? ` ${inr(sale.boostDue)} due from your next payout.` : ""}</p>
              <div className="mt-3 space-y-2">
                {BOOSTS.map((b) => (
                  <ActionForm key={b.id} action={boostAction} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                    <input type="hidden" name="saleId" value={sale.id} />
                    <input type="hidden" name="boostId" value={b.id} />
                    <span className="text-sm">{b.label}</span>
                    <Submit className="btn-ghost px-3 py-1 text-xs" pendingText="…">{inr(b.price)}</Submit>
                  </ActionForm>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="text-lg font-bold">Sale settings</h2>
              <ActionForm action={updateSaleAction} className="mt-3 space-y-3">
                <input type="hidden" name="saleId" value={sale.id} />
                <div><label className="label" htmlFor="s-title">Title</label><input id="s-title" name="title" defaultValue={sale.title} className="input" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label" htmlFor="s-date">Leaving date</label><input id="s-date" type="date" name="leavingDate" min={todayIST()} defaultValue={sale.leavingDate} className="input" /></div>
                  <div>
                    <label className="label" htmlFor="s-drop">Weekly drop</label>
                    <select id="s-drop" name="dropRate" defaultValue={String(Math.round(sale.dropRatePerWeek * 100))} className="input">
                      {[0, 5, 10, 15, 20].map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="label" htmlFor="s-note">Note to buyers</label><textarea id="s-note" name="note" rows={2} defaultValue={sale.note} className="input" /></div>
                <Submit pendingText="Saving…">Save</Submit>
              </ActionForm>
            </section>
          </div>
        )}

        <Concierge leavingDate={sale.leavingDate} />
      </div>
    );
  }

  function Concierge({ leavingDate }: { leavingDate: string }) {
    const leads = db.serviceLeads.filter((l) => l.userId === user!.id);
    return (
      <section className="card p-5">
        <h2 className="text-lg font-bold">Move-out concierge</h2>
        <p className="text-sm text-ink-soft">Everything else about leaving, handled by vetted partners.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(Object.keys(SERVICES) as (keyof typeof SERVICES)[]).map((key) => {
            const requested = leads.find((l) => l.service === key);
            return (
              <ActionForm key={key} action={serviceAction} className="rounded-xl border border-line p-3">
                <input type="hidden" name="service" value={key} />
                <input type="hidden" name="date" value={leavingDate} />
                <p className="font-semibold">{SERVICES[key].label}</p>
                <p className="text-xs text-ink-soft">{SERVICES[key].blurb}</p>
                {requested ? <p className="mt-2 text-xs font-semibold text-ok">Requested · {requested.status}</p> : <Submit className="btn-ghost mt-2 w-full" pendingText="…">Get a quote</Submit>}
              </ActionForm>
            );
          })}
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">Deposit-return checklist</summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-ink-soft">
            <li>Photograph every room and meter reading on your last day</li>
            <li>Return all keys and access cards; get a written acknowledgement</li>
            <li>Close or transfer broadband, gas and electricity accounts</li>
            <li>Update your address with your bank, employer and Aadhaar</li>
            <li>Ask the landlord for the deposit refund date in writing</li>
          </ul>
        </details>
      </section>
    );
  }

  function Buying() {
    const owned = ownedItems(user!.id);
    return (
      <div className="space-y-6">
        <section className="card p-5">
          <h2 className="text-lg font-bold">Orders</h2>
          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No orders yet. <Link href="/kits" className="underline">Try a Starter Kit</Link>.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{o.groups.flatMap((g) => g.itemIds).map((id) => db.items.find((i) => i.id === id)?.title).join(", ")}</p>
                    <p className="text-sm text-ink-soft">{formatDate(o.createdAt)} · {inr(o.total)} · <span className="capitalize">{o.status}</span></p>
                  </div>
                  <Link href={`/orders/${o.id}`} className={o.status === "active" ? "btn-arrive" : "btn-ghost"}>{o.status === "active" ? "Show OTP" : "View"}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="text-lg font-bold">Things I own</h2>
          <p className="text-sm text-ink-soft">Buy-back values for certified items. Leaving later? List them in your own move-out sale.</p>
          {owned.length === 0 ? <p className="mt-2 text-sm text-ink-soft">Nothing yet.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {owned.map((i) => {
                const bb = buyBackStatus(i);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <Link href={`/i/${i.id}`} className="font-medium hover:underline">{i.title}</Link>
                      <p className="text-sm text-ink-soft">Bought for {inr(i.soldPrice ?? 0)}{bb.value ? ` · guaranteed buy-back ${inr(bb.value)} until ${formatDate(bb.deadline!)}` : ""}</p>
                    </div>
                    {bb.claim ? <span className="chip bg-tape/40">Buy-back requested</span> : bb.eligible ? (
                      <ActionForm action={claimBuyBackAction}>
                        <input type="hidden" name="itemId" value={i.id} />
                        <Submit className="btn-ghost" confirm={`Sell "${i.title}" back to MoveOn for ${inr(bb.value)}?`} pendingText="…">Claim {inr(bb.value)} buy-back</Submit>
                      </ActionForm>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  function Inbox() {
    return (
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Notifications</h2>
          {unread > 0 && <ActionForm action={markReadAction} quiet><Submit className="btn-ghost px-3 py-1 text-xs" pendingText="…">Mark all read</Submit></ActionForm>}
        </div>
        {notifications.length === 0 ? <p className="mt-2 text-sm text-ink-soft">All quiet.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {notifications.map((n) => (
              <li key={n.id} className={`py-3 text-sm ${n.read ? "text-ink-soft" : ""}`}>
                {!n.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-arrive" aria-label="unread" />}
                {n.link ? <Link href={n.link} className="hover:underline">{n.text}</Link> : n.text}
                <span className="ml-2 text-xs text-ink-soft">{timeAgo(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-ink-soft">These also arrive on WhatsApp when WhatsApp Business is connected.</p>
      </section>
    );
  }

  function Profile() {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <ActionForm action={profileAction} className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Profile & payouts</h2>
          <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" defaultValue={user!.name} className="input" /></div>
          <div><label className="label">Phone</label><p className="text-sm">{user!.phone} · never shown to other users</p></div>
          <div><label className="label" htmlFor="upiId">UPI ID for payouts</label><input id="upiId" name="upiId" defaultValue={user!.upiId} placeholder="name@okbank" className="input" /></div>
          {process.env.RAZORPAY_KEY_ID && (
            <div><label className="label" htmlFor="razorpayAccountId">Razorpay linked account</label><input id="razorpayAccountId" name="razorpayAccountId" defaultValue={user!.razorpayAccountId} placeholder="acc_XXXXXXXX" className="input" /></div>
          )}
          <Submit pendingText="Saving…">Save</Submit>
        </ActionForm>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-lg font-bold">Verified communities</h2>
            <div className="mt-2"><Badges badges={user!.badges} /></div>
            {user!.badges.length === 0 && <p className="text-sm text-ink-soft">No badges yet. Verified sellers sell faster.</p>}
            <Link href="/verify" className="btn-ghost mt-3">Verify college, company or co-living</Link>
          </section>
          <section className="card p-5">
            <h2 className="text-lg font-bold">Move-in profile</h2>
            {user!.arrival ? (
              <p className="text-sm text-ink-soft">Moving to {localityName(user!.arrival.locality)} on {formatDate(user!.arrival.moveInDate)} · budget {inr(user!.arrival.budget)} · alerts for {user!.arrival.wants.map((w) => category(w).label).join(", ") || "nothing"}</p>
            ) : <p className="text-sm text-ink-soft">Set one to get WhatsApp alerts when what you need is listed nearby.</p>}
            <Link href="/arriving" className="btn-ghost mt-3">{user!.arrival ? "Edit" : "Set up"} move-in alerts</Link>
          </section>
        </div>
      </div>
    );
  }
}
