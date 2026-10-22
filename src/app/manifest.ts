import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoveOn: move-out marketplace",
    short_name: "MoveOn",
    description: "Clear your room by your leaving date. Set up your new one in a week.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf6ef",
    theme_color: "#17172b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "I'm leaving", url: "/leaving" },
      { name: "I'm arriving", url: "/arriving" },
    ],
  };
}
