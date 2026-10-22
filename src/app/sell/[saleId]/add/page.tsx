import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai";
import { read } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/pricing";
import { PhotoWalkthrough } from "@/components/photo-walkthrough";

export const metadata = { title: "Add items" };

export default async function AddItems({ params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/sell/${saleId}/add`);
  const sale = read().sales.find((s) => s.id === saleId);
  if (!sale || sale.sellerId !== user.id) notFound();
  const count = read().items.filter((i) => i.saleId === sale.id).length;
  return (
    <div className="container-page max-w-4xl py-8">
      <p className="text-sm text-ink-soft"><Link href={`/s/${sale.slug}`} className="underline">{sale.title}</Link> · leaving {formatDate(sale.leavingDate)} · {count} items listed</p>
      <h1 className="mt-1 text-3xl font-bold">Photo walk-through</h1>
      <div className="mt-6">
        <PhotoWalkthrough saleId={sale.id} today={todayIST()} leavingDate={sale.leavingDate} aiEnabled={aiAvailable()} />
      </div>
    </div>
  );
}
