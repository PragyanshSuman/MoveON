import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BANNED_KEYWORDS } from "@/lib/catalog";
import { FEES } from "@/lib/pricing";

// Plain-language policy pages required by the Consumer Protection (E-Commerce) Rules 2020
// and the DPDP Act 2023. These are templates: have a lawyer and CA review before launch.
const PAGES: Record<string, { title: string; body: ReactNode }> = {
  "how-it-works": {
    title: "How your payment is protected",
    body: (
      <>
        <p>MoveOn never holds your money in its own bank account. When you pay, a licensed payment aggregator (Razorpay Route) collects the payment and creates a transfer to each seller that is <strong>on hold</strong>.</p>
        <p>At handover, you inspect the items. Only when you share that seller&apos;s 4-digit OTP is the transfer released, and the seller is paid the same day. If the item isn&apos;t as described, refuse it before sharing the OTP and you receive a full refund of the item price, its share of the protection fee and delivery.</p>
        <p>Chats and calls are masked: phone numbers, emails and UPI IDs typed into chat are hidden automatically, so deals stay protected.</p>
      </>
    ),
  },
  refunds: {
    title: "Refund & dispute policy",
    body: (
      <>
        <p><strong>Before handover:</strong> refuse any item that isn&apos;t as described for a full refund to your original payment method within 3–5 working days.</p>
        <p><strong>After handover:</strong> raise a dispute within 48 hours for hidden defects. Support compares listing photos, handover photos and chat history, usually within one working day.</p>
        <p><strong>Seller cancellations:</strong> if a seller can&apos;t complete a handover, you&apos;re refunded in full automatically.</p>
        <p><strong>Fees:</strong> sellers pay {FEES.sellerRate * 100}% of the sale price (minimum ₹{FEES.sellerMin}) only when an item sells. Buyers pay a {FEES.buyerRate * 100}% protection fee (₹{FEES.buyerMin}–₹{FEES.buyerMax} per order). Delivery is quoted before you pay.</p>
      </>
    ),
  },
  prohibited: {
    title: "Prohibited items",
    body: (
      <>
        <p>You can&apos;t list weapons or ammunition, medicines or prescription drugs, alcohol or tobacco, gas cylinders, counterfeit or replica goods, stolen property, or anything illegal to sell in India.</p>
        <p>Listings are screened automatically for terms such as: {BANNED_KEYWORDS.join(", ")}. Repeat attempts lead to account suspension.</p>
        <p>Old electronics that don&apos;t sell are routed to authorised e-waste recyclers, never to informal scrap dealers.</p>
      </>
    ),
  },
  terms: {
    title: "Terms of use",
    body: (
      <>
        <p>MoveOn is a marketplace that connects people moving out of a home with people moving in. Sellers are individuals selling their own used goods; MoveOn is not the seller of record. Seller details are shown on each sale page as required by the Consumer Protection (E-Commerce) Rules 2020.</p>
        <p>By listing, sellers confirm they own the items and that descriptions and photos are accurate. By buying, buyers agree to inspect items at handover before sharing the OTP.</p>
        <p>Dealer instant offers are made by independent partner dealers who pay sellers directly at pickup. MoveOn earns a referral fee from the dealer.</p>
        <p className="text-sm text-ink-soft">Template for the MVP. Have this reviewed by a lawyer before launch.</p>
      </>
    ),
  },
  privacy: {
    title: "Privacy notice (DPDP Act 2023)",
    body: (
      <>
        <p><strong>What we collect:</strong> your phone number (login), name, optional college/work email (only to verify a badge), listing photos, delivery address (only for delivery orders), and UPI ID or payout account.</p>
        <p><strong>Why:</strong> to run your sale or order, protect payments, prevent fraud and resolve disputes. We don&apos;t sell personal data.</p>
        <p><strong>Who sees what:</strong> other users see only your first name, last initial, badges and ratings. Your phone number and email are never shown. Delivery addresses are shared only with the delivery partner.</p>
        <p><strong>Your rights:</strong> access, correct or erase your data, withdraw consent, and nominate someone to act for you, by writing to the grievance officer. We delete verification emails once the badge is issued.</p>
      </>
    ),
  },
  grievance: {
    title: "Grievance officer",
    body: (
      <>
        <p>As required by the Consumer Protection (E-Commerce) Rules 2020 and the DPDP Act 2023:</p>
        <p><strong>Grievance Officer:</strong> [Name], MoveOn (working name), Bengaluru, Karnataka<br />Email: grievance@moveon.example · Phone: [number] · Mon–Fri, 10 am–6 pm</p>
        <p>We acknowledge complaints within 48 hours and resolve them within one month.</p>
      </>
    ),
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((page) => ({ page }));
}

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  return { title: PAGES[page]?.title ?? "Policy" };
}

export default async function LegalPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const p = PAGES[page];
  if (!p) notFound();
  return (
    <article className="container-page max-w-2xl py-10">
      <h1 className="text-3xl font-bold">{p.title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed">{p.body}</div>
    </article>
  );
}
