"use client";
import { useActionState, useMemo, useState } from "react";
import { placeOrder, type ActionState } from "@/app/actions";
import { LOCALITIES } from "@/lib/catalog";
import { addDays, buyerFee, inr, quoteDelivery } from "@/lib/pricing";
import { Submit } from "./action-form";

export interface CheckoutLine {
  id: string;
  price: number;
  locality: string;
  heavy: boolean;
  stayInPlace: boolean;
}

const WINDOWS = ["9 am – 12 pm", "12 – 3 pm", "3 – 6 pm", "6 – 9 pm"];

export function CheckoutForm({ lines, credit, today, latestSlotDate, defaultLocality, loggedIn }: {
  lines: CheckoutLine[]; credit: number; today: string; latestSlotDate: string; defaultLocality: string; loggedIn: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(placeOrder, null);
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">(lines.some((l) => l.heavy && !l.stayInPlace) ? "delivery" : "pickup");
  const [locality, setLocality] = useState(defaultLocality);
  const [useCredit, setUseCredit] = useState(true);

  const q = useMemo(() => {
    const itemsTotal = lines.reduce((a, l) => a + l.price, 0);
    const fee = buyerFee(itemsTotal);
    const moving = lines.filter((l) => !l.stayInPlace);
    const delivery = fulfilment === "delivery" ? quoteDelivery(moving.map((l) => ({ locality: l.locality, heavy: l.heavy })), locality) : null;
    const deliveryPrice = delivery?.price ?? 0;
    const creditApplied = useCredit ? Math.min(credit, fee + deliveryPrice) : 0;
    return { itemsTotal, fee, delivery, deliveryPrice, creditApplied, total: itemsTotal + fee + deliveryPrice - creditApplied };
  }, [lines, fulfilment, locality, useCredit, credit]);

  const firstSlot = today;
  const slotOk = latestSlotDate >= firstSlot;

  return (
    <form action={action} className="card space-y-4 p-5">
      <h2 className="text-lg font-bold">Checkout</h2>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="label">How do you want it?</legend>
        {(["pickup", "delivery"] as const).map((f) => (
          <label key={f} className={`cursor-pointer rounded-xl border p-3 text-sm ${fulfilment === f ? "border-arrive bg-arrive-soft" : "border-line bg-white"}`}>
            <input type="radio" name="fulfilment" value={f} checked={fulfilment === f} onChange={() => setFulfilment(f)} className="sr-only" />
            <span className="font-semibold">{f === "pickup" ? "Self-pickup" : "Delivery"}</span>
            <span className="block text-xs text-ink-soft">{f === "pickup" ? "Collect from each seller; free" : "One vehicle, one slot, all sellers"}</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label className="label" htmlFor="locality">Your area</label>
        <select id="locality" name="locality" value={locality} onChange={(e) => setLocality(e.target.value)} className="input">
          {LOCALITIES.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
        </select>
      </div>
      {fulfilment === "delivery" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="slotDate">Date</label>
              <input id="slotDate" type="date" name="slotDate" required min={firstSlot} max={latestSlotDate} defaultValue={slotOk ? (addDays(today, 1) <= latestSlotDate ? addDays(today, 1) : today) : undefined} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="slotWindow">Window</label>
              <select id="slotWindow" name="slotWindow" defaultValue={WINDOWS[3]} className="input">
                {WINDOWS.map((w) => <option key={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-ink-soft">Latest date: {latestSlotDate}, before your earliest seller leaves.</p>
          <div>
            <label className="label" htmlFor="address">Delivery address</label>
            <textarea id="address" name="address" required rows={2} placeholder="Flat / room, building, street, landmark" className="input" />
            <p className="mt-1 text-xs text-ink-soft">Shared only with the delivery partner, never with sellers.</p>
          </div>
        </>
      )}

      <dl className="space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt>Items ({lines.length})</dt><dd>{inr(q.itemsTotal)}</dd></div>
        <div className="flex justify-between"><dt>Buyer protection</dt><dd>{inr(q.fee)}</dd></div>
        {q.delivery && (
          <div className="flex justify-between">
            <dt>Delivery · {q.delivery.vehicle === "mini_truck" ? "mini-truck + 2 helpers" : q.delivery.vehicle === "two_wheeler" ? "two-wheeler" : "nothing to move"} · {q.delivery.km} km{q.delivery.stops > 1 ? ` · ${q.delivery.stops} stops` : ""}</dt>
            <dd>{inr(q.deliveryPrice)}</dd>
          </div>
        )}
        {credit > 0 && (
          <div className="flex items-center justify-between">
            <dt><label className="flex items-center gap-2"><input type="checkbox" name="useCredit" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use referral credit ({inr(credit)})</label></dt>
            <dd className="text-ok">−{inr(q.creditApplied)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{inr(q.total)}</dd></div>
      </dl>
      <p className="text-xs text-ink-soft">Paid by UPI or card. Held by our payment partner and released to each seller only after you check the items and share their OTP.</p>
      {loggedIn ? (
        <Submit className="btn-arrive w-full" pendingText="Reserving items…">Pay {inr(q.total)} securely</Submit>
      ) : (
        <a href="/login?next=/cart" className="btn-arrive w-full">Log in to check out</a>
      )}
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
