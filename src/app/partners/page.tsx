import Link from "next/link";
import { partners } from "@/lib/services/marketplace";
import { localityName } from "@/lib/catalog";

export const metadata = { title: "Communities & partners", description: "Co-living operators, colleges and companies that give their members a verified, free move-out desk on MoveOn." };

const TYPE_LABEL = { coliving: "Co-living", college: "College", company: "Company" } as const;

export default function Partners() {
  const list = partners();
  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold">Verified communities</h1>
      <p className="mt-1 max-w-2xl text-ink-soft">Members verify with a college or work email, or a co-living resident code. Badges make buyers and sellers feel safe, and private sales stay inside the community.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Link key={p.id} href={`/partners/${p.slug}`} className="card p-5 transition hover:shadow-md">
            <span className="chip bg-arrive-soft text-arrive">{TYPE_LABEL[p.type]}</span>
            <h2 className="mt-2 text-lg font-bold">{p.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">{p.description}</p>
            <p className="mt-2 text-xs text-ink-soft">{p.localities.map(localityName).join(" · ")}</p>
          </Link>
        ))}
      </div>
      <section className="mt-12 rounded-3xl bg-ink p-8 text-white">
        <h2 className="text-2xl font-bold">Run a co-living, campus or HR team?</h2>
        <p className="mt-2 max-w-2xl opacity-80">
          Get a free move-out desk: leaving residents list in one tap, rooms turn around faster, and new joiners get Starter Kits on day one. Paid plans add a B2B dashboard and bulk pickups.
        </p>
        <a href="mailto:partners@moveon.example" className="btn mt-4 bg-tape text-ink">Talk to partnerships</a>
      </section>
    </div>
  );
}
