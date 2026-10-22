import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { localityName } from "@/lib/catalog";
import { formatDate, inr } from "@/lib/format";
import { todayIST } from "@/lib/pricing";
import { cartQuote } from "@/lib/services/orders";
import { pruneCart, removeFromCart } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { CheckoutForm } from "@/components/checkout-form";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const [user, ids] = await Promise.all([currentUser(), getCart()]);
  const locality = user?.arrival?.locality ?? "koramangala";
  const q = cartQuote(user, ids, { fulfilment: "pickup", locality });

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold">Your cart</h1>
      {q.unavailable.length > 0 && (
        <ActionForm action={pruneCart} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-leave-soft p-3 text-sm text-leave">
          <span>No longer available: {q.unavailable.join(", ")}.</span>
          <Submit className="btn-ghost px-3 py-1 text-xs" pendingText="Removing…">Remove them</Submit>
        </ActionForm>
      )}
      {q.warnings.map((w) => <p key={w} className="mt-2 rounded-xl bg-kraft-soft p-3 text-sm">{w}</p>)}
      {!q.lines.length ? (
        <div className="mt-6">
          <EmptyState title="Your cart is empty">
            <Link href="/kits" className="underline">Try a Starter Kit</Link> or <Link href="/browse" className="underline">browse sales</Link>.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            {q.groups.map((g) => (
              <section key={g.sellerId} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2 text-sm">
                  <p><strong>{g.sellerName}</strong> · {localityName(g.locality)}</p>
                  <p className="text-leave">Leaves {formatDate(g.leavingDate)}</p>
                </div>
                <ul className="divide-y divide-line">
                  {g.items.map((v) => (
                    <li key={v.item.id} className="flex items-center gap-3 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.item.photos[0]} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/i/${v.item.id}`} className="block truncate font-medium hover:underline">{v.item.title}</Link>
                        <p className="text-xs text-ink-soft">{v.item.stayInPlace ? "Stay-in-place handover" : v.heavy ? "Heavy item" : "Fits on a two-wheeler"}</p>
                      </div>
                      <span className="font-semibold">{inr(v.price)}</span>
                      <ActionForm action={removeFromCart} quiet>
                        <input type="hidden" name="itemId" value={v.item.id} />
                        <Submit className="btn-ghost px-2 py-1 text-xs" pendingText="…">Remove</Submit>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="lg:sticky lg:top-20 lg:h-fit">
            <CheckoutForm
              key={q.lines.map((v) => v.item.id).join()}
              lines={q.lines.map((v) => ({ id: v.item.id, price: v.price, locality: v.sale.locality, heavy: v.heavy, stayInPlace: v.item.stayInPlace }))}
              credit={q.creditAvailable}
              today={todayIST()}
              latestSlotDate={q.latestSlotDate}
              defaultLocality={locality}
              loggedIn={!!user}
            />
          </div>
        </div>
      )}
    </div>
  );
}
