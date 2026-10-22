import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { KITS, LOCALITIES } from "@/lib/catalog";
import { browse, headlineStats, liveSales } from "@/lib/services/marketplace";
import { ItemCard, SaleCard, SectionTitle } from "@/components/ui";

export default async function Home() {
  const user = await currentUser();
  const stats = headlineStats();
  const sales = liveSales(user, { limit: 6 });
  const ending = browse(user, { sort: "ending" }).slice(0, 8);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="tape absolute -right-16 top-10 hidden h-10 w-96 rotate-12 opacity-80 md:block" aria-hidden />
        <div className="container-page py-10 sm:py-16">
          <p className="chip bg-kraft-soft text-ink">Bengaluru · {stats.liveSaleCount} move-out sales live now</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Leaving the city? Your room is <span className="text-leave">cleared by your date.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            List all 30 things in one Move-Out Sale. Newcomers buy them, partner dealers make instant offers, and whatever&apos;s left is donated or recycled before you go.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link href="/leaving" className="group rounded-3xl bg-leave p-6 text-white shadow-lg shadow-leave/20 transition hover:-translate-y-1">
              <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Door 1</p>
              <p className="mt-1 text-3xl font-extrabold">I&apos;m leaving →</p>
              <p className="mt-2 opacity-90">Snap your room, set your date, get paid the same day you hand over. Nothing left behind.</p>
            </Link>
            <Link href="/arriving" className="group rounded-3xl bg-arrive p-6 text-white shadow-lg shadow-arrive/20 transition hover:-translate-y-1">
              <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Door 2</p>
              <p className="mt-1 text-3xl font-extrabold">I&apos;m arriving →</p>
              <p className="mt-2 opacity-90">Set up your room this week from verified sellers nearby. One cart, one delivery slot.</p>
            </Link>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-4 text-center sm:max-w-xl">
            <div><dt className="text-xs text-ink-soft">Items re-homed</dt><dd className="text-2xl font-bold">{stats.rehomed}</dd></div>
            <div><dt className="text-xs text-ink-soft">Items listed</dt><dd className="text-2xl font-bold">{stats.listed}</dd></div>
            <div><dt className="text-xs text-ink-soft">Launch localities</dt><dd className="text-2xl font-bold">{stats.localities}</dd></div>
          </dl>
        </div>
      </section>

      <section className="container-page py-12">
        <SectionTitle title="Move-out sales near you" sub="Every sale is one person's whole room, on a deadline." action={<Link href="/browse" className="btn-ghost">Browse all items</Link>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sales.map((s) => <SaleCard key={s.id} sale={s} />)}
        </div>
      </section>

      <section className="container-page pb-12">
        <SectionTitle title="Ending soon" sub="Prices drop every week until the seller leaves." action={<Link href="/browse?sort=ending" className="text-sm font-semibold underline">See more</Link>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ending.map((v) => <ItemCard key={v.item.id} view={v} />)}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="container-page grid gap-10 py-12 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-leave">Leaving: clear my room by the 30th</h2>
            <ol className="mt-4 space-y-3">
              {[
                ["Set your leaving date", "Verify with your college, company or co-living code."],
                ["Photo walk-through", "Snap the room. AI writes each listing and suggests a price."],
                ["Share one link", "Your whole sale lives on one page for WhatsApp and LinkedIn."],
                ["Countdown pricing", "Prices drop 10% a week to the floor you set."],
                ["OTP handover, paid same day", "Money is held safely and released when the buyer shares the OTP."],
                ["Nothing left behind", "Five days out, dealers bid on what's left; the rest is donated or recycled."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-leave-soft text-sm font-bold text-leave">{i + 1}</span>
                  <div><p className="font-semibold">{t}</p><p className="text-sm text-ink-soft">{d}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-arrive">Arriving: set up my room this week</h2>
            <ol className="mt-4 space-y-3">
              {[
                ["Tell us your date, area and budget", "We filter to items you can actually get by move-in day."],
                ["Pick a Starter Kit or browse the map", "Bed, mattress, table, chair, fan, assembled from nearby sales."],
                ["One cart, one delivery slot", "Items from several sellers, collected on one trip."],
                ["Inspect, then pay out", "Not as described? Refuse at handover for a full refund."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-arrive-soft text-sm font-bold text-arrive">{i + 1}</span>
                  <div><p className="font-semibold">{t}</p><p className="text-sm text-ink-soft">{d}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-2xl bg-tape/30 p-4">
              <p className="font-semibold">Own it like a rental</p>
              <p className="mt-1 text-sm text-ink-soft">
                Buy a certified ₹6,000 bed with a guaranteed ₹3,000 buy-back within 12 months. That&apos;s ₹250 a month, cheaper than renting, and it&apos;s yours.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <SectionTitle title="Starter Kits" sub="One-click bundles assembled from sales near you." action={<Link href="/kits" className="btn-arrive">Build my kit</Link>} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KITS.map((k) => (
            <Link key={k.slug} href={`/kits#${k.slug}`} className="card p-4 transition hover:shadow-md">
              <p className="font-semibold">{k.name}</p>
              <p className="text-xs text-ink-soft">{k.audience}</p>
              <p className="mt-2 text-sm">{k.slots.map((s) => s.label).join(" · ")}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-page pb-4">
        <SectionTitle title="Browse by area" />
        <div className="flex flex-wrap gap-2">
          {LOCALITIES.map((l) => (
            <Link key={l.slug} href={`/area/${l.slug}`} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium hover:border-ink">
              Used furniture in {l.name}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
