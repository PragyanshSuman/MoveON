"use client";
import { useState } from "react";

export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-kraft-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[i]} alt={alt} className="h-full w-full object-cover" />
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex gap-2">
          {photos.map((p, n) => (
            <button key={p} type="button" onClick={() => setI(n)} aria-label={`Photo ${n + 1}`}
              className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${n === i ? "border-ink" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
