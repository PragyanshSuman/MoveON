# MoveOn: move-out marketplace (Bengaluru MVP)

A deadline-driven marketplace: someone leaving the city lists everything in one **Move-Out Sale** with a leaving date, and the platform makes sure the room is cleared by then. Newcomers buy the items (one at a time or as Starter Kits), partner dealers make instant offers on what's left, and the rest is donated or recycled.

Built as a mobile-first PWA: Next.js 16 (App Router, server actions), Tailwind v4, TypeScript.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000, demo data is seeded on first request
npm test             # 25 unit + flow tests (pricing, payments, handover, disputes, buy-back…)
npm run build        # production build
npm run seed         # wipe ./data and re-seed demo data on next request
```

**Demo accounts.** Log in with any number; in development the OTP is shown on screen.

| Role | Phone | What to try |
|---|---|---|
| Buyer | 90000 00001 | Has a held order (see the OTP), owns a certified bed (claim buy-back), has move-in alerts |
| Seller | 91000 00001 | Priya's HSR sale: enter the buyer's OTP, boost, edit items, add items via photo walk-through |
| Seller (5 days out) | 91000 00002 | Rahul leaves in 4 days: dealer offers, donation and e-waste pickups |
| Admin | 99999 99999 | `/admin`: metrics, the dispute queue, buy-back claims, concierge leads, certification |

Copy `.env.example` to `.env.local` to turn on real integrations.

## What's implemented, mapped to the plan

**Seller flow, "Clear my room by the 30th"**
- Start a move-out: leaving date, locality, verified community, optional members-only visibility (`/leaving`)
- **Photo walk-through** (`/sell/[saleId]/add`): Claude vision finds each item in a room photo, returns bounding boxes (each item gets its own cropped photo), title, category, condition, age and a price. The AI price is blended with a rule-based engine (category depreciation × condition × brand tier), so one bad guess can't produce an absurd price. Without an API key it falls back to one photo per item with rule-based prices.
- One shareable sale page `/s/[slug]` with a live countdown, WhatsApp/LinkedIn share and a generated **"Leaving HSR Layout on 30 June"** preview card (Open Graph image)
- **Countdown pricing**: automatic weekly drops (configurable 0–20%) down to the seller's floor, with the full schedule shown to buyers
- **Held payment → OTP handover → same-day payout**, with a refusal path for a full refund
- **Nothing left behind**: five days before the deadline a daily job asks partner dealers for instant cash offers on every unsold item; sellers can also book a free NGO donation or authorised e-waste pickup, with a certificate number
- Boosts / urgent badge (₹49–199), **deducted from proceeds** instead of charged upfront
- Stay-in-place handover for items the next tenant keeps (zero delivery)

**Buyer flow, "Set up my room this week"**
- `/arriving`: move-in date, area, budget and wish-list, which feeds move-in alerts sent when matching items are listed nearby
- Browse with filters (available by my date, verified sellers, stay-in-place, price, area), plus a **map view** (Leaflet + OpenStreetMap)
- **Starter Kits** assembled from live nearby sales: cheapest per slot, penalised by distance, extra seller stops and availability after the move-in date
- One cart across many sellers with one delivery slot. Delivery is quoted as one vehicle on a nearest-neighbour route (mini-truck + helpers for heavy items, two-wheeler otherwise).
- Inspect at handover; refuse for a full refund, or dispute within 48 hours

**Trust and safety**
- Phone-OTP login (rate-limited, single-use, hashed); signed httpOnly session cookies
- Community badges via college/work email OTP (personal email domains rejected) or co-living resident code; members-only sales
- The handover OTP is shown **only to the buyer**; 5 wrong attempts lock the handover and alert ops
- Masked chat: phone numbers, emails and UPI IDs are hidden automatically
- Banned-items screening; first-name-and-initial display only; addresses only for delivery
- Uploads are validated by magic bytes, not file extension

**Phase 2 extras already in**
- **Buy-back guarantee**: admin-certified items carry a 50% buy-back value for 12 months, shown on the item page and in "Things I own". Claims are paid and the item is relisted in a "MoveOn Certified" sale; the margin goes to the ledger.
- **Item passport**: listing, sale, certification and buy-back history travels with each item
- **Move-out concierge**: packers & movers, deep cleaning, broadband transfer leads (referral fee when booked) and a deposit-return checklist
- **Referral loop**: ₹200 credit for both sides after the referred user's first deal. Credit only offsets MoveOn's own fees, never seller payouts.

**Operations** (`/admin`): the plan's weekly metrics with targets (north star = items re-homed before the deadline, days to sale, GMV, take rate, contribution per order, buyer→seller conversion, dispute rate), revenue by stream, the ₹4,000 unit-economics waterfall, liquidity by locality, and queues for disputes (refund / release), buy-back claims, concierge leads, locked handovers and certification.

**SEO and PWA**: locality landing pages with FAQ structured data, Product structured data on items, sitemap/robots, web manifest, service worker with an offline page.

## Integrations: real vs. demo

| Concern | Without config (demo) | With config |
|---|---|---|
| Payments | Mock provider simulates held transfers | `RAZORPAY_KEY_ID/SECRET`: Razorpay Route order with per-seller `on_hold` transfers, Checkout.js, signature verification, transfer release on OTP, reversal + refund on refusal. Sellers need a linked account (`acc_…`) in their profile. |
| AI listing | Rule-based prices, one photo per item | `ANTHROPIC_API_KEY`: `claude-opus-5-5` vision with structured output (`betaZodOutputFormat`), low effort for speed, server-side refusal fallback enabled |
| Login SMS | OTP printed to server log and shown on screen in dev | `SMS_WEBHOOK_URL`: POSTs `{to, text}` to your gateway adapter (MSG91, Twilio…) |
| Notifications | In-app inbox; WhatsApp text logged | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`: Cloud API template message (one body variable) |
| Daily jobs | Run lazily at most once a minute on page loads | Point a scheduler at `GET /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` |
| Dealers, NGOs, recyclers, delivery | Fictional seeded partners; delivery priced by a cost model | Replace the seed partners with signed partners and wire a delivery partner's booking API into checkout |

