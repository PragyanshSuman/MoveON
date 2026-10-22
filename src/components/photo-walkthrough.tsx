"use client";
// Photo walk-through: snap the room, AI finds each item and drafts the listing, the seller
// tweaks and publishes. Without an AI key, each photo becomes one draft with rule-based pricing.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CATEGORIES, CONDITIONS } from "@/lib/catalog";
import { inr, suggestPrice } from "@/lib/pricing";
import type { Condition } from "@/lib/types";
import { publishItemsAction } from "@/app/actions";

interface Draft {
  key: string;
  blob: Blob;
  preview: string;
  title: string;
  category: string;
  brand: string;
  condition: Condition;
  ageMonths: number;
  description: string;
  listPrice: number;
  floorPrice: number;
  originalPrice?: number;
  availableFrom: string;
  stayInPlace: boolean;
  aiGenerated: boolean;
  priceTouched: boolean;
  reasoning?: string;
}

interface AiDraft {
  title: string; category: string; brand?: string; condition: Condition; ageMonths: number; description: string;
  listPrice: number; floorPrice: number; originalPrice?: number; priceReasoning: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

const MAX_SIDE = 1568;

async function toBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo format isn't supported. Use JPEG or PNG (set your camera to 'Most compatible').");
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process photo"))), "image/jpeg", 0.85));
}

/** Resizes (and optionally crops, with a little padding) a bitmap to a JPEG blob. */
async function render(bmp: ImageBitmap, box?: AiDraft["bbox"]): Promise<Blob> {
  const pad = 0.04;
  const sx = box ? Math.max(0, box.x0 - pad) * bmp.width : 0;
  const sy = box ? Math.max(0, box.y0 - pad) * bmp.height : 0;
  const sw = box ? (Math.min(1, box.x1 + pad) * bmp.width) - sx : bmp.width;
  const sh = box ? (Math.min(1, box.y1 + pad) * bmp.height) - sy : bmp.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas);
}

let counter = 0;
const nextKey = () => `d${Date.now()}${counter++}`;

function ruleDraft(blob: Blob, availableFrom: string): Draft {
  const s = suggestPrice({ category: "other", ageMonths: 12, condition: "good" });
  return {
    key: nextKey(), blob, preview: URL.createObjectURL(blob), title: "", category: "other", brand: "", condition: "good", ageMonths: 12,
    description: "", listPrice: s.listPrice, floorPrice: s.floorPrice, availableFrom, stayInPlace: false, aiGenerated: false, priceTouched: false, reasoning: s.reasoning,
  };
}

