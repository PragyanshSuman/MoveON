import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { CATEGORIES, CONDITIONS } from "@/lib/catalog";
import { read } from "@/lib/db";
import { inr } from "@/lib/format";
import { countdownPrice, todayIST } from "@/lib/pricing";
import { updateItemAction, withdrawItemAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

export const metadata = { title: "Edit item" };

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/sell/item/${id}`);
  const db = read();
  const item = db.items.find((i) => i.id === id);
  if (!item || item.sellerId !== user.id) notFound();
  const sale = db.sales.find((s) => s.id === item.saleId)!;
  const current = countdownPrice(item, sale.dropRatePerWeek);
  const editable = item.status === "available";

  return (
    <div className="container-page max-w-2xl py-8">
      <Link href={`/i/${item.id}`} className="text-sm underline">← Back to listing</Link>
      <h1 className="mt-2 text-3xl font-bold">Edit “{item.title}”</h1>
      <p className="mt-1 text-sm text-ink-soft">Current countdown price {inr(current)}. Changing either price restarts the countdown from the new starting price.</p>
      {!editable && <p className="mt-4 rounded-xl bg-kraft-soft p-3 text-sm">This item is {item.status}; it can&apos;t be edited.</p>}
      {editable && (
        <ActionForm action={updateItemAction} className="card mt-6 grid gap-4 p-5 sm:grid-cols-2">
          <input type="hidden" name="itemId" value={item.id} />
          <div className="sm:col-span-2"><label className="label" htmlFor="title">Title</label><input id="title" name="title" defaultValue={item.title} required maxLength={80} className="input" /></div>
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={item.category} className="input">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
          <div><label className="label" htmlFor="brand">Brand</label><input id="brand" name="brand" defaultValue={item.brand} className="input" /></div>
          <div>
            <label className="label" htmlFor="condition">Condition</label>
            <select id="condition" name="condition" defaultValue={item.condition} className="input">{CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
          <div><label className="label" htmlFor="ageMonths">Age (months)</label><input id="ageMonths" type="number" name="ageMonths" min={0} max={240} defaultValue={item.ageMonths} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="description">Description</label><textarea id="description" name="description" rows={3} defaultValue={item.description} className="input" /></div>
          <div><label className="label" htmlFor="listPrice">Starting price ₹</label><input id="listPrice" type="number" name="listPrice" min={50} defaultValue={item.listPrice} className="input" /></div>
          <div><label className="label" htmlFor="floorPrice">Lowest price ₹</label><input id="floorPrice" type="number" name="floorPrice" min={50} defaultValue={item.floorPrice} className="input" /></div>
          <div><label className="label" htmlFor="availableFrom">Available from</label><input id="availableFrom" type="date" name="availableFrom" min={todayIST()} max={sale.leavingDate} defaultValue={item.availableFrom < todayIST() ? todayIST() : item.availableFrom} className="input" /></div>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="stayInPlace" defaultChecked={item.stayInPlace} /> Stay-in-place handover</label>
          <div className="sm:col-span-2"><Submit pendingText="Saving…">Save changes</Submit></div>
        </ActionForm>
      )}
      {(editable || item.status === "withdrawn") && (
        <ActionForm action={withdrawItemAction} className="mt-4">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="withdraw" value={editable ? "1" : "0"} />
          {editable ? (
            <Submit className="btn-danger" confirm="Take this item off sale?" pendingText="…">Withdraw from sale</Submit>
          ) : (
            <Submit className="btn-ghost" pendingText="…">Put back on sale</Submit>
          )}
        </ActionForm>
      )}
    </div>
  );
}
