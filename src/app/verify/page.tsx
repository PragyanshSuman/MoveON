import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { residentCodeAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { EmailBadgeForm } from "@/components/email-badge-form";
import { Badges } from "@/components/ui";

export const metadata = { title: "Verify your community" };

export default async function Verify() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/verify");
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-3xl font-bold">Verify your community</h1>
      <p className="mt-1 text-ink-soft">A badge tells buyers and sellers you&apos;re a real student, employee or resident. It unlocks members-only sales and makes your listings sell faster.</p>
      {user.badges.length > 0 && <div className="mt-4"><Badges badges={user.badges} /></div>}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">🎓 💼 College or company</h2>
          <p className="mb-4 text-sm text-ink-soft">We email a one-time code to your official address. We never email you anything else there.</p>
          <EmailBadgeForm />
        </section>
        <section className="card p-5">
          <h2 className="font-bold">🏠 Co-living resident</h2>
          <p className="mb-4 text-sm text-ink-soft">Enter the MoveOn resident code from your property manager or resident app.</p>
          <ActionForm action={residentCodeAction} className="space-y-3">
            <label className="label" htmlFor="code">Resident code</label>
            <input id="code" name="code" required placeholder="e.g. GREENLEAF-2026" className="input uppercase" />
            <Submit className="btn-arrive w-full" pendingText="Checking…">Verify</Submit>
          </ActionForm>
          <p className="mt-3 text-xs text-ink-soft">See <Link href="/partners" className="underline">partner communities</Link>.</p>
        </section>
      </div>
    </div>
  );
}
