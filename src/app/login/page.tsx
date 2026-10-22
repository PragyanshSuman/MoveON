import { redirect } from "next/navigation";
import { currentUser, showOtpOnScreen } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; ref?: string }> }) {
  const { next = "/dashboard", ref } = await searchParams;
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (await currentUser()) redirect(safeNext);
  return (
    <div className="container-page grid min-h-[70vh] place-items-center py-10">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold">Log in with your phone</h1>
        <p className="mt-1 text-sm text-ink-soft">No passwords. Your number is never shown to other users; chats and calls are masked.</p>
        {ref && <p className="mt-3 rounded-xl bg-arrive-soft p-3 text-sm text-arrive">Referral code <strong>{ref}</strong> applied: you both get ₹200 credit after your first deal.</p>}
        <div className="mt-6"><LoginForm next={safeNext} referral={ref} /></div>
        {showOtpOnScreen() && <p className="mt-6 text-xs text-ink-soft">Demo accounts: buyer 90000 00001 · seller 91000 00001 · admin 99999 99999</p>}
      </div>
    </div>
  );
}
