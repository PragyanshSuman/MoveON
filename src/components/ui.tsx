import Link from "next/link";
import type { ReactNode } from "react";
import { category, conditionLabel, localityName } from "@/lib/catalog";
import { formatDate, inr, leavingLabel } from "@/lib/format";
import type { ItemView } from "@/lib/services/common";
import type { SaleSummary } from "@/lib/services/marketplace";
import type { Badge, ItemStatus } from "@/lib/types";

const BADGE_ICON: Record<Badge["type"], string> = { college: "🎓", company: "💼", coliving: "🏠" };

export function Badges({ badges, compact }: { badges: Badge[]; compact?: boolean }) {
  if (!badges.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={`${b.type}-${b.label}`} className="chip bg-arrive-soft text-arrive" title={`Verified ${b.type}: ${b.label}`}>
          {BADGE_ICON[b.type]} {compact ? "Verified" : b.label}
        </span>
      ))}
    </span>
  );
}

const STATUS_LABEL: Partial<Record<ItemStatus, string>> = {
  reserved: "Reserved", sold: "Sold", dealer: "Sold to dealer", donated: "Donated", recycled: "Recycled", withdrawn: "Withdrawn",
};

export function ItemCard({ view }: { view: ItemView }) {
  const { item, sale, price } = view;
  const dropped = price < item.listPrice;
  const status = STATUS_LABEL[item.status];
  return (
    <Link href={`/i/${item.id}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-kraft-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.photos[0]} alt={item.title} loading="lazy" className={`h-full w-full object-cover transition group-hover:scale-[1.03] ${status ? "opacity-50 grayscale" : ""}`} />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {status && <span className="chip bg-ink text-white">{status}</span>}
          {!status && view.daysLeft <= 5 && <span className="chip bg-leave text-white">{leavingLabel(view.daysLeft)}</span>}
          {item.stayInPlace && !status && <span className="chip bg-white/90 text-ink">Stay-in-place</span>}
          {item.certified && <span className="chip bg-tape text-ink">Buy-back</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
        <p className="text-xs text-ink-soft">{conditionLabel(item.condition)} · {localityName(sale.locality)}</p>
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-lg font-bold">{inr(item.soldPrice && status ? item.soldPrice : price)}</span>
          {dropped && !status && <span className="text-xs text-ink-soft line-through">{inr(item.listPrice)}</span>}
        </div>
        {!status && view.nextDrop && (
          <p className="text-[11px] text-leave">Drops to {inr(view.nextDrop.price)} on {formatDate(view.nextDrop.date)}</p>
        )}
      </div>
    </Link>
  );
}

export function SaleCard({ sale }: { sale: SaleSummary }) {
  return (
    <Link href={`/s/${sale.slug}`} className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="grid h-36 grid-cols-4 gap-0.5 bg-kraft-soft">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className={n === 0 ? "col-span-2 row-span-2" : n === 1 ? "col-span-2" : ""}>
            {sale.cover[n] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sale.cover[n]} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </div>
        ))}
      </div>
      <div className="p-3">
        <div className="mb-1 flex flex-wrap items-center gap-1">
          {sale.boosted && <span className="chip bg-tape text-ink">★ Featured</span>}
          {sale.urgent && <span className="chip bg-leave text-white">Urgent</span>}
          {sale.community && <span className="chip bg-ink text-white">Members only</span>}
          <span className={`chip ${sale.daysLeft <= 5 ? "bg-leave-soft text-leave" : "bg-kraft-soft text-ink"}`}>{leavingLabel(sale.daysLeft)}</span>
        </div>
        <p className="font-semibold leading-snug">{sale.title}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {sale.seller.name} · {localityName(sale.locality)} · {sale.available} of {sale.total} left · from {inr(sale.fromPrice)}
        </p>
        <div className="mt-1"><Badges badges={sale.seller.badges} compact /></div>
      </div>
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card border-dashed p-8 text-center">
      <p className="text-3xl" aria-hidden>📦</p>
      <p className="mt-2 font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {sub && <p className="text-sm text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function CategoryIcon({ id }: { id: string }) {
  return <span aria-hidden>{category(id).icon}</span>;
}

export function Stars({ value, count }: { value: number; count?: number }) {
  if (!count) return <span className="text-xs text-ink-soft">No ratings yet</span>;
  return (
    <span className="text-xs text-ink-soft">
      <span className="text-tape">{"★".repeat(Math.round(value))}</span>
      <span className="text-line">{"★".repeat(5 - Math.round(value))}</span> {value.toFixed(1)} ({count})
    </span>
  );
}

export function LeavingDate({ date }: { date: string }) {
  return <>{formatDate(date, { weekday: "short", day: "numeric", month: "short" })}</>;
}
