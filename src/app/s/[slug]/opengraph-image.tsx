// The shareable "Leaving Bengaluru on 30 June" card shown when a sale link is posted on WhatsApp/LinkedIn.
import { ImageResponse } from "next/og";
import { localityName } from "@/lib/catalog";
import { formatDate, inr } from "@/lib/format";
import { saleBySlug } from "@/lib/services/marketplace";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Move-Out Sale on MoveOn";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = saleBySlug(slug, null);
  const available = data?.items.filter((v) => v.item.status === "available") ?? [];
  const from = available.length ? Math.min(...available.map((v) => v.price)) : 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf6ef", color: "#17172b", fontFamily: "sans-serif" }}>
        <div style={{ height: 28, display: "flex", background: "#f6c445" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 72px", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 30, color: "#e2541b", fontWeight: 700 }}>MOVE-OUT SALE</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 16, lineHeight: 1.05 }}>
            {data ? `Leaving ${localityName(data.sale.locality)} on ${formatDate(data.sale.leavingDate, { day: "numeric", month: "long" })}` : "Move-out sale"}
          </div>
          <div style={{ display: "flex", fontSize: 36, marginTop: 24, color: "#4b4b63" }}>
            {data ? `${data.seller.name} · ${available.length} items${from ? ` from ${inr(from)}` : ""} · everything must go` : ""}
          </div>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", background: "#17172b", color: "#f6c445", fontWeight: 800, fontSize: 28, padding: "8px 14px", borderRadius: 12 }}>MO</div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>MoveOn</div>
            <div style={{ display: "flex", fontSize: 26, color: "#4b4b63", marginLeft: 16 }}>Held payments · OTP handover · verified sellers</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
