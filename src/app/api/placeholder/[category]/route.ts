// Illustrated placeholder photos for demo listings and items added without a photo.
import { category } from "@/lib/catalog";

const PALETTES = [
  ["#f3e8d6", "#e7d3b3"], ["#dcf2ee", "#b9e3db"], ["#fde9df", "#f8cdb8"], ["#e8e6f6", "#cfcaf0"], ["#fff3cf", "#f8e09a"],
];

export async function GET(req: Request, { params }: { params: Promise<{ category: string }> }) {
  const { category: id } = await params;
  const cat = category(id);
  const v = Number(new URL(req.url).searchParams.get("v") ?? 0) || 0;
  const [a, b] = PALETTES[(cat.label.length + v) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <rect x="0" y="470" width="800" height="130" fill="#17172b" opacity="0.06"/>
  <text x="400" y="330" font-size="220" text-anchor="middle" dominant-baseline="middle">${cat.icon}</text>
  <text x="400" y="535" font-family="system-ui, sans-serif" font-size="34" font-weight="600" fill="#17172b" opacity="0.55" text-anchor="middle">${cat.label}</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400, immutable" } });
}
