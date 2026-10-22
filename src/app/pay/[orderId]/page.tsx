import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { read } from "@/lib/db";
import { inr } from "@/lib/format";
import { confirmMockPayment } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { RazorpayCheckout } from "@/components/razorpay-checkout";

export const metadata = { title: "Pay" };

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/pay/${orderId}`);
  const order = read().orders.find((o) => o.id === orderId && o.buyerId === user.id);
  if (!order) notFound();
  if (order.status !== "pending_payment" && order.status !== "cancelled") redirect(`/orders/${order.id}`);
  const expired = order.status === "cancelled";
  const minutesLeft = Math.max(0, 20 - Math.floor((Date.now() - Date.parse(order.createdAt)) / 60_000));

  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      <div className="card w-full max-w-md p-6">
        {expired ? (
          <>
            <h1 className="text-2xl font-bold">This checkout expired</h1>
            <p className="mt-2 text-sm text-ink-soft">Items are held for 20 minutes while you pay. They&apos;re back on sale now; if they&apos;re still available you can check out again.</p>
            <Link href="/cart" className="btn-primary mt-4 w-full">Back to cart</Link>
          </>
        ) : (
          <>
            <p className="chip bg-arrive-soft text-arrive">Items reserved for {minutesLeft} min</p>
            <h1 className="mt-2 text-2xl font-bold">Pay {inr(order.total)}</h1>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">
              <li>Items: {inr(order.itemsTotal)}</li>
              <li>Buyer protection: {inr(order.buyerFee)}</li>
              {order.deliveryFee > 0 && <li>Delivery ({order.slot?.date}, {order.slot?.window}): {inr(order.deliveryFee)}</li>}
              {order.creditApplied > 0 && <li>Referral credit: −{inr(order.creditApplied)}</li>}
            </ul>
            <div className="mt-4 rounded-xl bg-kraft-soft/60 p-3 text-sm">
              🔒 Your money is held by our payment partner. Each seller is paid only after you check their items and share the 4-digit handover OTP.
            </div>
            <div className="mt-5">
              {order.payment.provider === "razorpay" && order.payment.providerOrderId ? (
                <RazorpayCheckout
                  orderId={order.id}
                  keyId={process.env.RAZORPAY_KEY_ID ?? ""}
                  providerOrderId={order.payment.providerOrderId}
                  amountPaise={Math.round(order.total * 100)}
                  name={user.name}
                  phone={user.phone}
                />
              ) : (
                <ActionForm action={confirmMockPayment}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <p className="mb-2 text-xs text-ink-soft">Demo mode: Razorpay keys aren&apos;t configured, so this simulates a successful UPI payment.</p>
                  <Submit className="btn-arrive w-full" pendingText="Confirming payment…">Pay {inr(order.total)} via UPI (simulated)</Submit>
                </ActionForm>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
