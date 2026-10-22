"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  subtitle: string;
  href: string;
  urgent: boolean;
}

const icon = (label: string, urgent: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-100%);white-space:nowrap;background:${urgent ? "#e2541b" : "#17172b"};color:#fff;font:600 12px system-ui;padding:4px 8px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.25)">${label}</div>`,
    iconSize: [0, 0],
  });

export default function MapView({ pins, center }: { pins: MapPin[]; center: [number, number] }) {
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="h-[70vh] w-full rounded-2xl border border-line" style={{ zIndex: 0 }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p.label, p.urgent)}>
          <Popup>
            <a href={p.href} style={{ fontWeight: 600 }}>{p.title}</a>
            <br />
            {p.subtitle}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
