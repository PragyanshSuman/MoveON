"use client";
import { useEffect, useState } from "react";

/** Live countdown to the end of the leaving day (IST). */
export function Countdown({ leavingDate, className = "" }: { leavingDate: string; className?: string }) {
  const end = Date.parse(`${leavingDate}T23:59:59+05:30`);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={className}>&nbsp;</span>;
  const ms = Math.max(0, end - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (ms === 0) return <span className={className}>Sale ended</span>;
  return (
    <span className={`tabular-nums ${className}`} aria-label={`${d} days ${h} hours left`}>
      {d > 0 && <>{d}d </>}{h}h {d === 0 && <>{m}m </>}left
    </span>
  );
}
