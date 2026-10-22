import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { CATEGORIES, locality, LOCALITIES } from "@/lib/catalog";
import { inr, leavingLabel } from "@/lib/format";
import { browse, liveSales, type BrowseFilters } from "@/lib/services/marketplace";
import { EmptyState, ItemCard } from "@/components/ui";
import { SalesMap } from "@/components/map-loader";
import type { MapPin } from "@/components/map-view";

export const metadata = { title: "Browse move-out sales", description: "Second-hand furniture and appliances from people leaving Bengaluru, available by your move-in date." };

type Search = Record<string, string | undefined>;

/** Deterministic offset so several sales in one locality don't stack on the same point. */
function jitter(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return [((h & 0xff) / 255 - 0.5) * 0.018, (((h >> 8) & 0xff) / 255 - 0.5) * 0.018];
}

export default async function Browse({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const filters: BrowseFilters = {
    q: sp.q, locality: sp.locality || undefined, category: sp.category || undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined, availableBy: sp.availableBy || undefined,
    verifiedOnly: sp.verified === "1", stayInPlace: sp.stay === "1", sort: (sp.sort as BrowseFilters["sort"]) || undefined,
  };
  const results = browse(user, filters);
  const view = sp.view === "map" ? "map" : "list";
  const viewHref = (v: string) => `/browse?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, x]) => x) as [string, string][]), view: v })}`;

  const pins: MapPin[] = view === "map"
    ? liveSales(user, { locality: filters.locality }).flatMap((s) => {
        const loc = locality(s.locality);
        if (!loc) return [];
        const [dl, dg] = jitter(s.id);
        return [{
          id: s.id, lat: loc.lat + dl, lng: loc.lng + dg, label: `${s.available} items · from ${inr(s.fromPrice)}`,
          title: s.title, subtitle: `${loc.name} · ${leavingLabel(s.daysLeft)}`, href: `/s/${s.slug}`, urgent: s.daysLeft <= 5,
        }];
      })
    : [];
  const center = filters.locality && locality(filters.locality) ? [locality(filters.locality)!.lat, locality(filters.locality)!.lng] as [number, number] : [12.95, 77.64] as [number, number];

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Browse move-out sales</h1>
          <p className="text-sm text-ink-soft">{results.length} items available{filters.locality ? ` in ${locality(filters.locality)?.name}` : " across Bengaluru"}</p>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1 text-sm font-semibold">
          <Link href={viewHref("list")} className={`rounded-lg px-3 py-1.5 ${view === "list" ? "bg-ink text-white" : ""}`}>List</Link>
          <Link href={viewHref("map")} className={`rounded-lg px-3 py-1.5 ${view === "map" ? "bg-ink text-white" : ""}`}>Map</Link>
        </div>
      </div>

      <form className="card mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <input type="hidden" name="view" value={view} />
        <div className="lg:col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="mattress, fridge, IKEA…" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="locality">Area</label>
          <select id="locality" name="locality" defaultValue={sp.locality ?? ""} className="input">
            <option value="">All areas</option>
            {LOCALITIES.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
            <option value="">Everything</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="availableBy">Available by</label>
          <input id="availableBy" type="date" name="availableBy" defaultValue={sp.availableBy} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="maxPrice">Max price (₹)</label>
          <input id="maxPrice" type="number" name="maxPrice" min={0} step={100} defaultValue={sp.maxPrice} className="input" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2"><input type="checkbox" name="verified" value="1" defaultChecked={sp.verified === "1"} /> Verified sellers only</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="stay" value="1" defaultChecked={sp.stay === "1"} /> Stay-in-place (no moving)</label>
          <select name="sort" defaultValue={sp.sort ?? ""} className="input w-auto" aria-label="Sort">
            <option value="">Sort: ending soon</option>
            <option value="nearest">Nearest to area</option>
            <option value="price">Lowest price</option>
            <option value="new">Newest</option>
          </select>
        </div>
        <div className="flex gap-2 lg:col-span-2 lg:justify-end">
          <Link href={`/browse?view=${view}`} className="btn-ghost">Reset</Link>
          <button className="btn-primary">Apply filters</button>
        </div>
      </form>

      <div className="mt-6">
        {view === "map" ? (
          <SalesMap pins={pins} center={center} />
        ) : results.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((v) => <ItemCard key={v.item.id} view={v} />)}
          </div>
        ) : (
          <EmptyState title="Nothing matches yet">
            Try a nearby area or a later date. <Link href="/arriving" className="underline">Set a move-in alert</Link> and we&apos;ll WhatsApp you when it&apos;s listed.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
