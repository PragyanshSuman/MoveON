export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="container-page py-20 text-center">
      <p className="text-4xl" aria-hidden>📶</p>
      <h1 className="mt-3 text-2xl font-bold">You&apos;re offline</h1>
      <p className="mt-2 text-ink-soft">Reconnect to see the latest prices. Countdown prices keep dropping while you&apos;re away!</p>
    </div>
  );
}
