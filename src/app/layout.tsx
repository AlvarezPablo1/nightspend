import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NoZoom } from "@/components/no-zoom";
import { Splash } from "@/components/splash";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nightspend",
  description: "Control personal de gastos",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Nightspend", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e0b14",
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Splash />
        <NoZoom />
        {children}
      </body>
    </html>
  );
}
