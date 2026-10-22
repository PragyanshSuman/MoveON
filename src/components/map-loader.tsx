"use client";
import dynamic from "next/dynamic";
import type { MapPin } from "./map-view";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="grid h-[70vh] place-items-center rounded-2xl border border-line bg-kraft-soft text-sm text-ink-soft">Loading map…</div>,
});

export function SalesMap({ pins, center }: { pins: MapPin[]; center: [number, number] }) {
  return <MapView pins={pins} center={center} />;
}