All seeded people, partners, dealers and NGOs are fictional.

## Architecture

```
src/lib/
  types.ts         domain model
  catalog.ts       localities, categories (depreciation, heavy, e-waste, buy-back), kit templates, banned terms
  pricing.ts       pure maths: countdown, fees, delivery quotes, price suggestion, contribution (shared with the client)
  db.ts            JSON-file store: atomic writes, mtime-cached reads. Swap for Postgres (supabase/schema.sql)
  auth.ts          OTP challenges, signed sessions
  payments.ts      PaymentProvider interface + Mock and Razorpay Route implementations
  ai.ts            Claude photo → listing drafts
  notify.ts        Outbox: in-app notification inside the transaction, WhatsApp after commit
  services/        marketplace (reads), selling, orders, account, admin
src/app/
  actions.ts       every mutation is a server action → service call
  …pages           /, /leaving, /arriving, /browse, /kits, /area, /partners, /s/[slug], /i/[id], /cart,
                   /pay/[orderId], /orders/[id], /dashboard, /sell/…, /verify, /admin, /legal/…
tests/             vitest: pricing and full service flows against a temp data dir
```

## Before going to production

- Replace `src/lib/db.ts` with Postgres (Supabase). The JSON store is single-process and fine for a pilot, not for multiple instances. Store handover OTPs hashed.
- Configure an SMS gateway, then set `NODE_ENV=production` and leave `MOVEON_SHOW_OTP` unset so codes are never shown on screen.
- Set `SESSION_SECRET`, `NEXT_PUBLIC_BASE_URL` and `CRON_SECRET`; put uploads on object storage (Supabase Storage / Cloudinary).
- Onboard sellers as Razorpay Route linked accounts and handle the payment webhooks (`payment.captured`, `transfer.processed`) for reliability.
- Have a lawyer and CA review `/legal/*` (Consumer Protection (E-Commerce) Rules 2020, DPDP Act 2023, GST/TCS on platform fees) and fill in the grievance officer's details.
