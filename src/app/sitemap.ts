import type { MetadataRoute } from "next";
import { LOCALITIES } from "@/lib/catalog";
import { read } from "@/lib/db";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const db = read();
  const sales = db.sales.filter((s) => s.status === "active" && s.visibility === "public");
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/browse`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/kits`, changeFrequency: "daily", priority: 0.8 },
    ...LOCALITIES.map((l) => ({ url: `${base}/area/${l.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...db.partners.map((p) => ({ url: `${base}/partners/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...sales.map((s) => ({ url: `${base}/s/${s.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}
