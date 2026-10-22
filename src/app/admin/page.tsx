import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, isAdmin } from "@/lib/auth";
import { localityName } from "@/lib/catalog";
import { formatDate, inr, timeAgo } from "@/lib/format";
import { orderContribution } from "@/lib/pricing";
import { SERVICES } from "@/lib/services/account";
import { metrics, queues } from "@/lib/services/admin";
import { certifyAction, completeBuyBackAction, leadBookedAction, resolveDisputeAction, runJobsAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { BarList } from "@/components/bar-list";

export const metadata = { title: "Admin" };

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const KIND_LABEL: Record<string, string> = {
  seller_fee: "Seller success fees", buyer_fee: "Buyer protection fees", delivery_margin: "Delivery margin", boost: "Boosts",
  dealer_referral: "Dealer referrals", buyback_margin: "Buy-back margin", service_referral: "Service referrals", refund_loss: "Refund losses",
};

function Metric({ label, value, target, ok }: { label: string; value: string; target: string; ok: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className={`mt-1 text-xs font-semibold ${ok ? "text-ok" : "text-leave"}`}>{ok ? "✓" : "⚠"} Target {target}</p>
    </div>
  );
}

export default async function Admin() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) notFound();
  const m = metrics();
  const q = queues();
  const example = orderContribution({ itemsTotal: 4000, sellerFees: 400, buyerFee: 160, deliveryMargin: 150, total: 4000 + 160 + 1100 });

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Operations</h1>
        <ActionForm action={runJobsAction} className="flex items-center gap-3">
          <Submit className="btn-ghost" pendingText="Running…">Run daily jobs now</Submit>
        </ActionForm>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="card p-6">
          <p className="text-sm text-ink-soft">North star: items re-homed before the deadline</p>
          <p className="mt-2 text-6xl font-extrabold tabular-nums">{pct(m.northStar.rate)}</p>
          <p className="mt-2 text-sm text-ink-soft">{m.northStar.rehomedOnTime} of {m.northStar.decided} decided items · target 50%</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div><dt className="text-ink-soft">Sold</dt><dd className="text-lg font-bold">{m.exits.sold}</dd></div>
            <div><dt className="text-ink-soft">Dealer</dt><dd className="text-lg font-bold">{m.exits.dealer}</dd></div>
            <div><dt className="text-ink-soft">Donated / recycled</dt><dd className="text-lg font-bold">{m.exits.donated + m.exits.recycled}</dd></div>
          </dl>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Days from listing to sale" value={m.avgDaysToSale.toFixed(1)} target="< 7 days" ok={m.avgDaysToSale < 7} />
          <Metric label="GMV (handed over)" value={inr(m.gmv)} target="₹50L first season" ok={m.gmv >= 5_000_000} />
          <Metric label="Blended take rate" value={pct(m.takeRate)} target="14–15%" ok={m.takeRate >= 0.14} />
          <Metric label="Contribution per order" value={inr(m.avgContribution)} target="₹400+" ok={m.avgContribution >= 400} />
          <Metric label="Buyers who later sold" value={`${m.buyerToSeller.becameSellers} / ${m.buyerToSeller.buyers}`} target="rising each season" ok={m.buyerToSeller.becameSellers > 0} />
          <Metric label="Dispute rate" value={pct(m.disputeRate)} target="< 3% of orders" ok={m.disputeRate < 0.03} />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-bold">Revenue by stream</h2>
          <p className="mb-4 text-xs text-ink-soft">All-time ledger · total {inr(m.revenue)}</p>
          {m.revenueByKind.length ? (
            <BarList caption="Revenue by stream" rows={m.revenueByKind.map(([k, v]) => ({ label: KIND_LABEL[k] ?? k, value: v, display: inr(v) }))} />
          ) : <p className="text-sm text-ink-soft">No revenue yet.</p>}
        </div>
        <div className="card p-5">
          <h2 className="font-bold">Unit economics of one ₹4,000 order</h2>
          <p className="mb-4 text-xs text-ink-soft">Planning assumptions: truck delivery, 2% payment cost, ₹60 support, 2% refund reserve</p>
          <BarList
            caption="Contribution waterfall for a ₹4,000 order"
            rows={[
              { label: "Seller fee (10%)", value: 400, display: "+₹400" },
              { label: "Buyer fee (4%)", value: 160, display: "+₹160" },
              { label: "Delivery margin", value: 150, display: "+₹150" },
              { label: "Payment cost", value: -example.paymentCost, display: `−${inr(example.paymentCost)}` },
              { label: "Support", value: -example.supportCost, display: `−${inr(example.supportCost)}` },
              { label: "Refund reserve", value: -example.refundReserve, display: `−${inr(example.refundReserve)}` },
              { label: "Contribution", value: example.contribution, display: inr(example.contribution), emphasis: true },
            ]}
          />
        </div>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="font-bold">Liquidity by locality</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase text-ink-soft"><tr><th className="py-2">Locality</th><th>Listed</th><th>Re-homed</th><th>Sell-through</th><th>Avg days to sale</th></tr></thead>
            <tbody className="divide-y divide-line tabular-nums">
              {m.byLocality.map((r) => (
                <tr key={r.locality.slug}>
                  <td className="py-2 font-medium">{r.locality.name}</td>
                  <td>{r.listed}</td>
                  <td>{r.rehomed}</td>
                  <td>{pct(r.listed ? r.rehomed / r.listed : 0)}</td>
                  <td>{r.avgDays === null ? "–" : r.avgDays.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="disputes" className="card mt-6 p-5">
        <h2 className="font-bold">Open disputes ({q.disputes.length})</h2>
        {q.disputes.length === 0 && <p className="mt-2 text-sm text-ink-soft">None. 🎉</p>}
        <div className="mt-3 space-y-4">
          {q.disputes.map((d) => (
            <div key={d.dispute.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <p><strong>{d.items.map((i) => i.title).join(", ")}</strong> · {inr(d.group.subtotal)} · group {d.group.status}</p>
                <p className="text-ink-soft">Opened by {d.openedBy.name} {timeAgo(d.dispute.createdAt)} · <Link href={`/orders/${d.order.id}`} className="underline">order</Link></p>
              </div>
              <p className="mt-2 text-sm">“{d.dispute.reason}”</p>
              <p className="mt-1 text-xs text-ink-soft">Buyer {d.buyer.name} · Seller {d.seller.name} · {d.messages.length} chat messages</p>
              <div className="mt-2 flex gap-2">
                {d.items.flatMap((i) => i.photos.slice(0, 1)).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={p} alt="Listing photo" className="h-16 w-16 rounded-lg object-cover" />
                ))}
              </div>
              <ActionForm action={resolveDisputeAction} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="disputeId" value={d.dispute.id} />
                <input name="note" required placeholder="Resolution note (sent to both)" className="input max-w-md flex-1" />
                <Submit className="btn-danger" name="outcome" value="refund" confirm="Refund the buyer?" pendingText="…">Refund buyer</Submit>
                <Submit className="btn-arrive" name="outcome" value="release" confirm="Release payment to the seller?" pendingText="…">Release to seller</Submit>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section id="buyback" className="card p-5">
          <h2 className="font-bold">Buy-back claims ({q.buyBacks.length})</h2>
          <ul className="mt-3 divide-y divide-line">
            {q.buyBacks.length === 0 && <li className="text-sm text-ink-soft">None pending.</li>}
            {q.buyBacks.map((b) => (
              <li key={b.claim.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{b.item.title} · {b.user.name} · {inr(b.claim.amount)}</span>
                <ActionForm action={completeBuyBackAction}>
                  <input type="hidden" name="claimId" value={b.claim.id} />
                  <Submit className="btn-ghost px-3 py-1 text-xs" confirm="Mark as inspected, collected and paid?" pendingText="…">Paid & relist</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
        <section id="leads" className="card p-5">
          <h2 className="font-bold">Concierge leads ({q.leads.length})</h2>
          <ul className="mt-3 divide-y divide-line">
            {q.leads.length === 0 && <li className="text-sm text-ink-soft">None.</li>}
            {q.leads.map(({ lead, user: u }) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{SERVICES[lead.service].label} · {u.name} ({u.phone}) · {localityName(lead.locality)} · {formatDate(lead.date)}</span>
                <ActionForm action={leadBookedAction}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <Submit className="btn-ghost px-3 py-1 text-xs" pendingText="…">Booked (+{inr(SERVICES[lead.service].referralFee)})</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {q.lockedHandovers.length > 0 && (
        <section className="card mt-6 border-danger/30 p-5">
          <h2 className="font-bold text-danger">Locked handovers (too many wrong OTPs)</h2>
          <ul className="mt-2 text-sm">
            {q.lockedHandovers.map((l) => <li key={l.order.id}><Link href={`/orders/${l.order.id}`} className="underline">{l.order.id}</Link>: call both parties and resolve as a dispute.</li>)}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">Recent orders</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {q.recentOrders.map(({ order, buyer }) => (
              <li key={order.id} className="flex justify-between gap-2 py-2">
                <Link href={`/orders/${order.id}`} className="underline">{order.id}</Link>
                <span className="text-ink-soft">{buyer.name} · {inr(order.total)} · {order.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-bold">Certify for buy-back</h2>
          <p className="text-xs text-ink-soft">Only certify categories with proven resale data, after photo inspection. Cap exposure per month.</p>
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto text-sm">
            {q.certifiable.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/i/${i.id}`} className="truncate underline">{i.title}</Link>
                <ActionForm action={certifyAction}>
                  <input type="hidden" name="itemId" value={i.id} />
                  <input type="hidden" name="certified" value="1" />
                  <Submit className="btn-ghost px-3 py-1 text-xs" pendingText="…">Certify</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
