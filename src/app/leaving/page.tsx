import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { LOCALITIES } from "@/lib/catalog";
import { addDays, todayIST } from "@/lib/pricing";
import { formatDate } from "@/lib/format";
import { activeSaleFor } from "@/lib/services/selling";
import { startSaleAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

export const metadata = { title: "Start a move-out sale", description: "List your whole room in one sale with a leaving date. We guarantee it's cleared by then." };

export default async function Leaving() {
  const user = await currentUser();
  const active = user ? activeSaleFor(user.id) : undefined;
  const communities = user?.badges.filter((b) => b.partnerId) ?? [];
  const today = todayIST();

  return (
    <div className="container-page grid gap-10 py-10 lg:grid-cols-[1fr_420px]">
      <div>
        <p className="chip bg-leave-soft text-leave">For people leaving Bengaluru</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight">Clear my room by {formatDate(addDays(today, 21), { day: "numeric", month: "long" })}.</h1>
        <p className="mt-3 max-w-xl text-lg text-ink-soft">One sale, one link, one deadline. You do the photos, and we handle buyers, payments, pickups and whatever&apos;s left at the end.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            ["Listing is free", "Pay a 10% success fee (min ₹49) only when something sells. Boosts are optional and come out of your payout."],
            ["Paid the same day", "Buyers pay upfront. Money is held by our payment partner and released when the buyer shares the handover OTP."],
            ["No haggling, no no-shows", "Countdown pricing drops 10% a week to your floor. Buyers reserve by paying, so they turn up."],
            ["Nothing left behind", "Five days out, partner dealers bid on unsold items, and free NGO donation and e-waste pickups clear the rest."],
          ].map(([t, d]) => (
            <div key={t} className="card p-4">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-line bg-white p-4 text-sm">
          <p className="font-semibold">Leaving a flat or PG with furniture the next tenant could use?</p>
          <p className="mt-1 text-ink-soft">Mark items as <strong>stay-in-place</strong>. The incoming tenant buys them where they stand, with zero logistics, and landlords love a furnished handover.</p>
        </div>
      </div>

      <div className="card h-fit p-6 lg:sticky lg:top-20">
        {!user ? (
          <>
            <h2 className="text-xl font-bold">Start your move-out</h2>
            <p className="mt-1 text-sm text-ink-soft">Log in with your phone number to create your sale page.</p>
            <Link href="/login?next=/leaving" className="btn-leave mt-4 w-full">Log in to start</Link>
          </>
        ) : active ? (
          <>
            <h2 className="text-xl font-bold">Your sale is live</h2>
            <p className="mt-1 text-sm text-ink-soft">{active.title} · leaving {formatDate(active.leavingDate)}</p>
            <div className="mt-4 grid gap-2">
              <Link href={`/sell/${active.id}/add`} className="btn-leave">Add items with photos</Link>
              <Link href={`/s/${active.slug}`} className="btn-ghost">View & share sale page</Link>
              <Link href="/dashboard?tab=selling" className="btn-ghost">Manage my move-out</Link>
            </div>
          </>
        ) : (
          <ActionForm action={startSaleAction} className="space-y-4">
            <h2 className="text-xl font-bold">Start your move-out</h2>
            <div>
              <label className="label" htmlFor="leavingDate">Leaving date</label>
              <input id="leavingDate" type="date" name="leavingDate" required min={today} max={addDays(today, 120)} defaultValue={addDays(today, 21)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="locality">Locality</label>
              <select id="locality" name="locality" required className="input" defaultValue="">
                <option value="" disabled>Choose your area</option>
                {LOCALITIES.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="title">Sale title (optional)</label>
              <input id="title" name="title" maxLength={80} placeholder={`${user.name.split(" ")[0]}'s move-out sale`} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="note">Note to buyers (optional)</label>
              <textarea id="note" name="note" rows={2} maxLength={500} placeholder="Why you're moving, pickup times, building access…" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="dropRate">Countdown price drop</label>
              <select id="dropRate" name="dropRate" defaultValue="10" className="input">
                <option value="0">No automatic drops</option>
                <option value="5">5% every week</option>
                <option value="10">10% every week (recommended)</option>
                <option value="15">15% every week</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="communityPartnerId">Who can see it</label>
              <select id="communityPartnerId" name="communityPartnerId" defaultValue="" className="input">
                <option value="">Everyone (recommended)</option>
                {communities.map((b) => <option key={b.partnerId} value={b.partnerId}>Only verified {b.label} members</option>)}
              </select>
              {communities.length === 0 && (
                <p className="mt-1 text-xs text-ink-soft">
                  <Link href="/verify" className="underline">Verify your college, company or co-living</Link> to run a private community sale and earn a trust badge.
                </p>
              )}
            </div>
            <Submit className="btn-leave w-full" pendingText="Creating…">Create my sale page →</Submit>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
