import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { LOCALITIES } from "@/lib/catalog";
import { localityStats } from "@/lib/services/marketplace";

export const metadata = { title: "Areas", description: "Used furniture and appliances from move-out sales in HSR Layout, Koramangala, Bellandur, Marathahalli, Whitefield and more." };

export default async function Areas() {
  const user = await currentUser();
  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold">Move-out sales by area</h1>
      <p className="mt-1 text-ink-soft">We launch deep in a few dense renter neighbourhoods, so there&apos;s always a sale within a short ride.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LOCALITIES.map((l) => {
          const s = localityStats(l.slug, user);
          return (
            <Link key={l.slug} href={`/area/${l.slug}`} className="card p-5 transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{l.name}</h2>
                {l.beachhead && <span className="chip bg-tape text-ink">Launch area</span>}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{l.blurb}</p>
              <p className="mt-3 text-sm font-semibold">{s.liveCount} items live · {s.rehomed} re-homed</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
