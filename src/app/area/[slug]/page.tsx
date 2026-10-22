import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { category, locality, LOCALITIES } from "@/lib/catalog";
import { inr } from "@/lib/format";
import { distanceKm } from "@/lib/pricing";
import { liveSales, localityStats } from "@/lib/services/marketplace";
import { EmptyState, ItemCard, SaleCard, SectionTitle } from "@/components/ui";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = locality(slug);
  if (!l) return {};
  return {
    title: `Used furniture & appliances in ${l.name}`,
    description: `Buy a used bed, mattress, fridge or washing machine in ${l.name}, Bengaluru, from verified people moving out. Held payments and OTP handover.`,
    alternates: { canonical: `/area/${slug}` },
  };
}

export default async function AreaPage({ params }: Props) {
  const { slug } = await params;
  const l = locality(slug);
  if (!l) notFound();
  const user = await currentUser();
  const stats = localityStats(slug, user);
  const sales = liveSales(user, { locality: slug });
  const nearby = LOCALITIES.filter((x) => x.slug !== slug).sort((a, b) => distanceKm(slug, a.slug) - distanceKm(slug, b.slug)).slice(0, 4);
  const cheapestPrice = stats.cheapest[0]?.price;
  const faq = [
    { q: `How do I buy a used bed in ${l.name}?`, a: `Browse move-out sales in ${l.name}, add the bed to your cart and pick self-pickup or a delivery slot. You pay MoveOn, and the seller only gets the money after you inspect the bed and share your handover OTP.` },
    { q: "What if the item isn't as described?", a: "Refuse it at handover and you get a full refund, including the protection fee and delivery." },
    { q: "Is it cheaper than renting?", a: "Usually. Certified items come with a buy-back guarantee: buy a ₹6,000 bed, sell it back for ₹3,000 within a year. That's ₹250 a month." },
  ];

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }).replace(/</g, "\\u003c") }} />
      <p className="chip bg-kraft-soft">Bengaluru · {l.name}</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Used furniture & appliances in {l.name}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{l.blurb}</p>
      <dl className="mt-6 grid max-w-2xl grid-cols-3 gap-3">
        <div className="card p-3"><dt className="text-xs text-ink-soft">Live items</dt><dd className="text-2xl font-bold">{stats.liveCount}</dd></div>
        <div className="card p-3"><dt className="text-xs text-ink-soft">Re-homed here</dt><dd className="text-2xl font-bold">{stats.rehomed}</dd></div>
        <div className="card p-3"><dt className="text-xs text-ink-soft">Avg. days to sell</dt><dd className="text-2xl font-bold">{stats.avgDaysToSale ?? "–"}</dd></div>
      </dl>
      {stats.topCategories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {stats.topCategories.map(([c, n]) => (
            <Link key={c} href={`/browse?locality=${slug}&category=${c}`} className="rounded-full border border-line bg-white px-3 py-1 text-sm hover:border-ink">
              {category(c).icon} {category(c).label} ({n})
            </Link>
          ))}
        </div>
      )}

      <section className="mt-10">
        <SectionTitle title={`Move-out sales in ${l.name}`} action={<Link href={`/browse?locality=${slug}&view=map`} className="btn-ghost">Map view</Link>} />
        {sales.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sales.map((s) => <SaleCard key={s.id} sale={s} />)}</div>
        ) : (
          <EmptyState title={`No live sales in ${l.name} right now`}>Leaving soon? <Link href="/leaving" className="underline">Start the first one</Link>.</EmptyState>
        )}
      </section>

      {stats.cheapest.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Best deals" sub={cheapestPrice ? `Starting at ${inr(cheapestPrice)}` : undefined} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{stats.cheapest.map((v) => <ItemCard key={v.item.id} view={v} />)}</div>
        </section>
      )}

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold">Questions</h2>
          <dl className="mt-3 space-y-4">
            {faq.map((f) => <div key={f.q}><dt className="font-semibold">{f.q}</dt><dd className="text-sm text-ink-soft">{f.a}</dd></div>)}
          </dl>
        </div>
        <div>
          <h2 className="text-xl font-bold">Nearby areas</h2>
          <ul className="mt-3 space-y-2">
            {nearby.map((n) => <li key={n.slug}><Link href={`/area/${n.slug}`} className="underline">{n.name}</Link> <span className="text-sm text-ink-soft">· ~{Math.round(distanceKm(slug, n.slug))} km</span></li>)}
          </ul>
          <Link href={`/kits?locality=${slug}`} className="btn-arrive mt-4">Starter Kits for {l.name}</Link>
        </div>
      </section>
    </div>
  );
}
