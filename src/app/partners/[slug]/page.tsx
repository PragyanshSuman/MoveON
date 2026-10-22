import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { localityName } from "@/lib/catalog";
import { liveSales, partnerBySlug } from "@/lib/services/marketplace";
import { EmptyState, SaleCard } from "@/components/ui";

export default async function PartnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = partnerBySlug(slug);
  if (!data) notFound();
  const { partner, members } = data;
  const user = await currentUser();
  const isMember = !!user?.badges.some((b) => b.partnerId === partner.id);
  const sales = liveSales(user, { partnerId: partner.id });
  const how = partner.type === "coliving" ? "your resident code from the property manager" : partner.type === "college" ? `your @${partner.emailDomains[0]} college email` : `your @${partner.emailDomains[0]} work email`;

  return (
    <div className="container-page py-8">
      <p className="chip bg-arrive-soft capitalize text-arrive">{partner.type === "coliving" ? "Co-living partner" : `${partner.type} partner`}</p>
      <h1 className="mt-2 text-3xl font-extrabold">{partner.name}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{partner.description}</p>
      <p className="mt-2 text-sm">{members} verified members · {partner.localities.map(localityName).join(", ")}</p>
      <div className="mt-4">
        {isMember ? (
          <p className="chip bg-ok/10 text-ok">✓ You&apos;re a verified member</p>
        ) : (
          <Link href={user ? "/verify" : `/login?next=/verify`} className="btn-arrive">Verify with {how}</Link>
        )}
      </div>
      <section className="mt-10">
        <h2 className="mb-3 text-xl font-bold">Members&apos; move-out sales</h2>
        {sales.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sales.map((s) => <SaleCard key={s.id} sale={s} />)}</div>
        ) : (
          <EmptyState title="No live member sales right now" />
        )}
      </section>
    </div>
  );
}
