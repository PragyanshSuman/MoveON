// Held-funds payments. MoveOn never keeps buyer money in its own account: with Razorpay Route
// each seller's share is transferred to their linked account "on hold" and released only when
// the buyer shares the handover OTP. The mock provider simulates the same lifecycle locally.
import crypto from "node:crypto";

export interface TransferRequest {
  sellerId: string;
  account?: string; // Razorpay linked account id (acc_...)
  amount: number; // ₹
}

export interface CreatedOrder {
  providerOrderId: string;
  checkout?: { keyId: string; amountPaise: number; currency: "INR"; orderId: string };
}

export interface PaymentProvider {
  name: "mock" | "razorpay";
  createOrder(input: { receipt: string; amount: number; transfers: TransferRequest[] }): Promise<CreatedOrder>;
  verifySignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  /** Transfer ids keyed by seller id, available once the payment is captured. */
  transfersFor(input: { paymentId: string; transfers: TransferRequest[] }): Promise<Record<string, string>>;
  releaseTransfer(transferId: string): Promise<void>;
  reverseTransfer(transferId: string, amount: number): Promise<void>;
  refund(paymentId: string, amount: number): Promise<void>;
}

const paise = (rupees: number) => Math.round(rupees * 100);

class MockProvider implements PaymentProvider {
  name = "mock" as const;
  async createOrder() {
    return { providerOrderId: `mord_${crypto.randomBytes(6).toString("hex")}` };
  }
  verifySignature() {
    return true;
  }
  async transfersFor({ transfers }: { transfers: TransferRequest[] }) {
    return Object.fromEntries(transfers.map((t) => [t.sellerId, `mtrf_${crypto.randomBytes(6).toString("hex")}`]));
  }
  async releaseTransfer() {}
  async reverseTransfer() {}
  async refund() {}
}

class RazorpayProvider implements PaymentProvider {
  name = "razorpay" as const;
  constructor(private keyId: string, private keySecret: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed: ${json?.error?.description ?? res.status}`);
    return json as T;
  }

  async createOrder({ receipt, amount, transfers }: { receipt: string; amount: number; transfers: TransferRequest[] }) {
    const missing = transfers.filter((t) => !t.account);
    if (missing.length) throw new Error("A seller in this cart hasn't finished payout setup yet.");
    const order = await this.call<{ id: string }>("POST", "/orders", {
      amount: paise(amount),
      currency: "INR",
      receipt,
      transfers: transfers.map((t) => ({
        account: t.account,
        amount: paise(t.amount),
        currency: "INR",
        notes: { moveon_order: receipt, seller: t.sellerId },
        linked_account_notes: ["moveon_order"],
        on_hold: 1,
      })),
    });
    return { providerOrderId: order.id, checkout: { keyId: this.keyId, amountPaise: paise(amount), currency: "INR" as const, orderId: order.id } };
  }

  verifySignature({ providerOrderId, paymentId, signature }: { providerOrderId: string; paymentId: string; signature: string }) {
    const expected = crypto.createHmac("sha256", this.keySecret).update(`${providerOrderId}|${paymentId}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async transfersFor({ paymentId, transfers }: { paymentId: string; transfers: TransferRequest[] }) {
    const res = await this.call<{ items: { id: string; recipient: string; amount: number }[] }>("GET", `/payments/${paymentId}/transfers`);
    const out: Record<string, string> = {};
    const unused = [...res.items];
    for (const t of transfers) {
      const idx = unused.findIndex((x) => x.recipient === t.account && x.amount === paise(t.amount));
      if (idx >= 0) out[t.sellerId] = unused.splice(idx, 1)[0].id;
    }
    return out;
  }

  async releaseTransfer(transferId: string) {
    await this.call("PATCH", `/transfers/${transferId}`, { on_hold: 0 });
  }

  async reverseTransfer(transferId: string, amount: number) {
    await this.call("POST", `/transfers/${transferId}/reversals`, { amount: paise(amount) });
  }

  async refund(paymentId: string, amount: number) {
    await this.call("POST", `/payments/${paymentId}/refund`, { amount: paise(amount) });
  }
}

let provider: PaymentProvider | undefined;
export function payments(): PaymentProvider {
  if (provider) return provider;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  provider = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET ? new RazorpayProvider(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) : new MockProvider();
  return provider;
}

/** For tests. */
export function setPaymentProvider(p: PaymentProvider | undefined) {
  provider = p;
}
