import Link from "next/link";
import { currentUser, isAdmin } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { unreadCount } from "@/lib/services/account";
import { logout } from "@/app/actions";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold" aria-label="MoveOn home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm text-tape" aria-hidden>MO</span>
      <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">MoveOn</span>
    </Link>
  );
}

export async function Header() {
  const [user, cart] = await Promise.all([currentUser(), getCart()]);
  const unread = user ? unreadCount(user.id) : 0;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="container-page flex h-14 items-center gap-3">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 text-sm font-medium md:flex">
          <Link href="/browse" className="rounded-lg px-3 py-1.5 hover:bg-kraft-soft">Browse</Link>
          <Link href="/kits" className="rounded-lg px-3 py-1.5 hover:bg-kraft-soft">Starter Kits</Link>
          <Link href="/area" className="rounded-lg px-3 py-1.5 hover:bg-kraft-soft">Areas</Link>
          <Link href="/leaving" className="rounded-lg px-3 py-1.5 text-leave hover:bg-leave-soft">I&apos;m leaving</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/cart" className="relative rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-kraft-soft" aria-label={`Cart, ${cart.length} items`}>
            🛒<span className="ml-1 hidden sm:inline">Cart</span>
            {cart.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-leave px-1 text-[11px] font-bold text-white">{cart.length}</span>}
          </Link>
          {user ? (
            <>
              <Link href="/dashboard?tab=inbox" className="relative rounded-lg px-3 py-1.5 text-sm hover:bg-kraft-soft" aria-label={`Notifications, ${unread} unread`}>
                🔔
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-arrive px-1 text-[11px] font-bold text-white">{unread}</span>}
              </Link>
              {isAdmin(user) && <Link href="/admin" className="hidden rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-kraft-soft sm:block">Admin</Link>}
              <Link href="/dashboard" className="btn-primary px-3 py-1.5">{user.name.split(" ")[0]}</Link>
            </>
          ) : (
            <Link href="/login" className="btn-primary px-3 py-1.5">Log in</Link>
          )}
        </div>
      </div>
      <nav className="container-page flex gap-1 overflow-x-auto pb-2 text-sm font-medium md:hidden">
        <Link href="/browse" className="shrink-0 rounded-full border border-line bg-white px-3 py-1">Browse</Link>
        <Link href="/kits" className="shrink-0 rounded-full border border-line bg-white px-3 py-1">Starter Kits</Link>
        <Link href="/area" className="shrink-0 rounded-full border border-line bg-white px-3 py-1">Areas</Link>
        <Link href="/leaving" className="shrink-0 rounded-full border border-leave/30 bg-leave-soft px-3 py-1 text-leave">I&apos;m leaving</Link>
        <Link href="/arriving" className="shrink-0 rounded-full border border-arrive/30 bg-arrive-soft px-3 py-1 text-arrive">I&apos;m arriving</Link>
      </nav>
    </header>
  );
}

export async function Footer() {
  const user = await currentUser();
  return (
    <footer className="mt-16 border-t border-line bg-kraft-soft/50">
      <div className="container-page grid gap-8 py-10 text-sm sm:grid-cols-4">
        <div className="sm:col-span-1">
          <Logo />
          <p className="mt-2 text-ink-soft">Clear your room by your leaving date. Set up your new one in a week.</p>
        </div>
        <div>
          <p className="label">Marketplace</p>
          <ul className="space-y-1">
            <li><Link href="/leaving" className="hover:underline">Start a move-out sale</Link></li>
            <li><Link href="/arriving" className="hover:underline">Set up my room</Link></li>
            <li><Link href="/kits" className="hover:underline">Starter Kits</Link></li>
            <li><Link href="/partners" className="hover:underline">Communities & partners</Link></li>
          </ul>
        </div>
        <div>
          <p className="label">Trust</p>
          <ul className="space-y-1">
            <li><Link href="/legal/how-it-works" className="hover:underline">How payments are protected</Link></li>
            <li><Link href="/legal/refunds" className="hover:underline">Refund & dispute policy</Link></li>
            <li><Link href="/legal/prohibited" className="hover:underline">Prohibited items</Link></li>
          </ul>
        </div>
        <div>
          <p className="label">Company</p>
          <ul className="space-y-1">
            <li><Link href="/legal/terms" className="hover:underline">Terms of use</Link></li>
            <li><Link href="/legal/privacy" className="hover:underline">Privacy (DPDP Act 2023)</Link></li>
            <li><Link href="/legal/grievance" className="hover:underline">Grievance officer</Link></li>
            {user && <li><form action={logout}><button className="hover:underline">Log out</button></form></li>}
          </ul>
        </div>
      </div>
      <p className="container-page pb-8 text-xs text-ink-soft">MoveOn (working name) · Bengaluru · Prices in ₹ include no hidden charges; fees are shown before you pay.</p>
    </footer>
  );
}
