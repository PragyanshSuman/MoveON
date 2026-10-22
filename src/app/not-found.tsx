import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-20 text-center">
      <p className="text-5xl" aria-hidden>📦</p>
      <h1 className="mt-3 text-3xl font-bold">This box is empty</h1>
      <p className="mt-2 text-ink-soft">The page or item you&apos;re looking for has moved on, like its owner.</p>
      <Link href="/browse" className="btn-primary mt-6">Browse live sales</Link>
    </div>
  );
}
