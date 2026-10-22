"use client";
import { useState } from "react";

export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const full = url; // absolute URL, built on the server
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${full}`)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(full)}`;
  async function nativeShare() {
    if (navigator.share) {
      try { await navigator.share({ title: "MoveOn", text, url: full }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a href={wa} target="_blank" rel="noopener noreferrer" className="btn bg-[#25D366] text-white hover:bg-[#1fb757]">WhatsApp</a>
      <a href={li} target="_blank" rel="noopener noreferrer" className="btn bg-[#0a66c2] text-white hover:bg-[#09579f]">LinkedIn</a>
      <button type="button" onClick={nativeShare} className="btn-ghost">{copied ? "Link copied ✓" : "Share / copy link"}</button>
    </div>
  );
}
