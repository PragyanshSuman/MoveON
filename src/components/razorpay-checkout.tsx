"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmRazorpayPayment } from "@/app/actions";

interface RazorpayResponse { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void };

function loadScript(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay failed to load")));
    s.onerror = () => reject(new Error("Couldn't reach Razorpay. Check your connection."));
    document.body.appendChild(s);
  });
}

export function RazorpayCheckout({ orderId, keyId, providerOrderId, amountPaise, name, phone }: {
  orderId: string; keyId: string; providerOrderId: string; amountPaise: number; name: string; phone: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const Razorpay = await loadScript();
      new Razorpay({
        key: keyId,
        amount: amountPaise,
        currency: "INR",
        order_id: providerOrderId,
        name: "MoveOn",
        description: "Held until handover",
        prefill: { name, contact: phone },
        theme: { color: "#0e7a6d" },
        handler: async (r: RazorpayResponse) => {
          const res = await confirmRazorpayPayment(orderId, r.razorpay_payment_id, r.razorpay_signature);
          if (res?.error) {
            setError(res.error);
            setBusy(false);
          } else router.push(`/orders/${orderId}?paid=1`);
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={pay} disabled={busy} className="btn-arrive w-full">{busy ? "Waiting for payment…" : "Pay with UPI / card"}</button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
