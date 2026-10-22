import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { localityName } from "@/lib/catalog";
import { formatDate, inr, leavingLabel } from "@/lib/format";
import { absoluteUrl } from "@/lib/notify";
import { saleBySlug } from "@/lib/services/marketplace";
import { AddToCart } from "@/components/add-to-cart";
import { Countdown } from "@/components/countdown";
import { ShareButtons } from "@/components/share-buttons";
import { Badges, EmptyState, ItemCard, Stars } from "@/components/ui";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = saleBySlug(slug, null);
  if (!data) return { title: "Sale not found" };
  const { sale, seller } = data;
  const available = data.items.filter((v) => v.item.status === "available");
  const from = available.length ? ` from ${inr(Math.min(...available.map((v) => v.price)))}` : "";
  return {
    title: `${sale.title} · leaving ${formatDate(sale.leavingDate, { day: "numeric", month: "long" })}`,
    description: `${seller.name} is leaving ${localityName(sale.locality)} on ${formatDate(sale.leavingDate, { day: "numeric", month: "long" })}. ${available.length} items${from}. Verified handover, held payment.`,
  };
}

export default async function SalePage({ params }: Props) {
  const { slug } = await params;
  const [user, cart] = await Promise.all([currentUser(), getCart()]);
  const data = saleBySlug(slug, user);
  if (!data) notFound();
  const { sale, seller, items, visible, partner, rating, live, isOwner } = data;
  const available = items.filter((v) => v.item.status === "available");
  const gone = items.filter((v) => v.item.status !== "available");
  const daysLeft = items[0]?.daysLeft ?? Math.floor((Date.parse(`${sale.leavingDate}T00:00:00Z`) - Date.now()) / 86_400_000);
  const shareText = `I'm leaving ${localityName(sale.locality)} on ${formatDate(sale.leavingDate, { day: "numeric", month: "long" })}: everything must go! ${available.length} items on MoveOn.`;

  return (
    <div className="container-page py-8">
      {isOwner && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink p-4 text-white">
          <p className="text-sm">This is your sale page. Share it in your PG, office and college groups.</p>
          <div className="flex gap-2">
            <Link href={`/sell/${sale.id}/add`} className="btn bg-white text-ink">+ Add items</Link>
            <Link href="/dashboard?tab=selling" className="btn border border-white/30">Manage</Link>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-line bg-white">
        <div className="tape h-3" aria-hidden />
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="chip bg-leave-soft text-leave">Move-Out Sale</span>
              {sale.visibility === "community" && <span className="chip bg-ink text-white">{partner?.name} members only</span>}
              {sale.urgent && live && <span className="chip bg-leave text-white">Urgent</span>}
            </div>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{sale.title}</h1>
            <p className="mt-2 text-ink-soft">
              {seller.name} is leaving <strong className="text-ink">{localityName(sale.locality)}</strong> on{" "}
              <strong className="text-ink">{formatDate(sale.leavingDate, { weekday: "long", day: "numeric", month: "long" })}</strong>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Badges badges={seller.badges} />
              <Stars value={rating.avg} count={rating.count} />
            </div>
            {sale.note && <p className="mt-4 max-w-2xl whitespace-pre-line rounded-xl bg-kraft-soft/60 p-3 text-sm">{sale.note}</p>}
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className={`rounded-2xl px-5 py-3 text-center ${daysLeft <= 5 ? "bg-leave text-white" : "bg-ink text-white"}`}>
              <p className="text-xs uppercase tracking-wider opacity-80">{live ? leavingLabel(daysLeft) : "Sale ended"}</p>
              {live && <Countdown leavingDate={sale.leavingDate} className="text-2xl font-bold" />}
            </div>
            <p className="text-sm text-ink-soft">{available.length} of {items.length} items still available</p>
            {sale.dropRatePerWeek > 0 && live && <p className="text-xs text-leave">Prices drop {Math.round(sale.dropRatePerWeek * 100)}% every week</p>}
          </div>
        </div>
        {visible && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/60 px-6 py-4">
            <ShareButtons url={absoluteUrl(`/s/${sale.slug}`)} text={shareText} />
            {live && available.length > 1 && !isOwner && (
              <div className="w-full sm:w-auto">
                <AddToCart itemIds={available.map((v) => v.item.id)} label={`Buy the whole room · ${inr(available.reduce((a, v) => a + v.price, 0))}`} className="btn-arrive w-full" inCart={available.every((v) => cart.includes(v.item.id))} />
              </div>
            )}
          </div>
        )}
      </section>

      {!visible ? (
        <div className="mt-8">
          <EmptyState title={`This sale is only for verified ${partner?.name ?? "community"} members`}>
            {user ? <Link href="/verify" className="underline">Verify your membership</Link> : <Link href={`/login?next=/s/${sale.slug}`} className="underline">Log in</Link>} to see the items.
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="mb-3 text-xl font-bold">Available ({available.length})</h2>
            {available.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {available.map((v) => <ItemCard key={v.item.id} view={v} />)}
              </div>
            ) : (
              <EmptyState title="Everything has found a new home">Browse <Link href="/browse" className="underline">other sales nearby</Link>.</EmptyState>
            )}
          </section>
          {gone.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-xl font-bold text-ink-soft">Already re-homed ({gone.length})</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {gone.map((v) => <ItemCard key={v.item.id} view={v} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
