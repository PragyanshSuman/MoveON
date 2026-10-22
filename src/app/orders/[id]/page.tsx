import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdmin } from "@/lib/auth";
import { localityName } from "@/lib/catalog";
import { formatDate, inr, timeAgo } from "@/lib/format";
import { orderView } from "@/lib/services/orders";
import { disputeAction, handoverAction, messageAction, rateAction, refuseAction, sellerCancelAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Badges } from "@/components/ui";

export const metadata = { title: "Order" };

const GROUP_STATUS = {
  held: { label: "Payment held · awaiting handover", cls: "bg-tape/40 text-ink" },
  handed_over: { label: "Handed over · seller paid", cls: "bg-ok/10 text-ok" },
  refused: { label: "Refused · refunded", cls: "bg-leave-soft text-leave" },
  disputed: { label: "Disputed · payment frozen", cls: "bg-danger/10 text-danger" },
} as const;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { id } = await params;
  const { paid } = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/orders/${id}`);
  const viewer = isAdmin(user) ? { ...user, role: "admin" as const } : user;
  const data = orderView(viewer, id);
  if (!data) notFound();
  const { order, isBuyer, groups, buyer } = data;
  const canSeeAddress = isBuyer || data.isAdmin;

  return (
    <div className="container-page max-w-4xl py-8">
      {paid && isBuyer && (
        <div className="mb-6 rounded-2xl bg-arrive p-5 text-white">
          <p className="text-lg font-bold">Paid and held safely ✓</p>
          <p className="text-sm opacity-90">Meet each seller (or the delivery partner), check the items, then share that seller&apos;s OTP. Not as described? Refuse it below for a full refund.</p>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-ink-soft">Order {order.id} · {formatDate(order.createdAt, { day: "numeric", month: "short", year: "numeric" })}</p>
          <h1 className="text-3xl font-bold">{isBuyer ? "Your order" : `Order from ${buyer.name}`}</h1>
        </div>
        <span className="chip bg-kraft-soft capitalize">{order.status.replace("_", " ")}</span>
      </div>

      <section className="card mt-4 grid gap-4 p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="label">Handover</p>
          <p className="font-semibold">{order.fulfilment === "delivery" ? `Delivery · ${order.slot ? `${formatDate(order.slot.date)}, ${order.slot.window}` : ""}` : "Self-pickup"}</p>
          <p className="text-ink-soft">{order.fulfilment === "delivery" ? (canSeeAddress ? order.address : `To ${localityName(order.locality)}; the delivery partner will collect from you`) : "Arrange a time in the chat below"}</p>
        </div>
        {(isBuyer || data.isAdmin) && (
          <div>
            <p className="label">Paid</p>
            <p className="font-semibold">{inr(order.total)}</p>
            <p className="text-ink-soft">Items {inr(order.itemsTotal)} · protection {inr(order.buyerFee)}{order.deliveryFee ? ` · delivery ${inr(order.deliveryFee)}` : ""}{order.creditApplied ? ` · credit −${inr(order.creditApplied)}` : ""}</p>
          </div>
        )}
        {order.payment.refundedAmount > 0 && (
          <div>
            <p className="label">Refunded</p>
            <p className="font-semibold text-leave">{inr(order.payment.refundedAmount)}</p>
            <p className="text-ink-soft">To your original payment method, 3–5 working days</p>
          </div>
        )}
      </section>

      {groups.map((g) => {
        const status = GROUP_STATUS[g.status];
        const isSellerHere = g.sellerId === user.id;
        const rateTarget = isBuyer ? g.sellerId : order.buyerId;
        return (
          <section key={g.sellerId} className="card mt-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-5 py-3">
              <div>
                <p className="font-semibold">{isBuyer ? `From ${g.seller.name}` : isSellerHere ? "Your items" : `Seller ${g.seller.name}`} · <Link href={`/s/${g.sale.slug}`} className="underline">{localityName(g.sale.locality)}</Link></p>
                <div className="mt-0.5"><Badges badges={g.seller.badges} compact /></div>
              </div>
              <span className={`chip ${status.cls}`}>{status.label}</span>
            </div>
            <ul className="divide-y divide-line">
              {g.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.photos[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  <Link href={`/i/${it.id}`} className="flex-1 font-medium hover:underline">{it.title}</Link>
                  <span className="font-semibold">{inr(g.prices[it.id])}</span>
                </li>
              ))}
            </ul>

            <div className="grid gap-4 border-t border-line p-5 md:grid-cols-2">
              <div className="space-y-4">
                {/* Buyer actions */}
                {isBuyer && g.status === "held" && (
                  <>
                    <div className="rounded-2xl bg-ink p-4 text-center text-white">
                      <p className="text-xs uppercase tracking-wider opacity-70">Handover OTP for {g.seller.name}</p>
                      <p className="mt-1 font-mono text-4xl font-bold tracking-[0.4em]">{g.handoverOtp}</p>
                      <p className="mt-2 text-xs opacity-80">Share only after you&apos;ve checked every item. Sharing it releases {inr(g.subtotal)} to the seller.</p>
                    </div>
                    <details className="rounded-xl border border-line p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-leave">Not as described? Refuse for a full refund</summary>
                      <ActionForm action={refuseAction} className="mt-3 space-y-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="sellerId" value={g.sellerId} />
                        <textarea name="reason" required minLength={5} rows={2} placeholder="What's wrong? e.g. stains not shown in photos" className="input" />
                        <Submit className="btn-danger w-full" confirm="Refuse these items and get a full refund?" pendingText="Refunding…">Refuse &amp; refund</Submit>
                      </ActionForm>
                    </details>
                  </>
                )}
                {/* Seller actions */}
                {isSellerHere && g.status === "held" && (
                  <>
                    <ActionForm action={handoverAction} className="rounded-2xl bg-arrive-soft p-4">
                      <input type="hidden" name="orderId" value={order.id} />
                      <label htmlFor={`otp-${g.sellerId}`} className="label text-arrive">Enter the buyer&apos;s handover OTP</label>
                      <div className="flex gap-2">
                        <input id={`otp-${g.sellerId}`} name="otp" inputMode="numeric" maxLength={4} required placeholder="••••" className="input text-center font-mono text-xl tracking-[0.4em]" />
                        <Submit className="btn-arrive" pendingText="Checking…">Confirm</Submit>
                      </div>
                      <p className="mt-2 text-xs text-ink-soft">You&apos;ll receive {inr(g.sellerPayout)} ({inr(g.subtotal)} − {inr(g.sellerFee)} fee{g.boostDeducted ? ` − ${inr(g.boostDeducted)} boost` : ""}) the same day.</p>
                    </ActionForm>
                    <details className="rounded-xl border border-line p-3">
                      <summary className="cursor-pointer text-sm font-semibold">Can&apos;t complete this handover?</summary>
                      <ActionForm action={sellerCancelAction} className="mt-3 space-y-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input name="reason" placeholder="Reason (shared with the buyer)" className="input" />
                        <Submit className="btn-danger w-full" confirm="Cancel and refund the buyer in full?" pendingText="Cancelling…">Cancel &amp; refund buyer</Submit>
                      </ActionForm>
                    </details>
                  </>
                )}
                {g.status === "handed_over" && (isBuyer || isSellerHere) && !g.myRating && (
                  <ActionForm action={rateAction} className="space-y-2 rounded-xl border border-line p-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="toId" value={rateTarget} />
                    <p className="text-sm font-semibold">Rate the {isBuyer ? "seller" : "buyer"}</p>
                    <div className="flex flex-row-reverse justify-end gap-1">
                      {[5, 4, 3, 2, 1].map((n) => (
                        <label key={n} className="cursor-pointer">
                          <input type="radio" name="stars" value={n} required className="peer sr-only" />
                          <span className="grid h-9 w-9 place-items-center rounded-lg border border-line text-sm peer-checked:border-tape peer-checked:bg-tape/40">{n}★</span>
                        </label>
                      ))}
                    </div>
                    <input name="comment" maxLength={300} placeholder="Optional comment" className="input" />
                    <Submit className="btn-primary w-full">Submit rating</Submit>
                  </ActionForm>
                )}
                {g.myRating && <p className="text-sm text-ink-soft">You rated {g.myRating.stars}★{g.myRating.comment ? `: "${g.myRating.comment}"` : ""}</p>}
                {g.dispute && (
                  <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">
                    <p className="font-semibold">Dispute {g.dispute.status === "open" ? "under review" : g.dispute.status === "resolved_refund" ? "resolved: buyer refunded" : "resolved: seller paid"}</p>
                    <p className="text-ink-soft">{g.dispute.reason}</p>
                    {g.dispute.resolutionNote && <p className="mt-1">Support: {g.dispute.resolutionNote}</p>}
                  </div>
                )}
                {g.canDispute && !g.dispute && (isBuyer || isSellerHere) && (
                  <details className="rounded-xl border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Report a problem to MoveOn support</summary>
                    <ActionForm action={disputeAction} className="mt-3 space-y-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="sellerId" value={g.sellerId} />
                      <textarea name="reason" required minLength={10} rows={3} placeholder="What happened? Support compares listing photos, handover photos and this chat." className="input" />
                      <Submit className="btn-ghost w-full" pendingText="Opening…">Open dispute</Submit>
                    </ActionForm>
                  </details>
                )}
              </div>

              {/* Masked chat */}
              <div className="flex flex-col rounded-2xl border border-line">
                <p className="border-b border-line px-3 py-2 text-sm font-semibold">Chat with {isBuyer ? g.seller.name : buyer.name} <span className="font-normal text-ink-soft">· numbers stay private</span></p>
                <ul className="max-h-72 flex-1 space-y-2 overflow-y-auto p-3">
                  {g.messages.length === 0 && <li className="text-sm text-ink-soft">No messages yet. Agree a pickup time here.</li>}
                  {g.messages.map((m) => (
                    <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "ml-auto bg-ink text-white" : "bg-kraft-soft"}`}>
                      {m.body}
                      <span className="mt-0.5 block text-[10px] opacity-60">{m.from} · {timeAgo(m.createdAt)}</span>
                    </li>
                  ))}
                </ul>
                {(isBuyer || isSellerHere) && (
                  <ActionForm action={messageAction} className="border-t border-line p-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="sellerId" value={g.sellerId} />
                    <div className="flex gap-2">
                      <input name="body" required maxLength={1000} placeholder="Message…" className="input" autoComplete="off" />
                      <Submit className="btn-primary" pendingText="…">Send</Submit>
                    </div>
                  </ActionForm>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
