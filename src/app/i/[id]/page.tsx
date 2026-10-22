import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { category, conditionLabel, localityName } from "@/lib/catalog";
import { formatDate, inr, leavingLabel } from "@/lib/format";
import { buyerFee, FEES, quoteDelivery, roundTo, todayIST } from "@/lib/pricing";
import { itemById } from "@/lib/services/marketplace";
import { AddToCart } from "@/components/add-to-cart";
import { BarList } from "@/components/bar-list";
import { Gallery } from "@/components/gallery";
import { Badges, EmptyState, ItemCard, Stars } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = itemById(id, null);
  if (!data || !data.visible) return { title: "Item" };
  const { item, sale, price } = data.view;
  return {
    title: `${item.title}, ${inr(price)} in ${localityName(sale.locality)}`,
    description: `${conditionLabel(item.condition)} ${category(item.category).label.toLowerCase()} from a move-out sale in ${localityName(sale.locality)}. ${item.description}`.slice(0, 160),
    openGraph: { images: item.photos[0]?.startsWith("/api/uploads/") ? [item.photos[0]] : undefined },
  };
}

export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  const [user, cart] = await Promise.all([currentUser(), getCart()]);
  const data = itemById(id, user);
  if (!data) notFound();
  if (!data.visible) {
    return (
      <div className="container-page py-10">
        <EmptyState title="This item is in a members-only sale">
          <Link href={user ? "/verify" : `/login?next=/i/${id}`} className="underline">{user ? "Verify your community" : "Log in"}</Link> to see it.
        </EmptyState>
      </div>
    );
  }
  const { view, schedule, similar, reviews } = data;
  const { item, sale, seller, price, nextDrop, daysLeft, heavy, rating } = view;
  const cat = category(item.category);
  const isOwner = user?.id === item.sellerId;
  const available = item.status === "available";
  const home = user?.arrival?.locality ?? sale.locality;
  const delivery = item.stayInPlace ? null : quoteDelivery([{ locality: sale.locality, heavy }], home);
  const fee = buyerFee(price);
  const buyBack = item.certified && cat.buyBackEligible ? roundTo(price * FEES.buyBackRatio, 50) : 0;
  const today = todayIST();
  const productLd = {
    "@context": "https://schema.org", "@type": "Product", name: item.title, image: item.photos, description: item.description,
    brand: item.brand ? { "@type": "Brand", name: item.brand } : undefined,
    offers: { "@type": "Offer", priceCurrency: "INR", price, availability: available ? "https://schema.org/InStock" : "https://schema.org/SoldOut", itemCondition: "https://schema.org/UsedCondition", priceValidUntil: nextDrop?.date ?? sale.leavingDate },
  };

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-4 text-sm text-ink-soft">
        <Link href="/browse" className="hover:underline">Browse</Link> / <Link href={`/area/${sale.locality}`} className="hover:underline">{localityName(sale.locality)}</Link> /{" "}
        <Link href={`/s/${sale.slug}`} className="hover:underline">{sale.title}</Link>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Gallery photos={item.photos} alt={item.title} />
          <section className="card mt-6 p-5">
            <h2 className="font-bold">Item passport</h2>
            <p className="text-xs text-ink-soft">Photos, age and history travel with this item to its next owner.</p>
            <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
              {item.passport.map((p, n) => (
                <li key={n} className="text-sm">
                  <span className="font-semibold capitalize">{p.event.replace("_", " ")}</span> · {formatDate(p.at, { day: "numeric", month: "short", year: "numeric" })}
                  <p className="text-ink-soft">{p.note}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <span className="chip bg-kraft-soft">{cat.icon} {cat.label}</span>
            <span className="chip bg-kraft-soft">{conditionLabel(item.condition)}</span>
            {item.stayInPlace && <span className="chip bg-arrive-soft text-arrive">Stay-in-place</span>}
            {item.aiGenerated && <span className="chip bg-kraft-soft">AI-assisted listing</span>}
          </div>
          <h1 className="mt-2 text-3xl font-bold">{item.title}</h1>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-4xl font-extrabold">{inr(available ? price : item.soldPrice ?? price)}</span>
            {price < item.listPrice && available && <span className="text-lg text-ink-soft line-through">{inr(item.listPrice)}</span>}
          </div>
          {available && nextDrop && <p className="mt-1 text-sm font-medium text-leave">Drops to {inr(nextDrop.price)} on {formatDate(nextDrop.date)}. Or grab it now before someone else does.</p>}
          {available && !nextDrop && price === item.floorPrice && <p className="mt-1 text-sm text-ink-soft">This is the lowest price the seller will accept.</p>}

          <div className="mt-5">
            {isOwner ? (
              <Link href={`/sell/item/${item.id}`} className="btn-primary w-full">Edit this listing</Link>
            ) : available ? (
              <AddToCart itemIds={[item.id]} inCart={cart.includes(item.id)} />
            ) : (
              <p className="rounded-xl bg-kraft-soft p-3 text-center font-semibold">{item.status === "reserved" ? "Reserved by another buyer" : "No longer available"}</p>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="card p-3"><dt className="text-xs text-ink-soft">Age</dt><dd className="font-semibold">{item.ageMonths < 12 ? `${item.ageMonths} months` : `${Math.round((item.ageMonths / 12) * 10) / 10} years`}</dd></div>
            <div className="card p-3"><dt className="text-xs text-ink-soft">Brand</dt><dd className="font-semibold">{item.brand ?? "Unbranded"}</dd></div>
            <div className="card p-3"><dt className="text-xs text-ink-soft">Handover window</dt><dd className="font-semibold">{formatDate(item.availableFrom > today ? item.availableFrom : today)} – {formatDate(sale.leavingDate)}</dd></div>
            <div className="card p-3"><dt className="text-xs text-ink-soft">Seller</dt><dd className={`font-semibold ${daysLeft <= 5 ? "text-leave" : ""}`}>{leavingLabel(daysLeft)}</dd></div>
          </dl>
          {item.availableFrom > today && <p className="mt-2 text-xs text-ink-soft">The seller is using this until {formatDate(item.availableFrom)}; book delivery from that date.</p>}
          {item.description && <p className="mt-5 whitespace-pre-line">{item.description}</p>}

          {buyBack > 0 && available && (
            <div className="mt-5 rounded-2xl bg-tape/30 p-4">
              <p className="font-semibold">Buy-back guarantee: {inr(buyBack)}</p>
              <p className="mt-1 text-sm text-ink-soft">
                Sell it back to MoveOn&apos;s network any time within {FEES.buyBackWindowMonths} months for {inr(buyBack)}. Effective cost: {inr((price - buyBack) / 12)}/month, cheaper than renting.
              </p>
            </div>
          )}

          <section className="card mt-5 p-4 text-sm">
            <h2 className="font-semibold">What you&apos;ll pay</h2>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between"><dt>Item</dt><dd>{inr(price)}</dd></div>
              <div className="flex justify-between"><dt>Buyer protection (4%, ₹29–199 per order)</dt><dd>{inr(fee)}</dd></div>
              <div className="flex justify-between">
                <dt>{item.stayInPlace ? "Delivery (stays where it is)" : `Delivery to ${localityName(home)} by ${delivery!.vehicle === "mini_truck" ? "mini-truck + 2 helpers" : "two-wheeler"}`}</dt>
                <dd>{item.stayInPlace ? inr(0) : `${inr(delivery!.price)} or free self-pickup`}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-soft">Your payment is held until you inspect the item and share the handover OTP. Not as described? Refuse it for a full refund.</p>
          </section>

          {schedule.length > 1 && (
            <section className="card mt-5 p-4">
              <h2 className="text-sm font-semibold">Countdown price schedule</h2>
              <div className="mt-3">
                <BarList
                  caption="Countdown price schedule"
                  tone="bg-leave"
                  rows={schedule.map((s) => ({
                    label: `${formatDate(s.date)}${s.price === price && available ? " · now" : ""}`,
                    value: s.price,
                    display: inr(s.price),
                    emphasis: s.price === price && available,
                  }))}
                />
              </div>
            </section>
          )}

          <section className="card mt-5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{seller.name}</p>
                <Stars value={rating.avg} count={rating.count} />
              </div>
              <Link href={`/s/${sale.slug}`} className="btn-ghost">See whole sale →</Link>
            </div>
            <div className="mt-2"><Badges badges={seller.badges} /></div>
            {reviews.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
                {reviews.map((r) => <li key={r.id}><span className="text-tape">{"★".repeat(r.stars)}</span> {r.comment} <span className="text-xs text-ink-soft">· {r.from}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-xl font-bold">Similar items nearby</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{similar.map((v) => <ItemCard key={v.item.id} view={v} />)}</div>
        </section>
      )}
    </div>
  );
}