export function PhotoWalkthrough({ saleId, today, leavingDate, aiEnabled }: { saleId: string; today: string; leavingDate: string; aiEnabled: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = [...files].slice(0, 10);
    for (let n = 0; n < list.length; n++) {
      setBusy(aiEnabled ? `Looking at photo ${n + 1} of ${list.length}…` : `Preparing photo ${n + 1} of ${list.length}…`);
      try {
        const bmp = await toBitmap(list[n]);
        const full = await render(bmp);
        if (!aiEnabled) {
          setDrafts((d) => [...d, ruleDraft(full, today)]);
          continue;
        }
        const form = new FormData();
        form.append("image", full, "room.jpg");
        form.append("hint", hint);
        const res = await fetch("/api/ai/listing", { method: "POST", body: form });
        const json = (await res.json()) as { available?: boolean; drafts?: AiDraft[]; notes?: string; error?: string };
        if (!res.ok || json.error || !json.drafts) {
          setError(`${json.error ?? "AI couldn't read that photo."} Added it as a manual draft instead.`);
          setDrafts((d) => [...d, ruleDraft(full, today)]);
          continue;
        }
        if (json.notes) setNotes((x) => [...x, json.notes!]);
        if (!json.drafts.length) {
          setError("No sellable items found in that photo; added it as a manual draft.");
          setDrafts((d) => [...d, ruleDraft(full, today)]);
          continue;
        }
        const made: Draft[] = [];
        for (const a of json.drafts) {
          const blob = a.bbox ? await render(bmp, a.bbox) : full;
          made.push({
            key: nextKey(), blob, preview: URL.createObjectURL(blob), title: a.title, category: a.category, brand: a.brand ?? "",
            condition: a.condition, ageMonths: a.ageMonths, description: a.description, listPrice: a.listPrice, floorPrice: a.floorPrice,
            originalPrice: a.originalPrice, availableFrom: ["bed", "mattress"].includes(a.category) ? leavingDate : today,
            stayInPlace: false, aiGenerated: true, priceTouched: false, reasoning: a.priceReasoning,
          });
        }
        setDrafts((d) => [...d, ...made]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't process that photo.");
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => {
      if (d.key !== key) return d;
      const next = { ...d, ...patch };
      const pricingChanged = "category" in patch || "ageMonths" in patch || "condition" in patch || "brand" in patch;
      if (pricingChanged && !next.priceTouched) {
        const s = suggestPrice({ category: next.category, ageMonths: next.ageMonths, condition: next.condition, brand: next.brand, originalPrice: next.aiGenerated ? next.originalPrice : undefined });
        next.listPrice = s.listPrice;
        next.floorPrice = s.floorPrice;
        next.reasoning = s.reasoning;
      }
      return next;
    }));
  }

  function remove(key: string) {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
  }

  async function publish() {
    setError(null);
    const missing = drafts.find((d) => !d.title.trim());
    if (missing) return setError("Give every item a title before publishing.");
    try {
      const urls: string[] = [];
      for (let n = 0; n < drafts.length; n++) {
        setBusy(`Uploading photo ${n + 1} of ${drafts.length}…`);
        const form = new FormData();
        form.append("file", drafts[n].blob, "item.jpg");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
        urls.push(json.url);
      }
      setBusy("Publishing…");
      const result = await publishItemsAction(saleId, drafts.map((d, n) => ({
        title: d.title, category: d.category, brand: d.brand || undefined, ageMonths: d.ageMonths, condition: d.condition,
        description: d.description, photos: [urls[n]], listPrice: d.listPrice, floorPrice: d.floorPrice, originalPrice: d.originalPrice,
        availableFrom: d.availableFrom, stayInPlace: d.stayInPlace, aiGenerated: d.aiGenerated,
      })));
      if (result?.error) throw new Error(result.error);
      drafts.forEach((d) => URL.revokeObjectURL(d.preview));
      router.push(`/s/${result?.slug ?? ""}?published=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publishing failed.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="card p-5">
        <h2 className="text-lg font-bold">1. Snap your room</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {aiEnabled
            ? "Take wide photos of each corner. AI spots every item, crops a photo for it, writes the title and suggests a price."
            : "Add one photo per item. We suggest a price from category, brand, age and condition. (Set ANTHROPIC_API_KEY to turn on AI room scanning.)"}
        </p>
        {aiEnabled && (
          <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional: ages or brands, e.g. 'bed and mattress bought Jan 2025 from Wakefit'" className="input mt-3" />
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={`btn-leave cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
            📷 {drafts.length ? "Add more photos" : "Take or choose photos"}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} disabled={!!busy} />
          </label>
        </div>
        {busy && <p className="mt-3 animate-pulse text-sm font-medium" role="status">{busy}</p>}
        {notes.map((n, i) => <p key={i} className="mt-2 text-xs text-ink-soft">AI note: {n}</p>)}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {drafts.length > 0 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-bold">2. Check each item ({drafts.length})</h2>
          {drafts.map((d) => (
            <div key={d.key} className="card grid gap-4 p-4 sm:grid-cols-[140px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.preview} alt="" className="aspect-square w-full rounded-xl object-cover sm:w-[140px]" />
              <div className="grid gap-3 sm:grid-cols-6">
                <div className="sm:col-span-4">
                  <label className="label">Title</label>
                  <input value={d.title} onChange={(e) => update(d.key, { title: e.target.value })} maxLength={80} placeholder="e.g. Queen bed with storage" className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Category</label>
                  <select value={d.category} onChange={(e) => update(d.key, { category: e.target.value })} className="input">
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Brand</label>
                  <input value={d.brand} onChange={(e) => update(d.key, { brand: e.target.value })} placeholder="Optional" className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Condition</label>
                  <select value={d.condition} onChange={(e) => update(d.key, { condition: e.target.value as Condition })} className="input">
                    {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Age (months)</label>
                  <input type="number" min={0} max={240} value={d.ageMonths} onChange={(e) => update(d.key, { ageMonths: Number(e.target.value) })} className="input" />
                </div>
                <div className="sm:col-span-6">
                  <label className="label">Description</label>
                  <textarea value={d.description} onChange={(e) => update(d.key, { description: e.target.value })} rows={2} className="input" placeholder="Size, material, any wear" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Starting price ₹</label>
                  <input type="number" min={50} step={50} value={d.listPrice} onChange={(e) => update(d.key, { listPrice: Number(e.target.value), priceTouched: true })} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Lowest price ₹</label>
                  <input type="number" min={50} step={50} value={d.floorPrice} onChange={(e) => update(d.key, { floorPrice: Number(e.target.value), priceTouched: true })} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Available from</label>
                  <input type="date" min={today} max={leavingDate} value={d.availableFrom} onChange={(e) => update(d.key, { availableFrom: e.target.value })} className="input" />
                </div>
                {d.reasoning && <p className="text-xs text-ink-soft sm:col-span-6">💡 Suggested {inr(d.listPrice)}: {d.reasoning}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={d.stayInPlace} onChange={(e) => update(d.key, { stayInPlace: e.target.checked })} />
                    Stay-in-place (next tenant can buy it where it is)
                  </label>
                  <button type="button" onClick={() => remove(d.key)} className="text-sm font-semibold text-danger">Remove</button>
                </div>
              </div>
            </div>
          ))}
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-white shadow-xl">
            <p className="text-sm">{drafts.length} item{drafts.length > 1 ? "s" : ""} · starting total {inr(drafts.reduce((a, d) => a + d.listPrice, 0))}</p>
            <button type="button" onClick={publish} disabled={!!busy} className="btn bg-tape text-ink">3. Publish to my sale →</button>
          </div>
        </div>
      )}
    </div>
  );
}
