import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { Footer, Header } from "@/components/site-chrome";
import { SwRegister } from "@/components/sw-register";
import { housekeeping } from "@/lib/services/selling";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: { default: "MoveOn: clear your room by your leaving date", template: "%s · MoveOn" },
  description:
    "Leaving Bengaluru? List everything in one Move-Out Sale and we guarantee your room is cleared by your date. Arriving? Set up your room in a week with verified, nearby second-hand furniture and appliances.",
  applicationName: "MoveOn",
  appleWebApp: { capable: true, title: "MoveOn", statusBarStyle: "default" },
  openGraph: { type: "website", siteName: "MoveOn", locale: "en_IN" },
};

export const viewport: Viewport = { themeColor: "#17172b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await housekeeping();
  return (
    <html lang="en-IN" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <SwRegister />
      </body>
    </html>
  );
}
