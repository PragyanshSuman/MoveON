import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { localityName, LOCALITIES } from "@/lib/catalog";
import { formatDate, inr } from "@/lib/format";
import { allKits } from "@/lib/services/marketplace";
import { AddToCart } from "@/components/add-to-cart";

export const metadata = { title: "Starter Kits", description: "One-click room setups (bed, mattress, table, chair, fan) assembled from move-out sales near you." };

export default async function Kits({ searchParams }: { searchParams: Promise<{ locality?: string; budget?: string; date?: string }> }) {
  const sp = await searchParams;
  const [user, cart] = await Promise.all([currentUser(), getCart()]);
  const locality = sp.locality || user?.arrival?.locality || "koramangala";
  const budget = Number(sp.budget || user?.arrival?.budget || 0) || undefined;
  const moveInDate = sp.date || user?.arrival?.moveInDate;
  const kits = allKits(user, { locality, budget, moveInDate });

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold">Starter Kits for {localityName(locality)}</h1>
      <p className="mt-1 text-ink-soft">
        Bundles assembled from live move-out sales nearby, on one delivery trip{moveInDate ? `, available by ${formatDate(moveInDate)}` : ""}.
      </p>
      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="locality">Area</label>
          <select id="locality" name="locality" defaultValue={locality} className="input">
            {LOCALITIES.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">Move-in date</label>
          <input id="date" type="date" name="date" defaultValue={moveInDate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="budget">Budget (₹)</label>
          <input id="budget" type="number" name="budget" step={500} min={0} defaultValue={budget} className="input w-36" />
        </div>
        <button className="btn-primary">Update kits</button>
      </form>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {kits.map((k) => {
          const picks = k.slots.flatMap((s) => (s.pick ? [s.pick] : []));
          const grand = k.total + k.delivery.price;
          return (
            <section key={k.kit.slug} id={k.kit.slug} className="card scroll-mt-24 overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-line bg-arrive-soft/60 p-5">
                <div>
                  <h2 className="text-xl font-bold">{k.kit.name}</h2>
                  <p className="text-sm text-ink-soft">{k.kit.audience}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold">{inr(grand)}</p>
                  <p className="text-xs text-ink-soft">incl. {inr(k.delivery.price)} delivery · {k.sellers} seller{k.sellers === 1 ? "" : "s"}</p>
                </div>
              </div>
              <ul className="divide-y divide-line">
                {k.slots.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 p-3">
                    {s.pick ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.pick.item.photos[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase text-ink-soft">{s.label}</p>
                          <Link href={`/i/${s.pick.item.id}`} className="block truncate font-medium hover:underline">{s.pick.item.title}</Link>
                          <p className="text-xs text-ink-soft">{localityName(s.pick.sale.locality)} · seller leaves {formatDate(s.pick.sale.leavingDate)}</p>
                        </div>
                        <span className="font-semibold">{inr(s.pick.price)}</span>
                      </>
                    ) : (
                      <p className="text-sm text-ink-soft"><strong>{s.label}:</strong> nothing nearby right now. <Link href="/arriving" className="underline">Get an alert</Link></p>
                    )}
                  </li>
                ))}
              </ul>
              <div className="space-y-2 p-4">
                {k.overBudget && <p className="text-sm font-medium text-leave">This kit is {inr(grand - (budget ?? 0))} over your budget; swap items from the alternatives on each item page.</p>}
                {picks.length > 0 ? (
                  <AddToCart itemIds={picks.map((v) => v.item.id)} inCart={picks.every((v) => cart.includes(v.item.id))} label={`Add ${picks.length} items to cart`} />
                ) : (
                  <p className="text-sm text-ink-soft">No items available for this kit yet.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
